import type { EvaluationResult, ExperimentConfigV1, StopReason, StreamBranch, StreamlineResult, Vec3 } from '../experiment/types';

export interface IntegrationOptions {
  /** Cancellation is checked before every field evaluation. Workers must yield between generator steps. */
  cancelled?: () => boolean;
  /** Absolute deadline on the performance.now() clock. */
  deadline?: number;
  /** Includes the seed; a value of zero produces no positions. */
  maxVertices?: number;
  /** Exact arc-length interval, useful for comparing convergence without changing the experiment. */
  maxLength?: number;
  /** Classical RK4 step in arc-length units; overrides the configured mode for convergence experiments. */
  fixedStep?: number;
}

type Evaluate = (point: Vec3) => EvaluationResult;
type StageResult = { valid: true; vector: Vec3 } | { valid: false; reason: StopReason };
type StepResult = { valid: true; point: Vec3; error: number } | { valid: false; reason: StopReason };

const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const shifted = (p: Vec3, v: Vec3, amount: number): Vec3 => [p[0] + amount * v[0], p[1] + amount * v[1], p[2] + amount * v[2]];
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Integrates d r / d s = direction * F / |F|. Each yielded item ends one bounded RK4 attempt. */
export function* integrateBranchSteps(
  evaluate: Evaluate, seed: Vec3, config: ExperimentConfigV1, direction: 1 | -1, options: IntegrationOptions = {},
): Generator<void, StreamBranch, void> {
  const { domain, numerics } = config;
  const diagonal = distance(domain[0], domain[1]);
  const branch: StreamBranch = { positions: [], reason: 'max-length', length: 0, accepted: 0, rejected: 0, direction };
  const inside = (point: Vec3): boolean => point.every((value, axis) => Number.isFinite(value) && value >= domain[0][axis] && value <= domain[1][axis]);
  const resourceReason = (): StopReason | undefined => {
    if (options.cancelled?.()) return 'cancelled';
    if (options.deadline !== undefined && performance.now() >= options.deadline) return 'time';
    return undefined;
  };
  const finish = (reason: StopReason): StreamBranch => { branch.reason = reason; return branch; };
  if (!inside(seed)) return finish('outside');
  const vertices = Math.max(0, Math.floor(options.maxVertices ?? 120_000));
  if (vertices === 0) return finish('vertices');
  branch.positions.push([...seed]);

  const tangent = (point: Vec3): StageResult => {
    const resource = resourceReason();
    if (resource) return { valid: false, reason: resource };
    let result: EvaluationResult;
    try { result = evaluate(point); }
    catch { return { valid: false, reason: inside(point) ? 'undefined' : 'boundary' }; }
    if (!result.valid || !Number.isFinite(result.norm) || !result.vector.every(Number.isFinite)) {
      return { valid: false, reason: inside(point) ? 'undefined' : 'boundary' };
    }
    if (result.norm <= numerics.zeroThreshold || result.norm <= 0) return { valid: false, reason: inside(point) ? 'zero' : 'boundary' };
    return { valid: true, vector: result.vector.map((value) => direction * value / result.norm) as Vec3 };
  };
  const initial = tangent(seed);
  if (!initial.valid) return finish(initial.reason);
  if (vertices === 1) return finish('vertices');
  if (!(diagonal > 0) || !Number.isFinite(diagonal)) return finish('min-step');

  const minStep = numerics.minStepFactor * diagonal;
  const maxStep = numerics.maxStepFactor * diagonal;
  const maxLength = Math.max(0, options.maxLength ?? numerics.maxLengthFactor * diagonal);
  const absoluteTolerance = numerics.atolFactor * diagonal;
  const fixed = options.fixedStep !== undefined || numerics.integration === 'fixed';
  let step = options.fixedStep ?? numerics.stepFactor * diagonal;
  if (!(step > 0) || !Number.isFinite(step) || !(minStep > 0) || !(maxStep > 0)) return finish('min-step');
  if (!fixed) step = clamp(step, minStep, maxStep);
  let point: Vec3 = [...seed];
  const rk4 = (origin: Vec3, h: number): StepResult => {
    const k1 = tangent(origin);
    if (!k1.valid) return k1;
    const k2 = tangent(shifted(origin, k1.vector, h / 2));
    if (!k2.valid) return k2;
    const k3 = tangent(shifted(origin, k2.vector, h / 2));
    if (!k3.valid) return k3;
    const k4 = tangent(shifted(origin, k3.vector, h));
    if (!k4.valid) return k4;
    const next = origin.map((value, axis) => value + h * (k1.vector[axis] + 2 * k2.vector[axis] + 2 * k3.vector[axis] + k4.vector[axis]) / 6) as Vec3;
    return next.every(Number.isFinite) ? { valid: true, point: next, error: 0 } : { valid: false, reason: 'undefined' };
  };
  const attempt = (origin: Vec3, h: number): StepResult => {
    const full = rk4(origin, h);
    if (!full.valid || fixed) return full;
    const half = rk4(origin, h / 2);
    if (!half.valid) return half;
    const twoHalves = rk4(half.point, h / 2);
    if (!twoHalves.valid) return twoHalves;
    return { valid: true, point: twoHalves.point, error: distance(full.point, twoHalves.point) / 15 };
  };
  const tolerance = (h: number): number => absoluteTolerance + numerics.rtol * h;
  const append = (next: Vec3, h: number): void => {
    branch.positions.push(next);
    branch.accepted++;
    branch.length += h;
    point = next;
  };
  const shrinkAfterRejection = (h: number, error: number): boolean => {
    branch.rejected++;
    if (h <= minStep * (1 + 8 * Number.EPSILON)) return false;
    step = Math.max(minStep, h * clamp(0.9 * (tolerance(h) / error) ** 0.2, 0.2, 2));
    return true;
  };

  while (true) {
    const resource = resourceReason();
    if (resource) return finish(resource);
    const remaining = maxLength - branch.length;
    // Avoid an extra rounding-sized step when a prescribed interval is an exact multiple of h.
    if (remaining <= 16 * Number.EPSILON * Math.max(diagonal, maxLength)) return finish('max-length');
    if (branch.accepted >= numerics.maxSteps) return finish('max-steps');
    if (branch.positions.length >= vertices) return finish('vertices');
    const h = Math.min(step, remaining);
    const result = attempt(point, h);
    yield;
    const afterAttempt = resourceReason();
    if (afterAttempt) return finish(afterAttempt);
    if (result.valid && !fixed && result.error > tolerance(h)) {
      if (!shrinkAfterRejection(h, result.error)) return finish('min-step');
      continue;
    }
    if ((!result.valid && result.reason === 'boundary') || (result.valid && !inside(result.point))) {
      // Find the last admissible RK4 advance, instead of clipping an exterior segment.
      // Stages may sample the natural domain outside the box; only stored geometry lies in the box.
      let lower = 0;
      let upper = h;
      let last: Vec3 = point;
      let lastError = 0;
      for (let refinement = 0; refinement < 48; refinement++) {
        const trialStep = (lower + upper) / 2;
        const refined = attempt(point, trialStep);
        yield;
        const afterRefinement = resourceReason();
        if (afterRefinement) return finish(afterRefinement);
        if (!refined.valid && refined.reason !== 'boundary') return finish(refined.reason);
        if (refined.valid && inside(refined.point)) {
          lower = trialStep;
          last = refined.point;
          lastError = refined.error;
        } else upper = trialStep;
        if (upper - lower <= Math.max(diagonal * 1e-13, h * 1e-13)) break;
      }
      if (!fixed && lastError > tolerance(lower)) {
        if (!shrinkAfterRejection(lower, lastError)) return finish('min-step');
        continue;
      }
      if (lower > 0 && distance(last, point) > diagonal * 1e-14) append(last, lower);
      return finish('boundary');
    }
    if (!result.valid) return finish(result.reason);
    if (distance(result.point, point) === 0) return finish('min-step');
    const endpoint = tangent(result.point);
    if (!endpoint.valid) return finish(endpoint.reason);
    append(result.point, h);
    if (numerics.closeLoops && branch.accepted >= 20) {
      const proximity = Math.max(4 * absoluteTolerance, Math.min(h * 0.6, diagonal * 0.01));
      const alignment = initial.vector.reduce((sum, value, axis) => sum + value * endpoint.vector[axis], 0);
      if (distance(point, seed) <= proximity && alignment >= 0.95) {
        // Closure is explicitly approximate. Join the final displayed point to the original seed.
        branch.positions[branch.positions.length - 1] = [...seed];
        return finish('closed');
      }
    }
    if (!fixed) {
      const factor = result.error === 0 ? 2 : clamp(0.9 * (tolerance(h) / result.error) ** 0.2, 0.2, 2);
      step = clamp(h * factor, minStep, maxStep);
    }
  }
}

/** Synchronous convenience API. Use integrateBranchSteps in a worker to yield to cancellation messages. */
export function integrateBranch(evaluate: Evaluate, seed: Vec3, config: ExperimentConfigV1, direction: 1 | -1, options: IntegrationOptions = {}): StreamBranch {
  const steps = integrateBranchSteps(evaluate, seed, config, direction, options);
  let result = steps.next();
  while (!result.done) result = steps.next();
  return result.value;
}

export function integrateStreamline(evaluate: Evaluate, seed: Vec3, config: ExperimentConfigV1, options: IntegrationOptions = {}): StreamlineResult {
  const forward = integrateBranch(evaluate, seed, config, 1, options);
  const backward: StreamBranch = forward.reason === 'closed'
    ? { positions: [], reason: 'closed', length: 0, accepted: 0, rejected: 0, direction: -1 }
    : integrateBranch(evaluate, seed, config, -1, { ...options, maxVertices: options.maxVertices === undefined ? undefined : Math.max(0, options.maxVertices - forward.positions.length) });
  return { seed: [...seed], forward, backward, closed: forward.reason === 'closed' || backward.reason === 'closed' };
}
