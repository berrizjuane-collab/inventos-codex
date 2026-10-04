import type { Components, ComputeResult, ExperimentConfigV1, FieldSample, StreamlineResult, Vec3 } from '../experiment/types';

export interface ValidationResult {
  ok: boolean;
  errors: { component: number; message: string }[];
  usedParameters: ('a' | 'b' | 'c')[];
}

export type FieldRequest =
  | { type: 'compute'; revision: number; config: ExperimentConfigV1; forceFinite?: boolean }
  | { type: 'cancel'; revision: number }
  | { type: 'inspect'; id: number; revision: number; config: ExperimentConfigV1; point: Vec3; forceFinite?: boolean }
  | { type: 'validate'; id: number; components: Components };

/** All values remain Float64 on the CPU; these buffers are transferred, never shared. */
export interface FieldBuffers {
  positions: Float64Array;
  vectors: Float64Array;
  /** 0 = uncomputed, 1 = invalid, 2 = finite real vector. */
  validity: Uint8Array;
}
export type FieldResponse =
  | { type: 'result'; revision: number; result: ComputeResult; buffers: FieldBuffers }
  | { type: 'inspection'; id: number; revision: number; sample: FieldSample }
  | { type: 'validation'; id: number; validation: ValidationResult }
  | { type: 'failure'; operation: 'compute'; revision: number; message: string }
  | { type: 'failure'; operation: 'inspect' | 'validate'; id: number; revision?: number; message: string };

/** The single gate used by the hook and by tests of deliberately delayed replies. */
export class RevisionGate {
  private revision = 0;
  next(): number { return ++this.revision; }
  accepts(revision: number): boolean { return revision === this.revision; }
  current(): number { return this.revision; }
}

export function shouldPublishRevision(activeRevision: number, responseRevision: number): boolean {
  return activeRevision === responseRevision;
}

/** Only field-dependent settings invalidate the 3D sampling grid. */
export function fieldGridKey(config: ExperimentConfigV1): string {
  return JSON.stringify([
    config.fieldId, config.components,
    ['a', 'b', 'c'].map(name => config.parameters[name as 'a' | 'b' | 'c'] ?? null),
    config.domain, config.resolution,
    config.numerics.derivativeMethod, config.numerics.eta, config.numerics.zeroThreshold,
  ]);
}

export function sliceActive(config: ExperimentConfigV1): boolean {
  return config.layers.cut || config.layers.scalar !== 'none';
}

export function fieldComputeKey(config: ExperimentConfigV1): string {
  return JSON.stringify([fieldGridKey(config), sliceActive(config) ? config.slice : null]);
}

export function integrationSettings(config: ExperimentConfigV1) {
  const { derivativeMethod: _derivative, eta: _eta, ...integration } = config.numerics;
  return integration;
}
export function lineComputeKey(config: ExperimentConfigV1): string {
  return JSON.stringify([fieldGridKey(config), config.seeds, integrationSettings(config), config.layers.lines]);
}
export type LinesRequest =
  | { type: 'compute'; id: number; revision: number; config: ExperimentConfigV1 }
  | { type: 'cancel'; id: number };
export interface LinesStats { linesMs: number; partial: boolean; vertices: number; inactiveSeeds: number; message?: string }
export type LinesResponse =
  | { type: 'lines'; id: number; revision: number; lines: StreamlineResult[]; stats: LinesStats }
  | { type: 'failure'; id: number; revision: number; message: string };
export interface LinesSnapshot { revision: number; key: string; lines: StreamlineResult[]; stats: LinesStats }
export function acceptsLineResponse(active: { id: number; revision: number } | null, response: { id: number; revision: number }): boolean {
  return active !== null && active.id === response.id && active.revision === response.revision;
}

/** Never replace applied equations/domain with those of a still-pending request. */
export function withVisualConfig(applied: ExperimentConfigV1, request: ExperimentConfigV1): ExperimentConfigV1 {
  const sliceCompatible = !sliceActive(request) || (sliceActive(applied) && JSON.stringify(applied.slice) === JSON.stringify(request.slice));
  return {
    ...applied,
    layers: { ...request.layers, cut: sliceCompatible ? request.layers.cut : applied.layers.cut, scalar: sliceCompatible ? request.layers.scalar : applied.layers.scalar },
    scales: request.scales,
    camera: request.camera,
    inspected: request.inspected,
    graphics: request.graphics,
    ...(fieldGridKey(applied) === fieldGridKey(request) ? {
      seeds: request.seeds,
      numerics: { ...applied.numerics, ...integrationSettings(request) },
    } : {}),
  };
}
