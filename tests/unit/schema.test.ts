import { describe, expect, it } from 'vitest';
import { defaultConfig, generateSeeds } from '../../src/experiment/defaults';
import { MAX_CONFIG_BYTES, parseConfig, serializeConfig } from '../../src/experiment/schema';
import type { ExperimentConfigV1 } from '../../src/experiment/types';

function custom(): ExperimentConfigV1 {
  return {
    ...defaultConfig(), fieldId: 'custom', components: ['a*sin(x)+b*y^2', 'c*x*z', '1/z'],
    parameters: {
      a: { value: Math.PI, min: -8, max: 8, step: .12345678901234567 },
      b: { value: -0, min: -3, max: 3, step: .1 },
      c: { value: .30000000000000004, min: 0, max: 1, step: Number.MIN_VALUE },
    },
    domain: [[-1.1234567890123457, -9, -10], [8, .543210987654321, 3]], resolution: 21,
    numerics: { ...defaultConfig().numerics, derivativeMethod: 'finite', eta: 1.2345678901234567e-4, integration: 'fixed', stepFactor: .005, minStepFactor: 1e-8, maxStepFactor: .05, atolFactor: 1e-9, rtol: 1e-8, zeroThreshold: 1e-12, maxLengthFactor: 4.5, maxSteps: 1377, closeLoops: false },
    seeds: [[Number.MIN_VALUE, -0, .30000000000000004], [1e100, -1e100, 1e200]],
    layers: { arrows: false, vectors: 'curl', lines: true, seeds: false, axes: false, cut: true, scalar: 'divergence' },
    slice: { plane: 'XZ', position: -.12345678901234568, resolution: 129 },
    scales: { field: 1e-200, curl: 1e200, magnitude: Number.MAX_VALUE, divergence: Number.MIN_VALUE, directionOnly: true },
    graphics: { pixelRatio: 2 }, camera: { position: [123.12345678901235, -555, -0], target: [1, 2, 3], zoom: .3456789012345679 },
    inspected: [1e250, -1e250, -0],
  };
}

describe('configuración JSON reproducible y transaccional', () => {
  it('recupera todo el estado y cada doble, incluidos subnormales y cero con signo', async () => {
    const config = custom();
    const text = serializeConfig(config);
    expect(JSON.parse(text).parameters.b.value).toBe(-0);
    expect(await parseConfig(text)).toEqual(config);
    expect(Object.is((await parseConfig(text)).camera.position[2], -0)).toBe(true);
  });

  it('reproduce evaluación y operadores con los mismos datos de doble precisión', async () => {
    const config = custom();
    const recovered = await parseConfig(serializeConfig(config));
    const { prepareField } = await import('../../src/math/engine');
    const original = prepareField(config);
    const restored = prepareField(recovered);
    for (const point of [[.12345678901234567, -.9876543210987654, 1.2345678901234567], [Math.PI, -2, .1]] as [number, number, number][]) {
      const sample = original.sample(point);
      expect(sample.evaluation.valid).toBe(true);
      expect(sample.derivative.valid).toBe(true);
      expect(restored.sample(point)).toEqual(sample);
    }
  });

  it('acepta campos parciales o singulares sin convertir su dominio en un error de archivo', async () => {
    const config = { ...defaultConfig(), fieldId: 'custom' as const, components: ['sqrt(x)', 'log(y)', '1/z'] as [string, string, string] };
    expect(await parseConfig(JSON.stringify(config))).toEqual(config);
  });

  it('conserva semillas exteriores y no las regenera al recuperar', async () => {
    const config = custom();
    config.seeds = generateSeeds(config.domain, 64);
    config.seeds[63] = [1e100, 0, 0];
    expect((await parseConfig(serializeConfig(config))).seeds).toEqual(config.seeds);
  });

  it('valida los nombres utilizados y conserva intervalos editados del catálogo', async () => {
    const config = defaultConfig();
    config.fieldId = 'helix'; config.components = ['-y', 'x', 'a'];
    config.parameters = { a: { value: -7, min: -10, max: 10, step: .01 } };
    expect(await parseConfig(serializeConfig(config))).toEqual(config);
    config.parameters.b = { value: 1, min: -5, max: 5, step: .1 };
    await expect(parseConfig(JSON.stringify(config))).rejects.toThrow('parámetros');
  });

  it.each([
    ['schemaVersion', (c: Record<string, any>) => { c.schemaVersion = 2; }],
    ['engineVersion', (c: Record<string, any>) => { c.engineVersion = '1.1.0'; }],
    ['unknown root', (c: Record<string, any>) => { c.compiled = {}; }],
    ['unknown nested', (c: Record<string, any>) => { c.camera.code = 'alert(1)'; }],
    ['non-finite', (c: Record<string, any>) => { c.camera.zoom = 1e309; }],
    ['domain coordinate', (c: Record<string, any>) => { c.domain[0][0] = -10001; }],
    ['domain width large', (c: Record<string, any>) => { c.domain[0][0] = -10000; c.domain[1][0] = 10000; }],
    ['domain width tiny', (c: Record<string, any>) => { c.domain[1][0] = c.domain[0][0] + .0005; }],
    ['reversed domain', (c: Record<string, any>) => { c.domain[0][0] = 5; }],
    ['density', (c: Record<string, any>) => { c.resolution = 23; }],
    ['too many seeds', (c: Record<string, any>) => { c.seeds = Array.from({ length: 65 }, () => [0, 0, 0]); }],
    ['seed shape', (c: Record<string, any>) => { c.seeds = [[0, 0]]; }],
    ['cut resolution', (c: Record<string, any>) => { c.slice.resolution = 257; }],
    ['outside cut XY', (c: Record<string, any>) => { c.slice.position = 4; }],
    ['outside cut XZ', (c: Record<string, any>) => { c.slice.plane = 'XZ'; c.domain[1][1] = -1; }],
    ['outside cut YZ', (c: Record<string, any>) => { c.slice.plane = 'YZ'; c.domain[1][0] = -1; }],
    ['camera coordinate', (c: Record<string, any>) => { c.camera.target[0] = 1e7 + 1; }],
    ['coincident camera', (c: Record<string, any>) => { c.camera.position = [...c.camera.target]; }],
    ['camera zoom', (c: Record<string, any>) => { c.camera.zoom = 101; }],
    ['zero scale', (c: Record<string, any>) => { c.scales.curl = 0; }],
    ['negative scale', (c: Record<string, any>) => { c.scales.field = -1; }],
    ['graphics quality', (c: Record<string, any>) => { c.graphics.pixelRatio = 3; }],
    ['numerics unknown', (c: Record<string, any>) => { c.numerics.compiled = []; }],
    ['eta range', (c: Record<string, any>) => { c.numerics.eta = 1e-10; }],
    ['step ordering', (c: Record<string, any>) => { c.numerics.stepFactor = .05; c.numerics.maxStepFactor = .025; }],
    ['resource steps', (c: Record<string, any>) => { c.numerics.maxSteps = 1501; }],
    ['fractional steps', (c: Record<string, any>) => { c.numerics.maxSteps = 1500.5; }],
    ['resource length', (c: Record<string, any>) => { c.numerics.maxLengthFactor = 9; }],
    ['catalog equation mismatch', (c: Record<string, any>) => { c.components[0] = 'y'; }],
  ])('rechaza %s sin reparar silenciosamente el experimento', async (_name, mutate) => {
    const config = structuredClone(defaultConfig()) as unknown as Record<string, any>;
    mutate(config);
    await expect(parseConfig(JSON.stringify(config))).rejects.toThrow('Configuración inválida');
  });

  it.each([
    ['missing', (c: ExperimentConfigV1) => { delete c.parameters.a; }],
    ['unused', (c: ExperimentConfigV1) => { c.parameters.c = { value: 1, min: -5, max: 5, step: .1 }; }],
    ['invalid interval', (c: ExperimentConfigV1) => { c.parameters.a!.min = c.parameters.a!.max; }],
    ['outside value', (c: ExperimentConfigV1) => { c.parameters.a!.value = 99; }],
    ['zero step', (c: ExperimentConfigV1) => { c.parameters.a!.step = 0; }],
  ])('rechaza un parámetro %s', async (_name, mutate) => {
    const config = { ...defaultConfig(), fieldId: 'custom' as const, components: ['a*x', 'b*y', 'z'] as [string, string, string], parameters: { a: { value: 1, min: -5, max: 5, step: .1 }, b: { value: 2, min: -5, max: 5, step: .1 } } };
    mutate(config);
    await expect(parseConfig(JSON.stringify(config))).rejects.toThrow();
  });

  it.each(['x=1', 'random()', 'x.constructor', '[1,2]', '2x', 'foo', 'a+x; y', 'sin(x,y)', '1e309'])('reanaliza y rechaza la expresión %s', async (expression) => {
    const config = { ...defaultConfig(), fieldId: 'custom' as const, components: [expression, '0', '0'] };
    await expect(parseConfig(JSON.stringify(config))).rejects.toThrow('Componente P inválida');
  });

  it('rechaza JSON corrupto, números desbordados y archivos excesivos antes de prepararlos', async () => {
    await expect(parseConfig('{')).rejects.toThrow('JSON válido');
    await expect(parseConfig(serializeConfig(defaultConfig()).replace('"zoom": 1', '"zoom": 1e999'))).rejects.toThrow('Configuración inválida');
    await expect(parseConfig(' '.repeat(MAX_CONFIG_BYTES + 1))).rejects.toThrow('1 MiB');
    await expect(parseConfig('é'.repeat(MAX_CONFIG_BYTES / 2 + 1))).rejects.toThrow('1 MiB');
  });

  it('el exportador no convierte NaN o infinito silenciosamente en null', () => {
    const config = defaultConfig(); config.scales.field = Infinity;
    expect(() => serializeConfig(config)).toThrow('Configuración inválida');
  });
});
