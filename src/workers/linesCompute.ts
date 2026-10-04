import { yieldToMessages } from './yieldControl';
import type { EvaluationResult, ExperimentConfigV1, StreamBranch, StreamlineResult, Vec3 } from '../experiment/types';
import { integrateBranchSteps } from '../numerics/streamlines';
import type { LinesStats } from './protocol';

export interface LinesComputeOptions {
  cancelled?: () => boolean; now?: () => number; yieldControl?: () => Promise<void>;
  budgetMs?: number; startedAt?: number; maxVertices?: number; blockMs?: number;
}
const emptyBranch = (reason: StreamBranch['reason'], direction: 1 | -1): StreamBranch => ({ positions: [], reason, length: 0, accepted: 0, rejected: 0, direction });

export async function computeLines(
  config: ExperimentConfigV1,
  evaluate: (point: Vec3) => EvaluationResult,
  options: LinesComputeOptions = {},
): Promise<{ lines: StreamlineResult[]; stats: LinesStats } | null> {
  const now = options.now ?? (() => performance.now());
  const startedAt = options.startedAt ?? now(), budgetMs = options.budgetMs ?? 5_000;
  const deadline = startedAt + budgetMs;
  const maxVertices = Math.min(options.maxVertices ?? 120_000, 120_000);
  const blockMs = Math.min(options.blockMs ?? 16, 50);
  const cancelled = options.cancelled ?? (() => false), yieldControl = options.yieldControl ?? yieldToMessages;
  const lines: StreamlineResult[] = [];
  let vertices = 0, partial = false, blockStart = now(), attempts = 0;
  async function branch(seed: Vec3, direction: 1 | -1): Promise<StreamBranch | null> {
    const iterator = integrateBranchSteps(evaluate, seed, config, direction, {
      cancelled, deadline, maxVertices: Math.max(0, maxVertices - vertices),
    });
    while (true) {
      if (cancelled()) { iterator.return(emptyBranch('cancelled', direction)); return null; }
      const next = iterator.next();
      if (next.done) return next.value;
      if (now() - blockStart >= blockMs || ++attempts % 32 === 0) {
        await yieldControl();
        if (cancelled()) { iterator.return(emptyBranch('cancelled', direction)); return null; }
        blockStart = now();
      }
    }
  }
  for (const seed of config.seeds) {
    if (cancelled()) return null;
    if (now() >= deadline || vertices >= maxVertices) { partial = true; break; }
    const forward = await branch(seed, 1);
    if (!forward) return null;
    vertices += forward.positions.length;
    let backward: StreamBranch;
    if (forward.reason === 'closed') backward = emptyBranch('closed', -1);
    else if (vertices >= maxVertices) backward = emptyBranch('vertices', -1);
    else if (now() >= deadline) backward = emptyBranch('time', -1);
    else {
      const result = await branch(seed, -1);
      if (!result) return null;
      backward = result;
      vertices += backward.positions.length;
    }
    if ([forward.reason, backward.reason].some(reason => reason === 'time' || reason === 'vertices')) partial = true;
    lines.push({ seed: [...seed], forward, backward, closed: forward.reason === 'closed' || backward.reason === 'closed' });
    if (partial) break;
    // Even quick or invalid branches give queued cancellation messages an opportunity to run.
    await yieldControl();
    if (cancelled()) return null;
    blockStart = now();
  }
  const inactiveSeeds = config.seeds.filter(seed => seed.some((value, axis) => value < config.domain[0][axis] || value > config.domain[1][axis])).length;
  return { lines, stats: {
    linesMs: now() - startedAt, partial, vertices, inactiveSeeds,
    ...(partial ? { message: `Líneas parciales: ${lines.length} de ${config.seeds.length} semillas; ${vertices} de ${maxVertices} vértices; presupuesto ${budgetMs / 1_000} s.` } : {}),
  } };
}
