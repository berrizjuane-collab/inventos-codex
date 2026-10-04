import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLines } from './useLines';
import type { Components, ComputeResult, ExperimentConfigV1, FieldSample, Vec3 } from './types';
import { RevisionGate, fieldComputeKey, fieldGridKey, lineComputeKey, withVisualConfig, type FieldRequest, type FieldResponse, type ValidationResult } from '../workers/protocol';

const WATCHDOG_MS = 3_500;
interface ComputeJob { revision: number; config: ExperimentConfigV1; forceFinite: boolean; timer?: number }
interface InspectionJob { id: number; revision: number; config: ExperimentConfigV1; point: Vec3; forceFinite: boolean; timer?: number }
interface ValidationJob { resolve: (result: ValidationResult) => void; timer: number }
interface Runtime {
  worker: Worker | null; compute: ComputeJob | null; inspection: InspectionJob | null;
  validations: Map<number, ValidationJob>; nextId: number;
  computeRequest: ((config: ExperimentConfigV1) => void) | null;
  inspectionRequest: ((config: ExperimentConfigV1, revision: number, point: Vec3) => void) | null;
  validationRequest: ((components: Components) => Promise<ValidationResult>) | null;
}
const unavailableValidation = (message: string): ValidationResult => ({ ok: false, errors: [{ component: 0, message }], usedParameters: [] });

/** Atomic field snapshots: a pending request never relabels the scene's previous samples. */
export function useCompute(request: ExperimentConfigV1): {
  result: ComputeResult | null;
  selected: FieldSample | null;
  busy: boolean;
  error: string;
  validate: (components: Components) => Promise<ValidationResult>;
} {
  const [computed, setComputed] = useState<ComputeResult | null>(null);
  const [selected, setSelected] = useState<FieldSample | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gate = useRef(new RevisionGate());
  const requestRef = useRef(request);
  requestRef.current = request;
  const runtime = useRef<Runtime>({ worker: null, compute: null, inspection: null, validations: new Map(), nextId: 0,
    computeRequest: null, inspectionRequest: null, validationRequest: null });
  const computeKey = fieldComputeKey(request);
  // Reflect pending mathematical intent during the render before passive effects send its request.
  const fieldPending = !error && (computed === null || fieldComputeKey(computed.config) !== computeKey);
  const inspectedKey = JSON.stringify(request.inspected);
  const visualKey = JSON.stringify([request.layers, request.scales, request.graphics]);
  const compatible = computed !== null && fieldGridKey(computed.config) === fieldGridKey(request);
  const linesConfig = compatible && computed ? withVisualConfig(computed.config, request) : null;
  const lineState = useLines(linesConfig, computed?.revision);
  const linesKey = lineComputeKey(request);

  useEffect(() => {
    const r = runtime.current;
    let alive = true;
    let generation = 0;
    const clearTimer = (timer?: number) => { if (timer !== undefined) window.clearTimeout(timer); };
    const failValidations = (message: string) => {
      for (const validation of r.validations.values()) { clearTimer(validation.timer); validation.resolve(unavailableValidation(message)); }
      r.validations.clear();
    };
    function post(message: FieldRequest) { r.worker?.postMessage(message); }
    function receive(response: FieldResponse) {
      if (!alive) return;
      if (response.type === 'validation') {
        const pending = r.validations.get(response.id);
        if (!pending) return;
        clearTimer(pending.timer); r.validations.delete(response.id); pending.resolve(response.validation);
      } else if (response.type === 'inspection') {
        const pending = r.inspection;
        if (!pending || pending.id !== response.id || pending.revision !== response.revision) return;
        clearTimer(pending.timer); r.inspection = null; setSelected(response.sample);
      } else if (response.type === 'result') {
        if (!gate.current.accepts(response.revision) || r.compute?.revision !== response.revision || response.result.revision !== response.revision || fieldComputeKey(response.result.config) !== fieldComputeKey(requestRef.current)) return;
        clearTimer(r.compute.timer); r.compute = null;
        clearTimer(r.inspection?.timer); r.inspection = null; setSelected(null);
        // Use the request's latest presentation while preserving the completed mathematical revision.
        setComputed({ ...response.result, config: withVisualConfig(response.result.config, requestRef.current) });
        setBusy(false); setError('');
      } else if (response.operation === 'validate') {
        const pending = r.validations.get(response.id);
        if (!pending) return;
        clearTimer(pending.timer); r.validations.delete(response.id); pending.resolve(unavailableValidation(response.message));
      } else if (response.operation === 'inspect') {
        const pending = r.inspection;
        if (!pending || pending.id !== response.id || pending.revision !== response.revision) return;
        clearTimer(pending.timer); r.inspection = null; setSelected(null); setError(response.message);
      } else if (response.operation === 'compute' && gate.current.accepts(response.revision) && r.compute?.revision === response.revision) {
        clearTimer(r.compute.timer); r.compute = null; setBusy(false); setError(response.message);
      }
    }
    function spawn() {
      const epoch = ++generation;
      r.worker?.terminate();
      try {
        const worker = new Worker(new URL('../workers/field.worker.ts', import.meta.url), { type: 'module' });
        r.worker = worker;
        worker.onmessage = (event: MessageEvent<FieldResponse>) => { if (epoch === generation) receive(event.data); };
        worker.onerror = event => {
          event.preventDefault();
          if (epoch === generation) recover(event.message || 'El worker dejó de responder.');
        };
      } catch (cause) {
        r.worker = null;
        setBusy(false);
        setError(cause instanceof Error ? cause.message : 'Web Workers no disponibles en este navegador.');
      }
    }
    function sendCompute(job: ComputeJob) {
      if (!r.worker) return;
      clearTimer(job.timer);
      r.compute = job;
      post({ type: 'compute', revision: job.revision, config: job.config, forceFinite: job.forceFinite });
      job.timer = window.setTimeout(() => {
        if (r.compute?.revision === job.revision) recover('El cálculo excedió el tiempo de vigilancia; se recuperó el worker.');
      }, WATCHDOG_MS);
    }
    function sendInspection(job: InspectionJob) {
      if (!r.worker) return;
      clearTimer(r.inspection?.timer);
      r.inspection = job;
      post({ type: 'inspect', id: job.id, revision: job.revision, config: job.config, point: job.point, forceFinite: job.forceFinite });
      job.timer = window.setTimeout(() => {
        if (r.inspection?.id === job.id) recover('El inspector excedió el tiempo de vigilancia; se recuperó el worker.');
      }, WATCHDOG_MS);
    }
    function recover(message: string) {
      if (!alive) return;
      const compute = r.compute, inspection = r.inspection;
      clearTimer(compute?.timer); clearTimer(inspection?.timer);
      r.compute = null; r.inspection = null;
      failValidations(message);
      spawn();
      // At most one automatic retry, using finite differences after symbolic preparation stalled.
      if (compute && !compute.forceFinite && compute.config.numerics.derivativeMethod === 'auto' && r.worker) {
        sendCompute({ ...compute, forceFinite: true });
      } else if (compute) { setBusy(false); setError(message); }
      if (inspection && !inspection.forceFinite && inspection.config.numerics.derivativeMethod === 'auto' && r.worker) {
        sendInspection({ ...inspection, forceFinite: true });
      } else if (inspection) { setSelected(null); setError(message); }
      if (!compute && !inspection) setError(message);
    }
    spawn();
    r.computeRequest = config => {
      clearTimer(r.compute?.timer);
      const revision = gate.current.next();
      setBusy(Boolean(r.worker)); setError('');
      sendCompute({ revision, config: structuredClone(config), forceFinite: false });
    };
    r.inspectionRequest = (config, revision, point) => {
      setSelected(null);
      sendInspection({ id: ++r.nextId, revision, config, point: [...point], forceFinite: false });
    };
    r.validationRequest = components => new Promise(resolve => {
      if (!r.worker) { resolve(unavailableValidation('Web Workers no disponibles.')); return; }
      const id = ++r.nextId;
      const timer = window.setTimeout(() => { if (r.validations.has(id)) recover('La validación excedió el presupuesto; se recuperó el worker.'); }, WATCHDOG_MS);
      r.validations.set(id, { resolve, timer });
      post({ type: 'validate', id, components: [...components] });
    });
    return () => {
      alive = false; ++generation;
      clearTimer(r.compute?.timer); clearTimer(r.inspection?.timer);
      r.compute = null; r.inspection = null;
      failValidations('El entorno de cálculo se cerró.');
      r.worker?.terminate(); r.worker = null;
      r.computeRequest = null; r.inspectionRequest = null; r.validationRequest = null;
    };
  }, []);

  useEffect(() => { runtime.current.computeRequest?.(requestRef.current); }, [computeKey]);
  useEffect(() => {
    if (computed) runtime.current.inspectionRequest?.(computed.config, computed.revision, requestRef.current.inspected);
  }, [computed?.revision, inspectedKey]);

  // Camera motion and inspection preserve result identity and therefore do not rebuild GPU meshes.
  // Callers can merge their current camera/inspected with result.config when saving configuration.
  const result = useMemo(() => {
    if (!computed) return null;
    const config = withVisualConfig(computed.config, requestRef.current);
    const snapshot = lineState.snapshot;
    const usable = snapshot?.revision === computed.revision && (!compatible || snapshot.key === linesKey);
    const stats = usable && snapshot ? {
      ...computed.stats, linesMs: snapshot.stats.linesMs,
      partial: computed.stats.partial || snapshot.stats.partial,
      inactiveSeeds: snapshot.stats.inactiveSeeds,
      message: [computed.stats.message, snapshot.stats.message].filter(Boolean).join(' ') || undefined,
    } : computed.stats;
    return { ...computed, config, lines: config.layers.lines && usable && snapshot ? snapshot.lines : [], stats: {
      ...stats, inactiveSeeds: config.seeds.filter(seed => seed.some((value, axis) => value < config.domain[0][axis] || value > config.domain[1][axis])).length,
    } };
  }, [computed, visualKey, linesKey, lineState.snapshot, compatible]);
  const validate = useCallback((components: Components) => runtime.current.validationRequest?.(components)
    ?? Promise.resolve(unavailableValidation('El motor de cálculo aún no está disponible.')), []);
  return { result, selected, busy: fieldPending || busy || lineState.busy, error: error || lineState.error, validate };
}
