import { useEffect, useRef, useState } from 'react';
import type { ExperimentConfigV1 } from './types';
import { acceptsLineResponse, lineComputeKey, type LinesRequest, type LinesResponse, type LinesSnapshot } from '../workers/protocol';

interface Job { id: number; revision: number; key: string; config: ExperimentConfigV1; debounce?: number; watchdog?: number }
const DEBOUNCE_MS = 350, WATCHDOG_MS = 6_000;

/** A second worker owns lines; field sampling and point inspection remain responsive. */
export function useLines(config: ExperimentConfigV1 | null, revision: number | undefined) {
  const [snapshot, setSnapshot] = useState<LinesSnapshot | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const worker = useRef<Worker | null>(null), job = useRef<Job | null>(null), nextId = useRef(0);
  const current = useRef({ config, revision }); current.current = { config, revision };
  const start = useRef<(() => void) | null>(null);
  const key = config ? lineComputeKey(config) : null;
  useEffect(() => {
    let alive = true, generation = 0;
    const clearTimers = (pending: Job | null) => {
      if (pending?.debounce !== undefined) window.clearTimeout(pending.debounce);
      if (pending?.watchdog !== undefined) window.clearTimeout(pending.watchdog);
    };
    const post = (request: LinesRequest) => worker.current?.postMessage(request);
    function spawn() {
      const epoch = ++generation;
      worker.current?.terminate();
      try {
        const created = new Worker(new URL('../workers/lines.worker.ts', import.meta.url), { type: 'module' });
        worker.current = created;
        created.onmessage = (event: MessageEvent<LinesResponse>) => {
          if (!alive || epoch !== generation || !acceptsLineResponse(job.current, event.data)) return;
          const pending = job.current!;
          clearTimers(pending); job.current = null; setBusy(false);
          if (event.data.type === 'failure') { setError(event.data.message); return; }
          setSnapshot({ revision: event.data.revision, key: pending.key, lines: event.data.lines, stats: event.data.stats });
          setError('');
        };
        created.onerror = event => { event.preventDefault(); if (alive && epoch === generation) recover(event.message || 'El worker de líneas dejó de responder.'); };
      } catch (cause) {
        worker.current = null; setBusy(false);
        setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el worker de líneas.');
      }
    }
    function recover(message: string) {
      clearTimers(job.current); job.current = null; setBusy(false); setError(message);
      // Keep the last coherent result. Future configuration changes use a fresh worker.
      spawn();
    }
    spawn();
    start.current = () => {
      const prior = job.current;
      clearTimers(prior);
      if (prior) post({ type: 'cancel', id: prior.id });
      job.current = null;
      const { config: nextConfig, revision: nextRevision } = current.current;
      if (!nextConfig || nextRevision === undefined) { setBusy(false); return; }
      if (!nextConfig.layers.lines) { setBusy(false); setSnapshot(null); setError(''); return; }
      if (!worker.current) { setBusy(false); return; }
      setBusy(true); setError(''); setSnapshot(null);
      const pending: Job = { id: ++nextId.current, revision: nextRevision, key: lineComputeKey(nextConfig), config: structuredClone(nextConfig) };
      job.current = pending;
      pending.debounce = window.setTimeout(() => {
        if (!alive || job.current?.id !== pending.id) return;
        post({ type: 'compute', id: pending.id, revision: pending.revision, config: pending.config });
        pending.watchdog = window.setTimeout(() => {
          if (job.current?.id === pending.id) recover('Las líneas excedieron el tiempo de vigilancia; se recuperó el worker.');
        }, WATCHDOG_MS);
      }, DEBOUNCE_MS);
    };
    return () => {
      alive = false; ++generation; clearTimers(job.current); job.current = null;
      worker.current?.terminate(); worker.current = null; start.current = null;
    };
  }, []);
  useEffect(() => { start.current?.(); }, [key, revision]);
  const pending = Boolean(config?.layers.lines && revision !== undefined && !error
    && (snapshot?.revision !== revision || snapshot.key !== key));
  return { snapshot, busy: busy || pending, error };
}
