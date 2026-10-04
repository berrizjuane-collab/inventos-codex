import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { ComputeResult, ExperimentConfigV1 } from '../../src/experiment/types';
import type { FieldRequest, FieldResponse } from '../../src/workers/protocol';

// A controlled hook scheduler exposes the render-before-passive-effects interval.
// It runs the actual useCompute implementation, while workers are deterministic endpoints.
const scheduler = vi.hoisted(() => ({ cursor: 0, slots: [] as any[], effects: [] as (() => unknown)[] }));
vi.mock('react', () => {
  const equal = (a: unknown[] | undefined, b: unknown[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const i = scheduler.cursor++, old = scheduler.slots[i];
    if (!old || !equal(old.deps, deps)) scheduler.slots[i] = { deps, value: factory() };
    return scheduler.slots[i].value;
  };
  return {
    useState: (initial: unknown) => {
      const i = scheduler.cursor++;
      if (!(i in scheduler.slots)) scheduler.slots[i] = { value: typeof initial === 'function' ? (initial as () => unknown)() : initial };
      return [scheduler.slots[i].value, (next: unknown) => { scheduler.slots[i].value = typeof next === 'function' ? (next as (prior: unknown) => unknown)(scheduler.slots[i].value) : next; }];
    },
    useRef: (initial: unknown) => { const i = scheduler.cursor++; return scheduler.slots[i] ?? (scheduler.slots[i] = { current: initial }); },
    useEffect: (effect: () => unknown, deps: unknown[]) => {
      const i = scheduler.cursor++, old = scheduler.slots[i];
      if (!old || !equal(old.deps, deps)) { scheduler.effects.push(effect); scheduler.slots[i] = { deps }; }
    },
    useMemo: memo,
    useCallback: (callback: () => unknown, deps: unknown[]) => memo(() => callback, deps),
  };
});
vi.mock('../../src/experiment/useLines', () => ({ useLines: () => ({ snapshot: null, busy: false, error: '' }) }));
import { useCompute } from '../../src/experiment/useCompute';

class Endpoint {
  static created: Endpoint[] = [];
  onmessage: ((event: MessageEvent<FieldResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: FieldRequest[] = [];
  constructor() { Endpoint.created.push(this); }
  terminate() {}
  postMessage(request: FieldRequest) { this.requests.push(request); }
  emit(response: FieldResponse) { this.onmessage?.({ data: response } as MessageEvent<FieldResponse>); }
}
function render(config: ExperimentConfigV1) { scheduler.cursor = 0; return useCompute(config); }
function flushEffects() { for (const effect of scheduler.effects.splice(0)) effect(); }
function snapshot(config: ExperimentConfigV1, revision: number): ComputeResult {
  return { revision, config: structuredClone(config), samples: [], slice: [], lines: [], stats: { valid: 1, invalid: 0, zeros: 0, fieldMs: 10, linesMs: 0, partial: false, inactiveSeeds: 0 } };
}
function reply(config: ExperimentConfigV1, revision: number) {
  Endpoint.created[0].emit({ type: 'result', revision, result: snapshot(config, revision), buffers: { positions: new Float64Array(), vectors: new Float64Array(), validity: new Uint8Array() } });
}
function applied(config: ExperimentConfigV1) {
  render(config); flushEffects(); reply(config, 1); return render(config);
}
beforeEach(() => {
  scheduler.cursor = 0; scheduler.slots = []; scheduler.effects = []; Endpoint.created = [];
  vi.stubGlobal('Worker', Endpoint);
  vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => {} });
});
afterEach(() => vi.unstubAllGlobals());

describe('field intent is pending during the render-before-effects interval', () => {
  it('reports initial preparation before the worker effect starts', () => {
    const first = render(defaultConfig());
    expect(first.result).toBeNull(); expect(first.busy).toBe(true);
    expect(Endpoint.created).toHaveLength(0);
  });
  it('cannot advertise completion or permit export before the next field request has even been sent', () => {
    const first = defaultConfig();
    expect(applied(first).busy).toBe(false);
    const next = structuredClone(first); next.resolution = 21;
    const renderBeforeEffects = render(next);
    expect(Endpoint.created[0].requests.filter(request => request.type === 'compute')).toHaveLength(1);
    expect(renderBeforeEffects.result!.config.resolution).toBe(9);
    expect(renderBeforeEffects.busy).toBe(true);
    expect(Boolean(renderBeforeEffects.result && !renderBeforeEffects.busy), 'Export availability must not confuse the previous applied result with the new requested state.').toBe(false);
  });
  it('continues guarding old replies, then finishes only when the matching field is applied', () => {
    const first = defaultConfig(); applied(first);
    const next = structuredClone(first); next.fieldId = 'helix'; next.components = ['-y', 'x', 'a']; next.parameters = { a: { value: 1, min: -3, max: 3, step: .1 } };
    expect(render(next).busy).toBe(true);
    flushEffects(); reply(first, 1);
    expect(render(next).result!.config.fieldId).toBe('rotation');
    expect(render(next).busy).toBe(true);
    reply(next, 2);
    const complete = render(next);
    expect(complete.busy).toBe(false); expect(complete.result!.revision).toBe(2); expect(complete.result!.config.fieldId).toBe('helix');
  });
  it('does not mark camera and graphical scale changes as mathematical work', () => {
    const config = defaultConfig(); applied(config);
    const graphics = structuredClone(config); graphics.camera.position = [4, 5, 6]; graphics.scales.field = .3;
    const result = render(graphics);
    expect(result.busy).toBe(false); expect(result.result!.revision).toBe(1);
    flushEffects();
    expect(Endpoint.created[0].requests.filter(request => request.type === 'compute')).toHaveLength(1);
  });
  it('preserves usable previous results after an explicit worker failure rather than remaining busy forever', () => {
    const config = defaultConfig(); applied(config);
    const next = structuredClone(config); next.resolution = 21;
    render(next); flushEffects();
    Endpoint.created[0].emit({ type: 'failure', operation: 'compute', revision: 2, message: 'Presupuesto de recuperación agotado.' });
    const failed = render(next);
    expect(failed.error).toContain('agotado'); expect(failed.busy).toBe(false);
    expect(failed.result!.config.resolution).toBe(9);
  });
});
