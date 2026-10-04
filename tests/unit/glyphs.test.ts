import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { ComputeResult, ExperimentConfigV1, FieldSample, Vec3 } from '../../src/experiment/types';
import { glyphEntries, glyphSamplesFor, glyphStats } from '../../src/scene/glyphs';

function sample(vector: Vec3, point: Vec3 = [0, 0, 0], curl: Vec3 = [0, 0, 2], reliable = true): FieldSample {
  return { point, evaluation: { valid: true, vector, norm: Math.hypot(...vector) }, derivative: { valid: true, jacobian: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], divergence: 0, curl, method: 'finite', error: 0, reliable } };
}
function result(config: ExperimentConfigV1, samples: FieldSample[], slice = samples): ComputeResult {
  return { revision: 1, config, samples, slice, lines: [], stats: { valid: samples.length, invalid: 0, zeros: 0, fieldMs: 0, linesMs: 0, partial: false, inactiveSeeds: 0 } };
}
describe('shared glyph geometry and legend', () => {
  it('caps huge finite vectors without squared-norm overflow', () => {
    const config = defaultConfig();
    const rendered = glyphEntries(config, result(config, [sample([1e200, 1e200, 0])]));
    expect(rendered.stats).toMatchObject({ valid: 1, invalid: 0, zero: 0, saturated: 1, tiny: 0 });
    const entry = rendered.entries[0];
    expect(entry.originalNorm).toBeCloseTo(Math.SQRT2 * 1e200, -186);
    expect(entry.length).toBeCloseTo(.6, 14);
    expect(entry.vector.map(value => value / entry.norm).every(Number.isFinite)).toBe(true);
  });
  it('retains tiny nonzero vectors without assigning a zero or artificial minimum length', () => {
    const config = defaultConfig();
    const rendered = glyphEntries(config, result(config, [sample([1e-200, 0, 0]), sample([Number.MIN_VALUE, 0, 0])]));
    expect(rendered.stats).toMatchObject({ valid: 2, invalid: 0, zero: 0, tiny: 2, saturated: 0 });
    expect(rendered.entries[0].norm).toBe(1e-200);
    expect(rendered.entries[0].length / 1e-201).toBeCloseTo(1, 14);
    expect(rendered.entries.every(entry => entry.vector.map(value => value / entry.norm).every(Number.isFinite))).toBe(true);
  });
  it('counts a purely perpendicular field separately from a genuine zero', () => {
    const config = defaultConfig(); config.layers.cut = true;
    const stats = glyphStats(config, result(config, [], [sample([0, 0, 2]), sample([0, 0, 0], [-3, -3, 0]), sample([0, 0, -1], [3, 3, 0])]));
    expect(stats).toMatchObject({ valid: 3, zero: 1, projectedZero: 2, perpendicularPositive: 1, perpendicularNegative: 1, saturated: 0, tiny: 0 });
  });
  it('uses projected magnitude for arrow length, preserving the full norm for scalar data', () => {
    const config = defaultConfig(); config.layers.cut = true;
    const data = glyphEntries(config, result(config, [], [sample([3, 4, 1e200])]));
    expect(data.stats.saturated).toBe(0);
    expect(data.entries[0]).toMatchObject({ vector: [3, 4, 0], norm: 5, length: .5, perpendicular: 1e200 });
    expect(data.entries[0].originalNorm).toBe(1e200);
  });
  it('projects the curl independently and excludes unreliable derivative vectors', () => {
    const config = defaultConfig(); config.layers.cut = true; config.layers.vectors = 'curl';
    const data = glyphEntries(config, result(config, [], [sample([5, 4, 3], [0, 0, 0], [0, 0, 2]), sample([1, 0, 0], [3, 3, 0], [1, 0, 0], false)]));
    expect(data.stats).toMatchObject({ valid: 1, unreliable: 1, invalid: 0, zero: 0, projectedZero: 1, perpendicularPositive: 1 });
    expect(data.entries[1].state).toBe('unreliable');
  });
  it('uses actual available grid cells in arbitrary order, without inventing undefined samples', () => {
    const config = defaultConfig(); config.layers.cut = true;
    const a = sample([1, 0, 0], [-3, -3, 0]); const b = sample([1, 0, 0], [3, 3, 0]);
    const offPlane = sample([1, 0, 0], [0, 0, 1]); const offGrid = sample([1, 0, 0], [.123, .456, 0]);
    expect(glyphSamplesFor(config, result(config, [], [b, offGrid, offPlane, a]))).toEqual([a, b]);
    expect(glyphStats(config, result(config, [], []))).toMatchObject({ valid: 0, invalid: 0, zero: 0 });
  });
  it('does not turn undefined or non-finite data into geometric zeros', () => {
    const config = defaultConfig();
    const undefinedSample: FieldSample = { ...sample([0, 0, 0]), evaluation: { valid: false, reason: 'undefined', message: 'Fuera del dominio natural' } };
    expect(glyphStats(config, result(config, [undefinedSample, sample([Infinity, 0, 0])]))).toMatchObject({ valid: 0, invalid: 2, zero: 0 });
  });
});

it('preserves exact direction at subnormal and large component scales',async()=>{
 const {normalizedDirection}=await import('../../src/scene/glyphs');
 for(const factor of [Number.MIN_VALUE,1e-200,1,1e200]){const direction=normalizedDirection([factor,factor,factor])!;direction.forEach(v=>expect(v).toBeCloseTo(1/Math.sqrt(3),14));expect(Math.hypot(...direction)).toBeCloseTo(1,14)}
 const direction=normalizedDirection([2*Number.MIN_VALUE,2*Number.MIN_VALUE,Number.MIN_VALUE])!;expect(direction).toEqual([2/3,2/3,1/3]);expect(normalizedDirection([0,0,0])).toBeNull();expect(normalizedDirection([Infinity,0,0])).toBeNull();
});
