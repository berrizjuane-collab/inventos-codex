import type { DerivativeResult, Domain, EvaluationResult, Vec3 } from '../experiment/types';

type ValidEvaluation = Extract<EvaluationResult, { valid: true }>;
type Stencil = { plus: ValidEvaluation; minus: ValidEvaluation };

const axes = ['x', 'y', 'z'] as const;

function unavailable(message: string): DerivativeResult {
  return { valid: false, method: 'unavailable', message };
}

/** Guard even evaluators supplied by callers against exceptions or malformed finite results. */
function safeEvaluate(evaluate: (point: Vec3) => EvaluationResult, point: Vec3): EvaluationResult {
  try {
    const result = evaluate(point);
    if (result.valid && (!result.vector.every(Number.isFinite) || !Number.isFinite(result.norm))) {
      return { valid: false, reason: 'non-finite', message: 'El campo no produce un vector y una magnitud finitos.' };
    }
    return result;
  } catch {
    return { valid: false, reason: 'undefined', message: 'No se pudo evaluar el campo en este punto.' };
  }
}

/**
 * Central differences in the field's natural domain, independent of the visual box.
 * Rows of the Jacobian are P, Q, R; columns are x, y, z.
 * The reported error is the largest final Richardson estimate among all nine entries.
 * This local estimate does not prove that the field is differentiable.
 */
export function finiteDifference(
  evaluate: (point: Vec3) => EvaluationResult,
  point: Vec3,
  domain: Domain,
  eta: number,
): DerivativeResult {
  if (!point.every(Number.isFinite)) return unavailable('Las coordenadas de derivación deben ser reales finitas.');

  // Check the original expression before considering any derivative or nearby value.
  const original = safeEvaluate(evaluate, [...point]);
  if (!original.valid) return unavailable(`El campo original no está definido en el punto: ${original.message}`);

  if (!Number.isFinite(eta) || eta <= 0) return unavailable('El factor del paso de diferencias finitas debe ser positivo y finito.');
  const widths = domain[0].map((lower, axis) => domain[1][axis] - lower);
  if (!domain.every((corner) => corner.every(Number.isFinite)) || widths.some((width) => !Number.isFinite(width) || width <= 0)) {
    return unavailable('Los anchos del dominio deben ser positivos y finitos.');
  }

  const jacobian: [Vec3, Vec3, Vec3] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let error = 0;
  let reliable = true;

  for (let axis = 0; axis < 3; axis += 1) {
    let step = eta * Math.max(1, Math.abs(point[axis]), widths[axis]);
    let previousSmall: Stencil | undefined;
    let converged = false;

    const stencil = (offset: number): Stencil | string => {
      const plus: Vec3 = [...point];
      const minus: Vec3 = [...point];
      plus[axis] += offset;
      minus[axis] -= offset;
      if (!Number.isFinite(offset) || offset <= 0 || !Number.isFinite(2 * offset)
        || !Number.isFinite(plus[axis]) || !Number.isFinite(minus[axis])
        || plus[axis] === point[axis] || minus[axis] === point[axis]) {
        return `El paso del eje ${axes[axis]} no es representable con precisión finita.`;
      }
      const positive = safeEvaluate(evaluate, plus);
      if (!positive.valid) return `Stencil central no disponible en +${axes[axis]}: ${positive.message}`;
      const negative = safeEvaluate(evaluate, minus);
      if (!negative.valid) return `Stencil central no disponible en −${axes[axis]}: ${negative.message}`;
      return { plus: positive, minus: negative };
    };

    // Initial comparison plus at most three additional halvings.
    for (let reduction = 0; reduction <= 3; reduction += 1) {
      const large = previousSmall ?? stencil(step);
      if (typeof large === 'string') return unavailable(large);
      const small = stencil(step / 2);
      if (typeof small === 'string') return unavailable(small);

      converged = true;
      const errors: number[] = [];
      for (let component = 0; component < 3; component += 1) {
        const largeDerivative = (large.plus.vector[component] - large.minus.vector[component]) / (2 * step);
        const smallDerivative = (small.plus.vector[component] - small.minus.vector[component]) / step;
        const estimatedError = Math.abs(smallDerivative - largeDerivative) / 3;
        const amplitude = Math.max(
          Math.abs(large.plus.vector[component]), Math.abs(large.minus.vector[component]),
          Math.abs(small.plus.vector[component]), Math.abs(small.minus.vector[component]),
        );
        const tolerance = 1e-7 * Math.max(1, amplitude / widths[axis]) + 1e-4 * Math.abs(smallDerivative);
        if (![largeDerivative, smallDerivative, estimatedError, tolerance].every(Number.isFinite)) {
          return unavailable(`El cálculo de la derivada en el eje ${axes[axis]} excede la precisión finita.`);
        }
        jacobian[component][axis] = smallDerivative;
        errors.push(estimatedError);
        if (estimatedError > tolerance) converged = false;
      }
      if (converged || reduction === 3) {
        error = Math.max(error, ...errors);
        break;
      }
      previousSmall = small;
      step /= 2;
    }
    reliable &&= converged;
  }

  const divergence = jacobian[0][0] + jacobian[1][1] + jacobian[2][2];
  const curl: Vec3 = [
    jacobian[2][1] - jacobian[1][2],
    jacobian[0][2] - jacobian[2][0],
    jacobian[1][0] - jacobian[0][1],
  ];
  if (!Number.isFinite(divergence) || !curl.every(Number.isFinite)) {
    return unavailable('La divergencia o el rotacional exceden la precisión finita.');
  }
  return { valid: true, jacobian, divergence, curl, method: 'finite', error, reliable };
}
