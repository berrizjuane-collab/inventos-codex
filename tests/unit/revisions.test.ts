import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import { analyticSample } from '../../src/math/catalog';
import type { FieldSample, Vec3 } from '../../src/experiment/types';
import { computeFieldGrid, gridCoordinates, formatEquationTex } from '../../src/workers/fieldCompute';
import { fieldComputeKey, RevisionGate, shouldPublishRevision, withVisualConfig } from '../../src/workers/protocol';

describe('coherent publication and deliberately delayed revisions', () => {
  it('discards older results arriving after the newest request or after publication', () => {
    const gate = new RevisionGate();
    const first = gate.next(), second = gate.next(), third = gate.next();
    const published: number[] = [];
    // The oldest computation finishes last; only revision 3 can become applied.
    for (const reply of [second, third, first, second]) if (gate.accepts(reply)) published.push(reply);
    expect(published).toEqual([third]);
    expect(shouldPublishRevision(gate.current(), first)).toBe(false);
    expect(shouldPublishRevision(gate.current(), third)).toBe(true);
  });
  it('invalidates a delayed response even before the next one has completed', () => {
    const gate = new RevisionGate();
    const old = gate.next();
    gate.next();
    expect(gate.accepts(old)).toBe(false);
  });
  it('camera, inspector, scales and visibility preserve the sampling identity', () => {
    const config = defaultConfig(), changed = structuredClone(config);
    changed.camera.position = [1, 2, 3]; changed.inspected = [.31, .52, .83];
    changed.layers.arrows = false; changed.layers.vectors = 'curl'; changed.layers.axes = false;
    changed.scales.field = 8; changed.scales.directionOnly = true;
    expect(fieldComputeKey(changed)).toBe(fieldComputeKey(config));
  });
  it('expression, parameters, domain, density and differentiation each invalidate sampling', () => {
    const config = defaultConfig();
    const changes = [
      (c: typeof config) => { c.components[0] = 'x'; },
      (c: typeof config) => { c.parameters.a = { value: 2, min: -3, max: 3, step: .1 }; },
      (c: typeof config) => { c.domain[1][0] = 4; },
      (c: typeof config) => { c.resolution = 13; },
      (c: typeof config) => { c.numerics.derivativeMethod = 'finite'; },
      (c: typeof config) => { c.numerics.eta = 1e-5; },
      (c: typeof config) => { c.parameters.a = { value: 1, min: -5, max: 5, step: .2 }; },
    ];
    for (const change of changes) {
      const changed = structuredClone(config); change(changed);
      expect(fieldComputeKey(changed)).not.toBe(fieldComputeKey(config));
    }
  });
  it('presentation merging preserves applied equations and domain while a different field is pending', () => {
    const applied = defaultConfig(), pending = structuredClone(applied);
    pending.fieldId = 'outward'; pending.components = ['x', 'y', 'z']; pending.domain = [[-2, -2, -2], [2, 2, 2]];
    pending.layers.arrows = false; pending.camera.position = [4, 5, 6]; pending.inspected = [.12, .23, .34];
    const merged = withVisualConfig(applied, pending);
    expect(merged.fieldId).toBe('rotation'); expect(merged.components).toEqual(['-y', 'x', '0']);
    expect(merged.domain).toEqual(applied.domain); expect(merged.layers.arrows).toBe(false);
    expect(merged.inspected).toEqual(pending.inspected); expect(merged.camera).toEqual(pending.camera);
    expect(applied.layers.arrows).toBe(true);
  });
});

describe('cooperative field sampling', () => {
  it('includes exact domain extremes and centre with reproducible sample counts', async () => {
    const config = defaultConfig(); config.resolution = 5;
    expect(gridCoordinates(config)).toEqual([[-3, -1.5, 0, 1.5, 3], [-3, -1.5, 0, 1.5, 3], [-3, -1.5, 0, 1.5, 3]]);
    const output = await computeFieldGrid(config, 7, p => analyticSample(config, p));
    expect(output!.result.revision).toBe(7); expect(output!.result.config).toBe(config);
    expect(output!.result.samples).toHaveLength(125); expect(output!.result.samples[0].point).toEqual([-3, -3, -3]);
    expect(output!.result.samples.at(-1)!.point).toEqual([3, 3, 3]);
    expect(output!.result.stats).toMatchObject({ valid: 125, invalid: 0, zeros: 5, partial: false });
    expect(output!.buffers.validity.every(value => value === 2)).toBe(true);
  });
  it('yields and observes cancellation before continuing an obsolete grid', async () => {
    const config = defaultConfig(); config.resolution = 21;
    let cancelled = false, evaluated = 0, yields = 0;
    const output = await computeFieldGrid(config, 1, p => { evaluated++; return analyticSample(config, p); }, {
      now: () => 0, cancelled: () => cancelled,
      yieldControl: async () => { yields++; cancelled = true; },
    });
    expect(output).toBeNull(); expect(yields).toBe(1); expect(evaluated).toBe(64);
  });
  it('bounds the block duration even when samples are slower than the sample-count limit', async () => {
    const config = defaultConfig(); config.resolution = 21;
    let clock = 0, cancelled = false, evaluated = 0;
    const output = await computeFieldGrid(config, 1, p => { evaluated++; clock += 9; return analyticSample(config, p); }, {
      now: () => clock, cancelled: () => cancelled, yieldControl: async () => { cancelled = true; },
    });
    expect(output).toBeNull(); expect(evaluated).toBe(2); expect(clock).toBe(18);
    expect(clock).toBeLessThan(100);
  });
  it('reports the time budget and uncomputed mask without inventing invalid or zero samples', async () => {
    const config = defaultConfig(); config.resolution = 5;
    let clock = 0;
    const output = await computeFieldGrid(config, 4, p => { clock += 100; return analyticSample(config, p); }, { now: () => clock, budgetMs: 200, yieldControl: async () => {} });
    expect(output!.result.stats.partial).toBe(true); expect(output!.result.samples).toHaveLength(2);
    expect(output!.result.stats.valid).toBe(2); expect(output!.result.stats.invalid).toBe(0);
    expect(output!.result.stats.message).toContain('2 de 125');
    expect([...output!.buffers.validity.slice(0, 4)]).toEqual([2, 2, 0, 0]);
  });
  it('preserves Float64 values and omits invalid vectors from transferable GPU data', async () => {
    const config = defaultConfig(); config.resolution = 5;
    const exact = .12345678901234567;
    const output = await computeFieldGrid(config, 1, p => ({
      point: p,
      evaluation: p[0] < 0 ? { valid: false, reason: 'undefined', message: 'Fuera del dominio natural.' }
        : { valid: true, vector: [exact, 0, 0], norm: exact },
      derivative: { valid: false, method: 'unavailable', message: 'No disponible.' },
    }));
    expect(output!.result.stats.invalid).toBe(50); expect(output!.result.stats.valid).toBe(75);
    expect(output!.buffers.vectors[50 * 3]).toBe(exact);
    expect(output!.buffers.vectors.every(Number.isFinite)).toBe(true);
    expect(output!.result.samples[50].evaluation).toEqual({ valid: true, vector: [exact, 0, 0], norm: exact });
    expect(output!.buffers.validity[0]).toBe(1);
  });
  it('rejects non-finite producer values without converting them to a valid zero', async () => {
    const config = defaultConfig(); config.resolution = 5;
    const broken = (point: Vec3): FieldSample => ({ point,
      evaluation: { valid: true, vector: [Infinity, NaN, 0], norm: Infinity },
      derivative: { valid: true, jacobian: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 0], method: 'analytic', error: 0, reliable: true },
    });
    const output = await computeFieldGrid(config, 1, broken);
    expect(output!.result.stats).toMatchObject({ valid: 0, invalid: 125, zeros: 0 });
    expect(output!.buffers.vectors.every(Number.isFinite)).toBe(true);
    expect(output!.result.samples[0].evaluation).toMatchObject({ valid: false, reason: 'non-finite' });
  });
  it('identifies inactive seeds while preserving explicit coordinates', async () => {
    const config = defaultConfig(); config.resolution = 5; config.seeds = [[4, 0, 0], [3, 0, 0], [0, 0, 0]];
    const output = await computeFieldGrid(config, 1, p => analyticSample(config, p));
    expect(output!.result.stats.inactiveSeeds).toBe(1); expect(output!.result.config.seeds).toEqual(config.seeds);
  });
});


describe('bounded worker equation formatting', () => {
  it('formats roots, fractions and powers from the validated mathematical AST', () => {
    const tex = formatEquationTex(['sqrt(x)', '1/(x+1)', 'sin(x)^2']);
    expect(tex?.[0]).toContain('\\sqrt');
    expect(tex?.[1]).toContain('\\frac');
    expect(tex?.[2]).toContain('^{2}');
  });
  it('does not format unapproved syntax', () => {
    expect(formatEquationTex(['2x', '0', '0'])).toBeUndefined();
    expect(formatEquationTex(['x=1', '0', '0'])).toBeUndefined();
  });
});
