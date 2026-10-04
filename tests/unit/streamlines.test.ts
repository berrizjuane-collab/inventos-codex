import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { EvaluationResult, ExperimentConfigV1, StreamBranch, Vec3 } from '../../src/experiment/types';
import { prepareField } from '../../src/math/engine';
import { integrateBranch, integrateBranchSteps, integrateStreamline } from '../../src/numerics/streamlines';

const evidence: Record<string, unknown> = {};
const separation = (a: Vec3, b: Vec3): number => Math.hypot(...a.map((value, axis) => value - b[axis]));
const diagonal = (config: ExperimentConfigV1): number => separation(...config.domain);
const field = (vector: (p: Vec3) => Vec3) => (point: Vec3): EvaluationResult => {
  const value = vector(point);
  return { valid: true, vector: value, norm: Math.hypot(...value) };
};
const rotation = field(([x, y]) => [-y, x, 0]);
const helix = (a: number) => field(([x, y]) => [-y, x, a]);
const uniform = field(() => [1, 0, 0]);
const last = (branch: StreamBranch): Vec3 => branch.positions[branch.positions.length - 1];

function settings(): ExperimentConfigV1 {
  const config = defaultConfig();
  config.numerics.closeLoops = false;
  return config;
}

afterAll(() => {
  const target = process.env.STREAMLINE_EVIDENCE_PATH;
  if (target) writeFileSync(target, JSON.stringify({ method: 'Normalized classical RK4; adaptive two-half-step acceptance with Richardson estimate /15', ...evidence }, null, 2) + '\n');
});

describe('N01 · RK4 normalizado y referencias analíticas', () => {
  it('uniforme: ambas ramas llegan a las caras correctas y conservan las coordenadas transversales', () => {
    const config = settings();
    config.fieldId = 'uniform';
    config.components = ['1', '0', '0'];
    const seed: Vec3 = [0.37, -0.64, 1.29];
    const line = integrateStreamline(prepareField(config).evaluate, seed, config);
    expect(line.forward.reason).toBe('boundary');
    expect(line.backward.reason).toBe('boundary');
    expect(last(line.forward)[0]).toBeCloseTo(3, 10);
    expect(last(line.backward)[0]).toBeCloseTo(-3, 10);
    let error = 0;
    for (const branch of [line.forward, line.backward]) {
      for (const point of branch.positions) {
        error = Math.max(error, Math.hypot(point[1] - seed[1], point[2] - seed[2]));
        expect(point.every((value, axis) => value >= config.domain[0][axis] && value <= config.domain[1][axis])).toBe(true);
      }
    }
    expect(error).toBeLessThanOrEqual(1e-10 * diagonal(config));
    evidence.uniform = { perpendicularError: error, forwardEndpoint: last(line.forward), backwardEndpoint: last(line.backward), stops: [line.forward.reason, line.backward.reason] };
  });

  it('rotacional: una vuelta exacta con 128 pasos fijos tiene error ≤1e-6', () => {
    const config = settings();
    const branch = integrateBranch(prepareField(config).evaluate, [1, 0, 0], config, 1, { fixedStep: 2 * Math.PI / 128, maxLength: 2 * Math.PI });
    const error = separation(last(branch), [1, 0, 0]);
    expect(branch.reason).toBe('max-length');
    expect(branch.accepted).toBe(128);
    expect(error).toBeLessThanOrEqual(1e-6);
    for (const [x, y, z] of branch.positions) {
      expect(Math.abs(Math.hypot(x, y) - 1)).toBeLessThan(1e-6);
      expect(z).toBe(0);
    }
    evidence.rotation128 = { error, accepted: branch.accepted, length: branch.length, endpoint: last(branch) };
  });

  it('hélice: error y cocientes 32/64/128 compatibles con orden cuatro', () => {
    const config = settings();
    config.domain = [[-3, -3, -8], [3, 3, 8]];
    const length = 2 * Math.PI * Math.SQRT2;
    const errors = [32, 64, 128].map((steps) => {
      const branch = integrateBranch(helix(1), [1, 0, 0], config, 1, { fixedStep: length / steps, maxLength: length });
      expect(branch.reason).toBe('max-length');
      expect(branch.accepted).toBe(steps);
      for (const [x, y, z] of branch.positions) {
        expect(Math.abs(Math.hypot(x, y) - 1)).toBeLessThan(1e-4);
        expect(z).toBeGreaterThanOrEqual(0);
      }
      return separation(last(branch), [1, 0, 2 * Math.PI]);
    });
    const ratios = [errors[0] / errors[1], errors[1] / errors[2]];
    expect(errors[2]).toBeLessThanOrEqual(1e-6);
    ratios.forEach((ratio) => { expect(ratio).toBeGreaterThanOrEqual(12); expect(ratio).toBeLessThanOrEqual(20); });
    const negative = integrateBranch(helix(-1), [1, 0, 0], config, 1, { fixedStep: length / 128, maxLength: length });
    const backward = integrateBranch(helix(1), [1, 0, 0], config, -1, { fixedStep: length / 128, maxLength: length });
    expect(separation(last(negative), [1, 0, -2 * Math.PI])).toBeLessThanOrEqual(1e-6);
    expect(separation(last(backward), [1, 0, -2 * Math.PI])).toBeLessThanOrEqual(1e-6);
    evidence.helix = { steps: [32, 64, 128], errors, ratios, length, negativeAError: separation(last(negative), [1, 0, -2 * Math.PI]), backwardError: separation(last(backward), [1, 0, -2 * Math.PI]) };
  });

  it('adaptativo: geometría acotada y mejora al reducir tolerancias diez veces', () => {
    const config = settings();
    const radius = 0.25;
    const length = 2 * Math.PI * radius;
    const run = () => integrateBranch(rotation, [radius, 0, 0], config, 1, { maxLength: length });
    const normal = run();
    config.numerics.atolFactor /= 10;
    config.numerics.rtol /= 10;
    const tighter = run();
    const errors = [normal, tighter].map((branch) => separation(last(branch), [radius, 0, 0]));
    const geometry = [normal, tighter].map((branch) => Math.max(...branch.positions.map(([x, y, z]) => Math.hypot(Math.hypot(x, y) - radius, z))));
    expect(errors[0]).toBeLessThanOrEqual(1e-4 * diagonal(config));
    expect(errors[1]).toBeLessThan(errors[0]);
    geometry.forEach((error) => expect(error).toBeLessThanOrEqual(1e-4 * diagonal(config)));
    expect(geometry[1]).toBeLessThan(geometry[0]);
    evidence.adaptive = { radius, length, endpointErrors: errors, maximumGeometryErrors: geometry, accepted: [normal.accepted, tighter.accepted], rejected: [normal.rejected, tighter.rejected] };
  });

  it('radiales: colinealidad; silla: z e invariante xy', () => {
    const config = settings();
    const seed: Vec3 = [0.4, 0.7, 1.1];
    let radialError = 0;
    for (const sign of [1, -1]) {
      const radial = field((p) => p.map((value) => sign * value) as Vec3);
      for (const direction of [1, -1] as const) {
        const branch = integrateBranch(radial, seed, config, direction, { maxLength: 0.5 });
        for (const [x, y, z] of branch.positions) {
          radialError = Math.max(radialError, Math.hypot(y * seed[2] - z * seed[1], z * seed[0] - x * seed[2], x * seed[1] - y * seed[0]));
        }
      }
    }
    expect(radialError).toBeLessThanOrEqual(1e-10 * diagonal(config));
    const saddleSeed: Vec3 = [0.8, 0.6, 0.4];
    const line = integrateStreamline(field(([x, y]) => [x, -y, 0]), saddleSeed, config, { maxLength: 2 });
    let invariantError = 0;
    for (const branch of [line.forward, line.backward]) {
      for (const [x, y, z] of branch.positions) {
        invariantError = Math.max(invariantError, Math.abs(x * y - saddleSeed[0] * saddleSeed[1]));
        expect(z).toBe(saddleSeed[2]);
      }
    }
    expect(invariantError).toBeLessThanOrEqual(1e-4 * diagonal(config));
    evidence.invariants = { radialCrossProductError: radialError, saddleProductError: invariantError };
  });
});

describe('N01 · fronteras, cierres, estados y presupuestos', () => {
  it('refina fronteras sin almacenar puntos o segmentos exteriores, incluso con etapa indefinida fuera', () => {
    const config = settings();
    const bounded = (point: Vec3): EvaluationResult => point[0] > 3 ? { valid: false, reason: 'undefined', message: 'Fuera del dominio natural' } : uniform(point);
    const branch = integrateBranch(bounded, [2.95, 1, -2], config, 1, { fixedStep: 0.2 });
    expect(branch.reason).toBe('boundary');
    expect(last(branch)[0]).toBeCloseTo(3, 10);
    expect(branch.positions.every(([x]) => x <= 3)).toBe(true);
    const zeroOutside = field(([x]) => x > 3 ? [0, 0, 0] : [1, 0, 0]);
    expect(integrateBranch(zeroOutside, [2.95, 0, 0], config, 1, { fixedStep: 0.2 }).reason).toBe('boundary');
    const outward = integrateBranch(uniform, [3, 0, 0], config, 1);
    expect(outward).toMatchObject({ reason: 'boundary', accepted: 0, positions: [[3, 0, 0]] });
  });

  it('un cierre exige al menos 20 pasos y tangentes compatibles, y no duplica el circuito', () => {
    const config = settings();
    config.numerics.closeLoops = true;
    const line = integrateStreamline(rotation, [1, 0, 0], config);
    expect(line.closed).toBe(true);
    expect(line.forward.reason).toBe('closed');
    expect(line.forward.accepted).toBeGreaterThanOrEqual(20);
    expect(last(line.forward)).toEqual([1, 0, 0]);
    expect(line.backward).toMatchObject({ positions: [], reason: 'closed', accepted: 0, direction: -1 });
    expect(line.forward.length).toBeGreaterThan(5.9);
    expect(line.forward.length).toBeLessThan(6.7);
    // A very short prescribed interval cannot be treated as a closed circuit near its seed.
    expect(integrateBranch(rotation, [1, 0, 0], config, 1, { fixedStep: 0.001, maxLength: 0.03 }).reason).toBe('max-length');
  });

  it('la proximidad con tangente opuesta no cierra prematuramente una elipse estrecha', () => {
    const config = settings();
    config.numerics.closeLoops = true;
    const narrowEllipse = field(([x, y]) => [-y / 0.02, 0.02 * x, 0]);
    // At the opposite side (0,-0.02), the line is close to the seed but points the other way.
    const branch = integrateBranch(narrowEllipse, [0, 0.02, 0], config, 1, { maxLength: 8 });
    expect(branch.reason).toBe('closed');
    expect(branch.accepted).toBeGreaterThanOrEqual(20);
    expect(branch.length).toBeGreaterThan(3.5);
    expect(branch.length).toBeLessThan(4.5);
    evidence.narrowEllipse = { length: branch.length, accepted: branch.accepted, rejected: branch.rejected, reason: branch.reason };
  });

  it('semillas exteriores, ceros y magnitudes pequeñas quedan diferenciadas', () => {
    const config = settings();
    expect(integrateBranch(uniform, [3.1, 0, 0], config, 1)).toMatchObject({ positions: [], reason: 'outside', accepted: 0 });
    expect(integrateBranch(rotation, [0, 0, 2], config, 1)).toMatchObject({ positions: [[0, 0, 2]], reason: 'zero', accepted: 0 });
    expect(integrateBranch(field(() => [1e-12, 0, 0]), [0, 0, 0], config, 1).reason).toBe('zero');
    expect(integrateBranch(uniform, [NaN, 0, 0], config, 1).reason).toBe('outside');
  });

  it('no une una región inválida ni convierte no finito/complejo en cero', () => {
    const config = settings();
    const invalid = (point: Vec3): EvaluationResult => point[0] >= 0.25 ? { valid: false, reason: 'undefined', message: 'Hueco' } : uniform(point);
    const branch = integrateBranch(invalid, [0, 0, 0], config, 1, { fixedStep: 0.1 });
    expect(branch.reason).toBe('undefined');
    expect(branch.positions.every(([x]) => x < 0.25)).toBe(true);
    for (const reason of ['complex', 'non-finite'] as const) {
      expect(integrateBranch(() => ({ valid: false, reason, message: reason }), [0, 0, 0], config, 1).reason).toBe('undefined');
    }
    expect(integrateBranch(() => { throw new Error('domain'); }, [0, 0, 0], config, 1).reason).toBe('undefined');
    expect(integrateBranch(field(() => [Infinity, 0, 0]), [0, 0, 0], config, 1).reason).toBe('undefined');
  });

  it('un cero en una etapa detiene la rama antes de normalizarlo', () => {
    const config = settings();
    const zeroAtStage = field(([x]) => x === 0.05 ? [0, 0, 0] : [1, 0, 0]);
    expect(integrateBranch(zeroAtStage, [0, 0, 0], config, 1, { fixedStep: 0.1 })).toMatchObject({ reason: 'zero', accepted: 0, positions: [[0, 0, 0]] });
  });

  it('longitud, pasos, vértices, tiempo y cancelación tienen motivos distintos', () => {
    const config = settings();
    expect(integrateBranch(uniform, [0, 0, 0], config, 1, { maxLength: 0.02 })).toMatchObject({ reason: 'max-length', length: 0.02 });
    config.numerics.maxSteps = 1;
    expect(integrateBranch(uniform, [0, 0, 0], config, 1).reason).toBe('max-steps');
    config.numerics.maxSteps = 1500;
    for (const limit of [0, 1, 2, 4]) {
      const line = integrateStreamline(uniform, [0, 0, 0], config, { maxVertices: limit });
      expect(line.forward.reason).toBe('vertices');
      expect(line.backward.reason).toBe('vertices');
      expect(line.forward.positions.length + line.backward.positions.length).toBeLessThanOrEqual(limit);
    }
    expect(integrateBranch(uniform, [0, 0, 0], config, 1, { deadline: performance.now() - 1 }).reason).toBe('time');
    expect(integrateBranch(uniform, [0, 0, 0], config, 1, { cancelled: () => true }).reason).toBe('cancelled');
  });

  it('el paso mínimo se distingue de las regiones indefinidas y de otros presupuestos', () => {
    const config = settings();
    config.numerics.minStepFactor = 0.01;
    config.numerics.stepFactor = 0.01;
    config.numerics.atolFactor = 1e-16;
    config.numerics.rtol = 1e-16;
    expect(integrateBranch(rotation, [0.1, 0, 0], config, 1)).toMatchObject({ reason: 'min-step', accepted: 0, rejected: 1 });
    expect(integrateBranch(uniform, [1, 0, 0], settings(), 1, { fixedStep: Number.MIN_VALUE }).reason).toBe('min-step');
  });

  it('el iterador permite al worker atender cancelación entre intentos', () => {
    const config = settings();
    let cancelled = false;
    const iterator = integrateBranchSteps(uniform, [0, 0, 0], config, 1, { cancelled: () => cancelled });
    expect(iterator.next().done).toBe(false);
    cancelled = true;
    const final = iterator.next();
    expect(final.done).toBe(true);
    expect(final.value).toMatchObject({ reason: 'cancelled', accepted: 0 });
    const cancellingEvaluation = (point: Vec3): EvaluationResult => { cancelled = true; return uniform(point); };
    cancelled = false;
    expect(integrateBranch(cancellingEvaluation, [0, 0, 0], config, 1, { cancelled: () => cancelled }).reason).toBe('cancelled');
  });
});
