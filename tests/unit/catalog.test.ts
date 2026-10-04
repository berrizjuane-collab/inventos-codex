import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { ExperimentConfigV1, FieldId, Vec3 } from '../../src/experiment/types';
import { analyticSample, catalog, getField, parameterValues, sampleCatalog } from '../../src/math/catalog';

function configFor(id: FieldId, a = 1): ExperimentConfigV1 {
  const config = defaultConfig();
  const field = getField(id);
  config.fieldId = id;
  if (field) {
    config.components = [...field.components];
    config.parameters = id === 'helix' ? { a: { value: a, min: -3, max: 3, step: 0.1 } } : {};
  }
  return config;
}

// Semilla fija e independiente de las semillas gráficas de la aplicación.
function interiorPoints(count: number): Vec3[] {
  let state = 0x2f08b19a;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => [random() * 5.8 - 2.9, random() * 5.8 - 2.9, random() * 5.8 - 2.9]);
}

function close(actual: number, reference: number): void {
  expect(Math.abs(actual - reference)).toBeLessThanOrEqual(1e-12 + 1e-12 * Math.abs(reference));
}

// Fórmulas de prueba independientes; no usan evaluate, jacobian ni operadores del catálogo.
function expected(id: FieldId, [x, y, z]: Vec3, a = 1): { vector: Vec3; divergence: number; curl: Vec3 } {
  switch (id) {
    case 'uniform': return { vector: [1, 0, 0], divergence: 0, curl: [0, 0, 0] };
    case 'outward': return { vector: [x, y, z], divergence: 3, curl: [0, 0, 0] };
    case 'inward': return { vector: [-x, -y, -z], divergence: -3, curl: [0, 0, 0] };
    case 'rotation': return { vector: [-y, x, 0], divergence: 0, curl: [0, 0, 2] };
    case 'helix': return { vector: [-y, x, a], divergence: 0, curl: [0, 0, 2] };
    case 'saddle': return { vector: [x, -y, 0], divergence: 0, curl: [0, 0, 0] };
    default: throw new Error('Campo ajeno a esta referencia de prueba.');
  }
}

const specialPoints: Vec3[] = [[0, 0, 0], [0, 0, 2], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [3, -3, 3]];

describe('M01 · referencias analíticas del catálogo', () => {
  it('contiene seis campos con ecuaciones, descripciones y equilibrios en español', () => {
    expect(catalog.map((field) => field.id)).toEqual(['uniform', 'outward', 'inward', 'rotation', 'helix', 'saddle']);
    catalog.forEach((field) => {
      expect(field.name.length).toBeGreaterThan(3);
      expect(field.description.length).toBeGreaterThan(50);
      expect(field.equilibrium.length).toBeGreaterThan(3);
      expect(field.components).toHaveLength(3);
      if (field.id !== 'helix') expect(field.parameters).toEqual({});
    });
    expect(getField('helix')?.parameters.a).toEqual({ value: 1, min: -3, max: 3, step: 0.1 });
    expect(getField('custom')).toBeUndefined();
    expect(getField('desconocido')).toBeUndefined();
  });

  for (const id of ['uniform', 'outward', 'inward', 'rotation', 'helix', 'saddle'] as const) {
    it(`MAT-01 ${id}: 100 puntos interiores deterministas y 7 puntos especiales`, () => {
      const config = configFor(id);
      const points = [...interiorPoints(100), ...specialPoints];
      expect(interiorPoints(100)).toEqual(interiorPoints(100));
      for (const point of points) {
        const sample = analyticSample(config, point);
        const reference = expected(id, point);
        expect(sample.evaluation.valid).toBe(true);
        expect(sample.derivative.valid).toBe(true);
        if (!sample.evaluation.valid || !sample.derivative.valid) throw new Error('Muestra analítica inválida.');
        sample.evaluation.vector.forEach((value, axis) => close(value, reference.vector[axis]));
        close(sample.evaluation.norm, Math.sqrt(reference.vector.reduce((sum, value) => sum + value * value, 0)));
        close(sample.derivative.divergence, reference.divergence);
        sample.derivative.curl.forEach((value, axis) => close(value, reference.curl[axis]));
        expect(sample.derivative.method).toBe('analytic');
        expect(sample.derivative.reliable).toBe(true);
        expect(sample.derivative.error).toBe(0);
      }
    });
  }

  it('los jacobianos exactos respetan filas P,Q,R y signos dextrógiros', () => {
    const expectedJacobian = {
      uniform: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      outward: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      inward: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]],
      rotation: [[0, -1, 0], [1, 0, 0], [0, 0, 0]],
      helix: [[0, -1, 0], [1, 0, 0], [0, 0, 0]],
      saddle: [[1, 0, 0], [0, -1, 0], [0, 0, 0]],
    };
    for (const field of catalog) {
      const sample = analyticSample(configFor(field.id), [1.5, -2.25, 0.75]);
      if (!sample.derivative.valid) throw new Error('Derivada inválida.');
      expect(sample.derivative.jacobian).toEqual(expectedJacobian[field.id]);
      const [p, q, r] = sample.derivative.jacobian;
      expect(p[0] + q[1] + r[2]).toBe(sample.derivative.divergence);
      expect([r[1] - q[2], p[2] - r[0], q[0] - p[1]]).toEqual(sample.derivative.curl);
    }
    expect(analyticSample(configFor('rotation'), [1, 0, 0]).evaluation).toMatchObject({ vector: [-0, 1, 0] });
    expect(analyticSample(configFor('outward'), [0, 0, 0]).derivative).toMatchObject({ divergence: 3 });
    expect(analyticSample(configFor('inward'), [0, 0, 0]).derivative).toMatchObject({ divergence: -3 });
  });

  it('MAT-05 distingue los equilibrios exactos mediante magnitud cero', () => {
    for (const id of ['outward', 'inward', 'rotation', 'saddle'] as const) {
      const point: Vec3 = id === 'outward' || id === 'inward' ? [0, 0, 0] : [0, 0, 2];
      const sample = analyticSample(configFor(id), point);
      expect(sample.evaluation).toMatchObject({ valid: true, norm: 0 });
      if (!sample.evaluation.valid) throw new Error('Equilibrio inválido.');
      expect(sample.evaluation.vector.every((component) => component === 0)).toBe(true);
    }
    expect(analyticSample(configFor('uniform'), [0, 0, 0]).evaluation).toMatchObject({ valid: true, norm: 1 });
    // Esta fase no produce direcciones normalizadas ni geometría de flechas.
  });

  for (const a of [-1, 0, 1, 2]) {
    it(`MAT-06 helicoidal a=${a}: referencia, sentido axial y equilibrio`, () => {
      for (const point of [...interiorPoints(100), ...specialPoints]) {
        const sample = analyticSample(configFor('helix', a), point);
        const reference = expected('helix', point, a);
        if (!sample.evaluation.valid || !sample.derivative.valid) throw new Error('Muestra helicoidal inválida.');
        sample.evaluation.vector.forEach((value, axis) => close(value, reference.vector[axis]));
        close(sample.derivative.divergence, 0);
        expect(sample.derivative.curl).toEqual([0, 0, 2]);
        expect(Math.sign(sample.evaluation.vector[2])).toBe(Math.sign(a));
        if (a === 0) expect(sample).toEqual(analyticSample(configFor('rotation'), point));
      }
      expect(analyticSample(configFor('helix', a), [0, 0, 2]).evaluation).toMatchObject({ valid: true, norm: Math.abs(a) });
    });
  }

  it('extrae los valores de parámetros sin mutar la configuración', () => {
    const parameters = { a: { value: -1, min: -3, max: 3, step: 0.1 }, c: { value: 2, min: -5, max: 5, step: 0.1 } };
    const before = structuredClone(parameters);
    expect(parameterValues(parameters)).toEqual({ a: -1, c: 2 });
    expect(parameterValues({})).toEqual({});
    expect(parameters).toEqual(before);
    expect(analyticSample({ ...configFor('helix'), parameters: {} }, [1, 0, 0]).evaluation).toMatchObject({ vector: [-0, 1, 1] });
  });

  it('muestrea mallas inclusivas, no cúbicas, sin alterar sus extremos', () => {
    const config = configFor('outward');
    config.resolution = 5;
    config.domain = [[-2, -1, 0], [4, 3, 7]];
    const samples = sampleCatalog(config);
    expect(samples).toHaveLength(125);
    expect(samples[0].point).toEqual([-2, -1, 0]);
    expect(samples.at(-1)?.point).toEqual([4, 3, 7]);
    for (let axis = 0; axis < 3; axis++) {
      const coordinates = [...new Set(samples.map((sample) => sample.point[axis]))];
      expect(coordinates).toHaveLength(5);
      expect(coordinates[0]).toBe(config.domain[0][axis]);
      expect(coordinates.at(-1)).toBe(config.domain[1][axis]);
    }
    samples.forEach((sample) => expect(sample.evaluation).toMatchObject({ valid: true, vector: sample.point }));
    expect(sampleCatalog(defaultConfig())).toHaveLength(729);
  });

  it('rechaza campos sin referencia y entradas no finitas, sin inventar ceros', () => {
    expect(analyticSample(configFor('custom'), [1, 2, 3])).toMatchObject({
      evaluation: { valid: false, reason: 'undefined' }, derivative: { valid: false, method: 'unavailable' },
    });
    expect(analyticSample(configFor('uniform'), [Infinity, 0, 0])).toMatchObject({ evaluation: { valid: false, reason: 'non-finite' } });
    expect(analyticSample(configFor('helix', NaN), [1, 2, 3])).toMatchObject({ evaluation: { valid: false, reason: 'non-finite' } });
  });
});
