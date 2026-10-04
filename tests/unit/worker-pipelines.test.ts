import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import { analyticSample } from '../../src/math/catalog';
import { computeFieldGrid, slicePoints } from '../../src/workers/fieldCompute';
import { computeLines } from '../../src/workers/linesCompute';
import { acceptsLineResponse, fieldComputeKey, fieldGridKey, lineComputeKey, withVisualConfig } from '../../src/workers/protocol';
import type { EvaluationResult, Vec3 } from '../../src/experiment/types';

const constant = (_point: Vec3): EvaluationResult => ({ valid: true, vector: [1, 0, 0], norm: 1 });

describe('3D slice sampling', () => {
  it.each(['XY', 'XZ', 'YZ'] as const)('%s includes both faces and the exact requested plane', async plane => {
    const config = defaultConfig(); config.resolution = 5; config.fieldId = 'outward';
    config.components = ['x', 'y', 'z']; config.layers.cut = true;
    config.slice = { plane, position: .12345678901234567, resolution: 65 };
    const fixed = plane === 'XY' ? 2 : plane === 'XZ' ? 1 : 0;
    const varying = [0, 1, 2].filter(axis => axis !== fixed);
    const output = await computeFieldGrid(config, 1, p => analyticSample(config, p), { yieldControl: async () => {} });
    expect(output!.result.slice).toHaveLength(65 ** 2);
    expect(output!.result.slice.every(sample => sample.point[fixed] === config.slice.position)).toBe(true);
    expect(varying.map(axis => output!.result.slice[0].point[axis])).toEqual([-3, -3]);
    expect(varying.map(axis => output!.result.slice.at(-1)!.point[axis])).toEqual([3, 3]);
    const centre = output!.result.slice[(65 ** 2 - 1) / 2];
    expect(varying.map(axis => centre.point[axis])).toEqual([0, 0]);
    expect(centre.derivative).toMatchObject({ valid: true, divergence: 3, curl: [0, 0, 0] });
  });
  it('scalar analysis requests a slice and graphic-only changes preserve the 3D grid key', () => {
    const config = defaultConfig(), changed = structuredClone(config);
    changed.layers.scalar = 'divergence';
    expect(fieldComputeKey(changed)).not.toBe(fieldComputeKey(config));
    expect(fieldGridKey(changed)).toBe(fieldGridKey(config));
    changed.slice.position = .5;
    expect(fieldComputeKey(changed)).not.toBe(fieldComputeKey({ ...changed, slice: { ...changed.slice, position: 0 } }));
    changed.graphics.pixelRatio = 2;
    expect(fieldGridKey(changed)).toBe(fieldGridKey(config));
  });
  it('preserves the completed slice while a different or newly activated plane is pending', () => {
    const applied = defaultConfig(), request = structuredClone(applied);
    request.layers.cut = true; request.layers.scalar = 'divergence';
    const pendingFirst = withVisualConfig(applied, request);
    expect(pendingFirst.layers.cut).toBe(false); expect(pendingFirst.layers.scalar).toBe('none');
    applied.layers.cut = true; applied.layers.scalar = 'magnitude';
    request.slice.plane = 'XZ'; request.slice.position = .5;
    const pendingPlane = withVisualConfig(applied, request);
    expect(pendingPlane.slice).toEqual(applied.slice); expect(pendingPlane.layers.scalar).toBe('magnitude');
    request.layers.vectors = 'curl'; request.scales.curl = .4;
    const graphics = withVisualConfig(applied, request);
    expect(graphics.layers.vectors).toBe('curl'); expect(graphics.scales.curl).toBe(.4);
    request.slice = applied.slice;
    expect(withVisualConfig(applied, request).layers.scalar).toBe('divergence');
  });
  it('keeps invalid samples as holes and never interpolates over them', async () => {
    const config = defaultConfig(); config.resolution = 5; config.layers.cut = true;
    const output = await computeFieldGrid(config, 1, point => ({ point,
      evaluation: point[0] === 0 ? { valid: false, reason: 'undefined', message: 'Polo.' } : { valid: true, vector: [1 / point[0], 0, 0], norm: Math.abs(1 / point[0]) },
      derivative: { valid: false, method: 'unavailable', message: 'No disponible.' },
    }), { yieldControl: async () => {} });
    expect(output!.result.slice.filter(sample => !sample.evaluation.valid)).toHaveLength(65);
    expect(output!.result.slice.filter(sample => sample.evaluation.valid)).toHaveLength(65 ** 2 - 65);
  });
  it('cancels in the slice phase rather than publishing the already-completed lattice', async () => {
    const config = defaultConfig(); config.resolution = 5; config.layers.cut = true;
    let evaluated = 0, cancelled = false;
    const output = await computeFieldGrid(config, 1, point => { evaluated++; return analyticSample(config, point); }, {
      now: () => 0, cancelled: () => cancelled,
      yieldControl: async () => { if (evaluated > 125) cancelled = true; },
    });
    expect(output).toBeNull(); expect(evaluated).toBe(128);
  });
  it('reports a partial slice under the same two-second field budget', async () => {
    const config = defaultConfig(); config.resolution = 5; config.layers.cut = true;
    let clock = 0;
    const output = await computeFieldGrid(config, 1, point => { clock += 10; return analyticSample(config, point); }, {
      now: () => clock, budgetMs: 2_000, yieldControl: async () => {},
    });
    expect(output!.result.samples).toHaveLength(125); expect(output!.result.slice).toHaveLength(75);
    expect(output!.result.stats.partial).toBe(true); expect(output!.result.stats.message).toContain('corte 75 de 4225');
  });
  it('does not allocate or sample a hidden slice', async () => {
    const config = defaultConfig(); config.resolution = 5;
    const output = await computeFieldGrid(config, 1, point => analyticSample(config, point));
    expect(output!.result.slice).toEqual([]);
    expect([...slicePoints({ ...config, slice: { plane: 'XZ', position: .5, resolution: 129 } })]).toHaveLength(129 ** 2);
  });
});

describe('line queue identity and full applied configuration', () => {
  it('rejects old seeds of the same revision and old revisions of the same id', () => {
    const active = { revision: 2, id: 7 };
    expect(acceptsLineResponse(active, { revision: 2, id: 6 })).toBe(false);
    expect(acceptsLineResponse(active, { revision: 1, id: 7 })).toBe(false);
    expect(acceptsLineResponse(active, { revision: 2, id: 7 })).toBe(true);
    expect(acceptsLineResponse(null, { revision: 2, id: 7 })).toBe(false);
  });
  it('sampling, integration and graphics remain independent controls', () => {
    const config = defaultConfig(), changed = structuredClone(config);
    changed.seeds = [[.123, .234, .345]]; changed.numerics.integration = 'fixed'; changed.numerics.stepFactor = .005;
    expect(fieldComputeKey(changed)).toBe(fieldComputeKey(config));
    expect(lineComputeKey(changed)).not.toBe(lineComputeKey(config));
    const applied = withVisualConfig(config, changed);
    expect(applied.seeds).toEqual(changed.seeds); expect(applied.numerics.integration).toBe('fixed');
    expect(applied.numerics.stepFactor).toBe(.005);
    changed.camera.position = [2, 4, 8]; changed.inspected = [.1, .2, .3]; changed.graphics.pixelRatio = 2;
    expect(lineComputeKey(changed)).toBe(lineComputeKey(applied));
    expect(withVisualConfig(applied, changed).graphics.pixelRatio).toBe(2);
  });
});

describe('cooperative line jobs', () => {
  it('produces both directed branches in a constant field', async () => {
    const config = defaultConfig(); config.seeds = [[0, 0, 0]];
    const output = await computeLines(config, constant);
    expect(output!.lines).toHaveLength(1);
    expect(output!.lines[0].forward.reason).toBe('boundary'); expect(output!.lines[0].backward.reason).toBe('boundary');
    expect(output!.lines[0].forward.positions.at(-1)![0]).toBeCloseTo(3, 7);
    expect(output!.lines[0].backward.positions.at(-1)![0]).toBeCloseTo(-3, 7);
    expect(output!.stats.partial).toBe(false);
  });
  it('yields inside a branch and discards the cancelled job', async () => {
    const config = defaultConfig(); config.seeds = [[0, 0, 0]];
    let cancelled = false, yields = 0;
    const output = await computeLines(config, constant, { cancelled: () => cancelled, yieldControl: async () => { yields++; cancelled = true; } });
    expect(output).toBeNull(); expect(yields).toBe(1);
  });
  it('honours the global vertex cap and marks the partial result explicitly', async () => {
    const config = defaultConfig(); config.seeds = [[0, 0, 0], [1, 1, 1]];
    const output = await computeLines(config, constant, { maxVertices: 10 });
    expect(output!.stats.vertices).toBeLessThanOrEqual(10); expect(output!.stats.partial).toBe(true);
    expect(output!.lines[0].forward.reason).toBe('vertices'); expect(output!.lines[0].backward.positions).toEqual([]);
    expect(output!.stats.message).toContain('10 de 10');
  });
  it('honours an already exhausted deadline without presenting a full result', async () => {
    const config = defaultConfig();
    const output = await computeLines(config, constant, { budgetMs: 0 });
    expect(output!.lines).toEqual([]); expect(output!.stats.partial).toBe(true);
  });
  it('counts out-of-domain seeds without clamping or drawing them', async () => {
    const config = defaultConfig(); config.seeds = [[4, 0, 0], [0, 0, 0]];
    const output = await computeLines(config, constant);
    expect(output!.stats.inactiveSeeds).toBe(1); expect(output!.lines[0].forward.reason).toBe('outside');
    expect(output!.lines[0].forward.positions).toEqual([]); expect(output!.lines[0].backward.positions).toEqual([]);
  });
});
