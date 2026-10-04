import { prepareField, validateComponents } from '../math/engine';
import type { ExperimentConfigV1 } from '../experiment/types';
import { computeFieldGrid } from './fieldCompute';
import { fieldComputeKey, type FieldRequest, type FieldResponse } from './protocol';

// Structural typing avoids mixing DOM and WebWorker globals in the application tsconfig.
const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<FieldRequest>) => void) | null;
  postMessage(message: FieldResponse, transfer?: Transferable[]): void;
};
let latestRevision = 0;
let applied: { key: string; field: ReturnType<typeof prepareField> } | undefined;
const message = (cause: unknown) => cause instanceof Error ? cause.message : 'No se pudo completar el cálculo.';
function fieldFor(config: ExperimentConfigV1, forceFinite = false) {
  const effective = forceFinite ? { ...config, numerics: { ...config.numerics, derivativeMethod: 'finite' as const } } : config;
  const key = fieldComputeKey(effective);
  return { key, field: applied?.key === key ? applied.field : prepareField(effective) };
}

worker.onmessage = event => {
  const request = event.data;
  if (request.type === 'cancel') { if (latestRevision === request.revision) latestRevision = -1; return; }
  if (request.type === 'validate') {
    try { worker.postMessage({ type: 'validation', id: request.id, validation: validateComponents(request.components) }); }
    catch (cause) { worker.postMessage({ type: 'failure', operation: 'validate', id: request.id, message: message(cause) }); }
    return;
  }
  if (request.type === 'inspect') {
    try {
      const prepared = fieldFor(request.config, request.forceFinite);
      worker.postMessage({ type: 'inspection', id: request.id, revision: request.revision, sample: prepared.field.sample(request.point) });
    } catch (cause) { worker.postMessage({ type: 'failure', operation: 'inspect', id: request.id, revision: request.revision, message: message(cause) }); }
    return;
  }
  latestRevision = request.revision;
  const startedAt = performance.now();
  void (async () => {
    try {
      const prepared = fieldFor(request.config, request.forceFinite);
      const output = await computeFieldGrid(request.config, request.revision, prepared.field.sample, {
        startedAt, cancelled: () => latestRevision !== request.revision,
      });
      if (!output || latestRevision !== request.revision) return;
      // Keep a recovered finite-difference field for inspection of the same applied auto revision.
      applied = { key: fieldComputeKey(request.config), field: prepared.field };
      if (request.forceFinite) output.result.stats.message = [output.result.stats.message, 'Derivación numérica tras recuperar el worker.'].filter(Boolean).join(' ');
      worker.postMessage({ type: 'result', revision: request.revision, ...output }, [
        output.buffers.positions.buffer, output.buffers.vectors.buffer, output.buffers.validity.buffer,
      ]);
    } catch (cause) {
      if (latestRevision === request.revision) worker.postMessage({ type: 'failure', operation: 'compute', revision: request.revision, message: message(cause) });
    }
  })();
};
