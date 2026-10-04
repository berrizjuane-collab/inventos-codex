import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { Components, DerivativeResult, ExperimentConfigV1, Vec3 } from '../../src/experiment/types';
import { catalog } from '../../src/math/catalog';
import { prepareField, validateComponents } from '../../src/math/engine';
import { finiteDifference } from '../../src/numerics/finiteDifference';

function custom(components: Components, method: 'auto' | 'finite' = 'auto'): ExperimentConfigV1 {
  const config = defaultConfig();
  config.fieldId = 'custom';
  config.components = components;
  config.numerics.derivativeMethod = method;
  return config;
}

function points(count = 100): Vec3[] {
  let state = 0x17694bfa;
  const random = () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
  return Array.from({ length: count }, () => [random() * 5.6 - 2.8, random() * 5.6 - 2.8, random() * 5.6 - 2.8]);
}

function close(actual: number, reference: number, atol: number, rtol: number): void {
  expect(Math.abs(actual - reference)).toBeLessThanOrEqual(atol + rtol * Math.abs(reference));
}

function valid(result: DerivativeResult): asserts result is Extract<DerivativeResult, { valid: true }> {
  expect(result.valid).toBe(true);
  if (!result.valid) throw new Error(result.message);
}

function balanced(count: number, leaf: string): string {
  return count === 1 ? leaf : `(${balanced(count / 2, leaf)}*${balanced(count / 2, leaf)})`;
}

describe('M02 · gramática y evaluación segura', () => {
  it('admite únicamente variables, parámetros, constantes, operadores y funciones declaradas', () => {
    const components: Components = ['-2*x + a*sin(y) + cos(z) + tan(x/4)', '+sqrt(x^2) + b*exp(y/4)', 'log(z^2+1) + c + pi - e'];
    expect(validateComponents(components)).toEqual({ ok: true, errors: [], usedParameters: ['a', 'b', 'c'] });
    const config = custom(components);
    config.parameters = {
      a: { value: 2, min: -5, max: 5, step: 0.1 },
      b: { value: -1, min: -5, max: 5, step: 0.1 },
      c: { value: 0.5, min: -5, max: 5, step: 0.1 },
    };
    const prepared = prepareField(config);
    expect(prepared.usedParameters).toEqual(['a', 'b', 'c']);
    for (const [x, y, z] of points()) {
      const result = prepared.evaluate([x, y, z]);
      expect(result.valid).toBe(true);
      if (!result.valid) throw new Error(result.message);
      const reference = [-2 * x + 2 * Math.sin(y) + Math.cos(z) + Math.tan(x / 4), Math.abs(x) - Math.exp(y / 4), Math.log(z * z + 1) + 0.5 + Math.PI - Math.E];
      result.vector.forEach((value, component) => close(value, reference[component], 1e-12, 1e-12));
    }
    expect(validateComponents(['1.25e-3*x', '0', '0']).ok).toBe(true);
  });

  const prohibited = [
    'sin(', 'q', '2x', '2(x+y)', 'x y', 'x(y)', 'sin x', 'x=1', 'f(x)=x',
    '[x,y]', 'x.y', 'sin.constructor', '"x"', '2 cm', 'x<y', 'x==y', 'x?y:z',
    'x; y', 'x\ny', 'random()', 'abs(x)', 'floor(x)', 'sin(x,y)', 'log(x,2)',
    'x!', 'x%2', 'x mod 2', 'x.*y', 'x./y', 'x.^2', 'x and y', 'x|y',
    'x<<2', 'not x', 'x**2', 'true', 'Infinity', 'NaN', 'import(x)', 'evaluate(x)',
    'x[1]', '{x:1}', '1:3', 'x # comment', 'sin()', 'sin', '1e1000',
  ];
  for (const expression of prohibited) {
    it(`rechaza ${JSON.stringify(expression)} antes de compilar`, () => {
      const components: Components = ['x', expression, 'z'];
      const validation = validateComponents(components);
      expect(validation.ok).toBe(false);
      expect(validation.errors.some((error) => error.component === 1 && error.message.length > 0)).toBe(true);
      const field = prepareField(custom(components));
      expect(field.evaluate([1, 2, 3])).toMatchObject({ valid: false, reason: 'undefined' });
      expect(field.derivative([1, 2, 3])).toMatchObject({ valid: false, method: 'unavailable' });
    });
  }

  it('aplica límites separados de longitud, nodos y profundidad', () => {
    expect(validateComponents(['1' + ' '.repeat(256), '0', '0']).errors[0].message).toContain('256 caracteres');
    expect(validateComponents([balanced(32, 'x^2'), '0', '0']).errors[0].message).toContain('128 nodos');
    expect(validateComponents(['('.repeat(25) + 'x' + ')'.repeat(25), '0', '0']).errors[0].message).toContain('profundidad');
    expect(validateComponents([' '.repeat(10), '0', '0']).errors[0].message).toContain('Escribe');
  });

  it('mantiene distintos expresión inválida, complejo y resultado no finito', () => {
    expect(prepareField(custom(['q', '0', '0'])).evaluate([0, 0, 0])).toMatchObject({ valid: false, reason: 'undefined' });
    expect(prepareField(custom(['sqrt(x)', '0', '0'])).evaluate([-1, 0, 0])).toMatchObject({ valid: false, reason: 'complex' });
    expect(prepareField(custom(['log(x)', '0', '0'])).evaluate([-1, 0, 0])).toMatchObject({ valid: false, reason: 'complex' });
    expect(prepareField(custom(['1/x', '0', '0'])).evaluate([0, 0, 0])).toMatchObject({ valid: false, reason: 'non-finite' });
    expect(prepareField(custom(['exp(1000)', '0', '0'])).evaluate([0, 0, 0])).toMatchObject({ valid: false, reason: 'non-finite' });
    expect(prepareField(custom(['x', '0', '0'])).evaluate([Infinity, 0, 0])).toMatchObject({ valid: false, reason: 'non-finite' });
  });

  it('distingue valores ausentes/no finitos de parámetros y conserva una revisión preparada', () => {
    const config = custom(['a*x', '0', '0']);
    expect(prepareField(config).evaluate([1, 0, 0])).toMatchObject({ valid: false, reason: 'undefined' });
    config.parameters.a = { value: NaN, min: -5, max: 5, step: 0.1 };
    expect(prepareField(config).evaluate([1, 0, 0])).toMatchObject({ valid: false, reason: 'non-finite' });
    config.parameters.a.value = 2;
    const prepared = prepareField(config);
    config.parameters.a.value = 3;
    config.components[0] = '0';
    expect(prepared.evaluate([1, 0, 0])).toEqual({ valid: true, vector: [2, 0, 0], norm: 2 });
  });

  it('conserva ceros reales y máscaras de regiones parcialmente válidas', () => {
    const zero = prepareField(custom(['0', '0', '0']));
    expect(zero.sample([0, 0, 0])).toMatchObject({ evaluation: { valid: true, norm: 0 }, derivative: { valid: true, divergence: 0, curl: [0, 0, 0] } });
    const partial = prepareField(custom(['sqrt(x)', 'y', 'z']));
    expect(partial.evaluate([-1, 0, 0]).valid).toBe(false);
    expect(partial.evaluate([1, 0, 0]).valid).toBe(true);
    expect(points().every((point) => !prepareField(custom(['sqrt(-100-x^2)', '0', '0'])).evaluate(point).valid)).toBe(true);
  });
});

describe('M03 · derivadas y diagnósticos', () => {
  it('usa las referencias analíticas solo con las componentes exactas del catálogo', () => {
    const config = defaultConfig();
    const analytic = prepareField(config).derivative([1, 2, 3]);
    expect(analytic).toMatchObject({ valid: true, method: 'analytic', curl: [0, 0, 2] });
    config.components = ['x', 'y', 'z'];
    expect(prepareField(config).derivative([1, 2, 3])).toMatchObject({ valid: true, method: 'symbolic', divergence: 3, curl: [0, 0, 0] });
    config.components = [' -y ', 'x', '0'];
    expect(prepareField(config).derivative([1, 2, 3])).toMatchObject({ valid: true, method: 'symbolic', divergence: 0, curl: [0, 0, 2] });
  });

  for (const definition of catalog) {
    it(`MAT-02 ${definition.id}: diferencias finitas forzadas en 100 puntos y fronteras`, () => {
      const config = defaultConfig();
      config.fieldId = definition.id;
      config.components = [...definition.components];
      config.parameters = structuredClone(definition.parameters);
      config.numerics.derivativeMethod = 'finite';
      const field = prepareField(config);
      const references = {
        uniform: { jacobian: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 0] },
        outward: { jacobian: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], divergence: 3, curl: [0, 0, 0] },
        inward: { jacobian: [[-1, 0, 0], [0, -1, 0], [0, 0, -1]], divergence: -3, curl: [0, 0, 0] },
        rotation: { jacobian: [[0, -1, 0], [1, 0, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 2] },
        helix: { jacobian: [[0, -1, 0], [1, 0, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 2] },
        saddle: { jacobian: [[1, 0, 0], [0, -1, 0], [0, 0, 0]], divergence: 0, curl: [0, 0, 0] },
      }[definition.id];
      for (const point of [...points(), [-3, -3, -3], [3, 3, 3], [0, 0, 0]] as Vec3[]) {
        const result = field.derivative(point);
        valid(result);
        expect(result.method).toBe('finite');
        expect(result.reliable).toBe(true);
        expect(result.error).toBeLessThan(1e-8);
        result.jacobian.forEach((row, component) => row.forEach((entry, axis) => close(entry, references.jacobian[component][axis], 1e-8, 1e-8)));
        close(result.divergence, references.divergence, 1e-8, 1e-8);
        result.curl.forEach((entry, axis) => close(entry, references.curl[axis], 1e-8, 1e-8));
      }
    });
  }

  for (const method of ['auto', 'finite'] as const) {
    it(`MAT-03 ${method}: seno, cuadrado y producto en 100 puntos`, () => {
      const field = prepareField(custom(['sin(x)', 'y^2', 'x*z'], method));
      for (const point of points()) {
        const [x, y, z] = point;
        const result = field.derivative(point);
        valid(result);
        expect(result.method).toBe(method === 'auto' ? 'symbolic' : 'finite');
        const reference = [[Math.cos(x), 0, 0], [0, 2 * y, 0], [z, 0, x]];
        result.jacobian.forEach((row, component) => row.forEach((entry, axis) => close(entry, reference[component][axis], method === 'auto' ? 1e-12 : 1e-6, method === 'auto' ? 1e-12 : 1e-5)));
        close(result.divergence, Math.cos(x) + 2 * y + x, method === 'auto' ? 1e-12 : 1e-6, method === 'auto' ? 1e-12 : 1e-5);
        result.curl.forEach((entry, axis) => close(entry, [0, -z, 0][axis], method === 'auto' ? 1e-12 : 1e-6, method === 'auto' ? 1e-12 : 1e-5));
      }
    });

    it(`MAT-04 ${method}: rotacional (5,2,3), sin permutaciones ni signos incorrectos`, () => {
      const field = prepareField(custom(['2*z', '3*x', '5*y'], method));
      for (const point of points()) {
        const result = field.derivative(point);
        valid(result);
        close(result.divergence, 0, 1e-8, 1e-8);
        result.curl.forEach((entry, axis) => close(entry, [5, 2, 3][axis], 1e-8, 1e-8));
      }
    });
  }

  it('no extiende restricciones del campo original al derivar', () => {
    for (const method of ['auto', 'finite'] as const) {
      const field = prepareField(custom(['x/x', '0', '0'], method));
      expect(field.sample([0, 0, 0])).toMatchObject({ evaluation: { valid: false, reason: 'non-finite' }, derivative: { valid: false, method: 'unavailable' } });
      const boundary = prepareField(custom(['sqrt(x)', '0', '0'], method));
      expect(boundary.evaluate([0, 0, 0])).toMatchObject({ valid: true, norm: 0 });
      expect(boundary.derivative([0, 0, 0])).toMatchObject({ valid: false, method: 'unavailable' });
    }
  });

  it('limita árboles derivados a 512 nodos y usa el método numérico', () => {
    const expression = balanced(16, 'x^x');
    expect(validateComponents([expression, '0', '0']).ok).toBe(true);
    const field = prepareField(custom([expression, '0', '0']));
    const result = field.derivative([1.1, 0, 0]);
    valid(result);
    expect(result.method).toBe('finite');
    close(result.jacobian[0][0], 1.1 ** (16 * 1.1) * 16 * (Math.log(1.1) + 1), 1e-3, 1e-4);
  });

  it('MAT-07 reduce error con h,h/2,h/4 antes de redondeo', () => {
    const actual: number[] = [];
    for (const eta of [1e-3, 5e-4, 2.5e-4]) {
      const config = custom(['sin(x)', '0', '0'], 'finite');
      config.numerics.eta = eta;
      const result = prepareField(config).derivative([0.8, 0, 0]);
      valid(result);
      expect(result.reliable).toBe(true);
      actual.push(Math.abs(result.jacobian[0][0] - Math.cos(0.8)));
    }
    expect(actual[1]).toBeLessThan(actual[0]);
    expect(actual[2]).toBeLessThan(actual[1]);
    expect(actual[0] / actual[1]).toBeGreaterThan(3.9);
    expect(actual[1] / actual[2]).toBeGreaterThan(3.9);
  });

  it('MAT-07 informa falta de convergencia y pasos no representables', () => {
    const field = prepareField(custom(['sin(1/x)', '0', '0'], 'finite'));
    const result = field.derivative([1e-5, 0, 0]);
    valid(result);
    expect(result.reliable).toBe(false);
    expect(result.error).toBeGreaterThan(0);
    const config = custom(['x', '0', '0'], 'finite');
    config.numerics.eta = Number.MIN_VALUE;
    expect(prepareField(config).derivative([1, 0, 0])).toMatchObject({ valid: false, method: 'unavailable' });
  });

  it('MAT-08 evalúa operadores tridimensionales en XY, XZ y YZ', () => {
    const field = prepareField(custom(['x*y+z', 'y*z+x', 'x*z+y^2']));
    for (const fixedAxis of [0, 1, 2]) {
      for (const initial of points(20)) {
        const point: Vec3 = [...initial];
        point[fixedAxis] = 0.7;
        const [x, y, z] = point;
        const sample = field.sample(point);
        expect(sample.evaluation).toMatchObject({ valid: true, vector: [x * y + z, y * z + x, x * z + y * y] });
        valid(sample.derivative);
        close(sample.derivative.divergence, x + y + z, 1e-12, 1e-12);
        sample.derivative.curl.forEach((entry, axis) => close(entry, [y, 1 - z, 1 - x][axis], 1e-12, 1e-12));
        expect(sample).toEqual(field.sample(point));
      }
    }
  });

  it('el stencil pertenece al dominio natural y puede cruzar la caja visual', () => {
    const config = custom(['x', 'y', 'z'], 'finite');
    expect(prepareField(config).derivative([3, 3, 3])).toMatchObject({ valid: true, method: 'finite', reliable: true });
    const evaluations: Vec3[] = [];
    const result = finiteDifference((point) => {
      evaluations.push(point);
      return { valid: true, vector: [...point], norm: Math.hypot(...point) };
    }, [3, 3, 3], config.domain, config.numerics.eta);
    valid(result);
    expect(evaluations.some((point) => point.some((value) => value > 3))).toBe(true);
    expect(result.jacobian).toMatchObject([[expect.closeTo(1, 8), 0, 0], [0, expect.closeTo(1, 8), 0], [0, 0, expect.closeTo(1, 8)]]);
  });
});
