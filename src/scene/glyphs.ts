import type { ComputeResult, ExperimentConfigV1, FieldSample, Vec3 } from '../experiment/types';

export interface GlyphStats {
  valid: number; invalid: number; unreliable: number; zero: number; tiny: number; saturated: number;
  maximumLength: number; scale: number; projectedZero: number;
  perpendicularPositive: number; perpendicularNegative: number;
}
export interface GlyphEntry {
  sample: FieldSample;
  state: 'valid' | 'undefined' | 'unreliable';
  vector: Vec3;
  norm: number;
  originalNorm: number;
  perpendicular: number;
  length: number;
  saturated: boolean;
}
export function glyphAxes(plane: ExperimentConfigV1['slice']['plane']): [number, number, number] {
  return plane === 'XY' ? [0, 1, 2] : plane === 'XZ' ? [0, 2, 1] : [1, 2, 0];
}
/** Scale before normalizing so even subnormal components retain their direction. */
export function normalizedDirection(vector: Vec3): Vec3 | null {
  if (!vector.every(Number.isFinite)) return null;
  const maximum = Math.max(...vector.map(Math.abs));
  if (maximum === 0) return null;
  const scaled = vector.map(value => value / maximum) as Vec3;
  const length = Math.hypot(...scaled);
  return scaled.map(value => value / length) as Vec3;
}
/** The renderer and textual legend use the very same sampled projection. */
export function glyphSamplesFor(config: ExperimentConfigV1, result: ComputeResult): FieldSample[] {
  if (!config.layers.cut) return result.samples.filter(sample => sample.point.every(Number.isFinite));
  const [u, v, n] = glyphAxes(config.slice.plane);
  const [min, max] = config.domain;
  const grid = new Map<string, FieldSample>();
  for (const sample of result.slice) {
    if (!sample.point.every(Number.isFinite)) continue;
    const planeTolerance = 32 * Number.EPSILON * Math.max(1, Math.abs(sample.point[n]), Math.abs(config.slice.position));
    if (Math.abs(sample.point[n] - config.slice.position) > planeTolerance) continue;
    const i = (sample.point[u] - min[u]) / (max[u] - min[u]) * (config.slice.resolution - 1);
    const j = (sample.point[v] - min[v]) / (max[v] - min[v]) * (config.slice.resolution - 1);
    if (i < -1e-5 || j < -1e-5 || i > config.slice.resolution - 1 + 1e-5 || j > config.slice.resolution - 1 + 1e-5 || Math.abs(i - Math.round(i)) > 1e-5 || Math.abs(j - Math.round(j)) > 1e-5) continue;
    grid.set(`${Math.round(i)},${Math.round(j)}`, sample);
  }
  const samples: FieldSample[] = [];
  for (let i = 0; i < config.resolution; i++) for (let j = 0; j < config.resolution; j++) {
    const sample = grid.get(`${Math.round(i * (config.slice.resolution - 1) / (config.resolution - 1))},${Math.round(j * (config.slice.resolution - 1) / (config.resolution - 1))}`);
    if (sample) samples.push(sample);
  }
  return samples;
}
export function glyphEntries(config: ExperimentConfigV1, result: ComputeResult): { entries: GlyphEntry[]; stats: GlyphStats } {
  const [min, max] = config.domain;
  const spacing = Math.min(...max.map((value, i) => (value - min[i]) / (config.resolution - 1)));
  const scale = config.layers.vectors === 'curl' ? config.scales.curl : config.scales.field;
  const stats: GlyphStats = { valid: 0, invalid: 0, unreliable: 0, zero: 0, tiny: 0, saturated: 0, maximumLength: spacing * .8, scale, projectedZero: 0, perpendicularPositive: 0, perpendicularNegative: 0 };
  const normal = glyphAxes(config.slice.plane)[2];
  const entries = glyphSamplesFor(config, result).map(sample => {
    const entry: GlyphEntry = { sample, state: 'undefined', vector: [0, 0, 0], norm: 0, originalNorm: 0, perpendicular: 0, length: 0, saturated: false };
    const derivative = sample.derivative;
    const data = config.layers.vectors === 'curl' ? derivative : sample.evaluation;
    if (!data.valid) { stats.invalid++; return entry; }
    if (config.layers.vectors === 'curl' && derivative.valid && !derivative.reliable) { entry.state = 'unreliable'; stats.unreliable++; return entry; }
    const components: Vec3 = 'curl' in data ? [...data.curl] : [...(data as { vector: Vec3 }).vector];
    if (!components.every(Number.isFinite)) { stats.invalid++; return entry; }
    entry.originalNorm = Math.hypot(...components);
    if (!Number.isFinite(entry.originalNorm)) { stats.invalid++; return entry; }
    entry.state = 'valid'; stats.valid++;
    if (entry.originalNorm === 0) { stats.zero++; return entry; }
    if (config.layers.cut) {
      entry.perpendicular = components[normal]; components[normal] = 0;
      if (entry.perpendicular > 0) stats.perpendicularPositive++;
      else if (entry.perpendicular < 0) stats.perpendicularNegative++;
    }
    entry.vector = components; entry.norm = Math.hypot(...components);
    if (entry.norm === 0) { stats.projectedZero++; return entry; }
    const trueLength = config.scales.directionOnly ? spacing * .48 : entry.norm * scale;
    entry.saturated = trueLength > stats.maximumLength;
    entry.length = Math.min(trueLength, stats.maximumLength);
    if (entry.saturated) stats.saturated++;
    if (entry.length < spacing * .018) stats.tiny++;
    return entry;
  });
  return { entries, stats };
}
export function glyphStats(config: ExperimentConfigV1, result: ComputeResult): GlyphStats { return glyphEntries(config, result).stats; }
