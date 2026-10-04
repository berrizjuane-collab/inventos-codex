import { prepareField } from '../math/engine';
import { computeLines } from './linesCompute';
import type { LinesRequest, LinesResponse } from './protocol';

const worker = globalThis as unknown as {
  onmessage: ((event: MessageEvent<LinesRequest>) => void) | null;
  postMessage(message: LinesResponse): void;
};
let latestId = -1;
worker.onmessage = event => {
  const request = event.data;
  if (request.type === 'cancel') { if (latestId === request.id) latestId = -1; return; }
  latestId = request.id;
  const startedAt = performance.now();
  void (async () => {
    try {
      // Lines need only evaluation; skip preparing symbolic derivatives in this worker.
      const field = prepareField({ ...request.config, numerics: { ...request.config.numerics, derivativeMethod: 'finite' } });
      const output = await computeLines(request.config, field.evaluate, { startedAt, cancelled: () => request.id !== latestId });
      if (output && request.id === latestId) worker.postMessage({ type: 'lines', id: request.id, revision: request.revision, ...output });
    } catch (cause) {
      if (request.id === latestId) worker.postMessage({ type: 'failure', id: request.id, revision: request.revision, message: cause instanceof Error ? cause.message : 'No se pudo integrar este campo.' });
    }
  })();
};
