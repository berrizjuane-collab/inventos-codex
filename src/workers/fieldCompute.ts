import { parse } from 'mathjs';
import { validateComponents } from '../math/engine';
import type { Components, ComputeResult, ExperimentConfigV1, FieldSample, Vec3 } from '../experiment/types';
import { sliceActive, type FieldBuffers } from './protocol';
import { yieldToMessages } from './yieldControl';

export interface SamplingOptions {
  cancelled?: () => boolean;
  now?: () => number;
  yieldControl?: () => Promise<void>;
  budgetMs?: number;
  startedAt?: number;
  blockMs?: number;
}
export function formatEquationTex(components: Components): Components | undefined {
  if (!validateComponents(components).ok) return undefined;
  try {
    return components.map(expression => parse(expression).toTex({ parenthesis: 'keep', implicit: 'show' })) as Components;
  } catch { return undefined; }
}

export interface GridOutput { result: ComputeResult; buffers: FieldBuffers }

/** An odd regular lattice includes both faces and its midpoint exactly. */
export function gridCoordinates(config: ExperimentConfigV1): [number[], number[], number[]] {
  return config.domain[0].map((lower, axis) => Array.from({ length: config.resolution }, (_, i) => {
    if (i === 0) return lower;
    if (i === config.resolution - 1) return config.domain[1][axis];
    return lower + (config.domain[1][axis] - lower) * i / (config.resolution - 1);
  })) as [number[], number[], number[]];
}

/** Slice samples retain all 3D components and 3D derivatives; only the location is planar. */
export function* slicePoints(config: ExperimentConfigV1): Generator<Vec3> {
  const fixed = config.slice.plane === 'XY' ? 2 : config.slice.plane === 'XZ' ? 1 : 0;
  const axes = [0, 1, 2].filter(axis => axis !== fixed);
  const count = config.slice.resolution;
  const coordinate = (axis: number, index: number) => index === count - 1
    ? config.domain[1][axis]
    : config.domain[0][axis] + (config.domain[1][axis] - config.domain[0][axis]) * index / (count - 1);
  for (let i = 0; i < count; i++) for (let j = 0; j < count; j++) {
    const point: Vec3 = [0, 0, 0];
    point[fixed] = config.slice.position;
    point[axes[0]] = coordinate(axes[0], i);
    point[axes[1]] = coordinate(axes[1], j);
    yield point;
  }
}

function finiteSample(evaluated: FieldSample): FieldSample {
  const evaluation = evaluated.evaluation;
  if (evaluation.valid && (!evaluation.vector.every(Number.isFinite) || !Number.isFinite(evaluation.norm))) {
    return { ...evaluated, evaluation: { valid: false, reason: 'non-finite', message: 'Resultado no finito descartado antes de la representación.' }, derivative: { valid: false, method: 'unavailable', message: 'El campo no produce valores finitos.' } };
  }
  const derivative = evaluated.derivative;
  if (derivative.valid && ![...derivative.jacobian.flat(), derivative.divergence, ...derivative.curl, derivative.error].every(Number.isFinite)) {
    return { ...evaluated, derivative: { valid: false, method: 'unavailable', message: 'La derivada no produce valores reales finitos.' } };
  }
  return evaluated;
}

/** Sampling work cooperatively yields messages and conserves its full-precision CPU samples. */
export async function computeFieldGrid(
  config: ExperimentConfigV1,
  revision: number,
  sample: (point: Vec3) => FieldSample,
  options: SamplingOptions = {},
): Promise<GridOutput | null> {
  const now = options.now ?? (() => performance.now());
  const startedAt = options.startedAt ?? now();
  const budgetMs = options.budgetMs ?? 2_000;
  const blockMs = Math.min(options.blockMs ?? 16, 50);
  const cancelled = options.cancelled ?? (() => false);
  const yieldControl = options.yieldControl ?? yieldToMessages;
  const coordinates = gridCoordinates(config);
  const total = config.resolution ** 3;
  const sliceTotal = sliceActive(config) ? config.slice.resolution ** 2 : 0;
  const positions = new Float64Array(total * 3);
  const vectors = new Float64Array(total * 3);
  const validity = new Uint8Array(total);
  const samples: FieldSample[] = [], slice: FieldSample[] = [];
  let valid = 0, invalid = 0, zeros = 0, partial = false, processed = 0, blockStart = now();
  function* points(): Generator<{ point: Vec3; cut: boolean }> {
    for (const x of coordinates[0]) for (const y of coordinates[1]) for (const z of coordinates[2]) yield { point: [x, y, z], cut: false };
    if (sliceTotal) for (const point of slicePoints(config)) yield { point, cut: true };
  }
  for (const { point, cut } of points()) {
    if (cancelled()) return null;
    if (now() - startedAt >= budgetMs) { partial = true; break; }
    const value = finiteSample(sample(point));
    if (cut) slice.push(value);
    else {
      const index = samples.length;
      positions.set(point, index * 3);
      if (value.evaluation.valid) {
        vectors.set(value.evaluation.vector, index * 3);
        validity[index] = 2; valid++;
        if (value.evaluation.norm === 0) zeros++;
      } else { validity[index] = 1; invalid++; }
      samples.push(value);
    }
    processed++;
    if (now() - blockStart >= blockMs || processed % 64 === 0) {
      await yieldControl();
      if (cancelled()) return null;
      blockStart = now();
    }
  }
  if (cancelled()) return null;
  const inactiveSeeds = config.seeds.filter(point => point.some((value, axis) => value < config.domain[0][axis] || value > config.domain[1][axis])).length;
  return {
    result: {
      revision, config, samples, slice, lines: [], equationTex: formatEquationTex(config.components),
      stats: { valid, invalid, zeros, fieldMs: now() - startedAt, linesMs: 0, partial, inactiveSeeds,
        ...(partial ? { message: `Cálculo parcial: ${samples.length} de ${total} muestras${sliceTotal ? `; corte ${slice.length} de ${sliceTotal}` : ''}; presupuesto de ${budgetMs / 1_000} s alcanzado.` } : {}),
      },
    },
    buffers: { positions, vectors, validity },
  };
}
