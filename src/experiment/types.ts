export type Vec3 = [number, number, number];
export type Domain = [Vec3, Vec3];
export type Components = [string, string, string];
export type FieldId = 'uniform' | 'outward' | 'inward' | 'rotation' | 'helix' | 'saddle' | 'custom';
export interface Parameter { value: number; min: number; max: number; step: number }
export type Parameters = Partial<Record<'a' | 'b' | 'c', Parameter>>;
export interface Numerics {
  derivativeMethod: 'auto' | 'finite'; eta: number;
  integration: 'adaptive' | 'fixed'; stepFactor: number; minStepFactor: number; maxStepFactor: number;
  atolFactor: number; rtol: number; zeroThreshold: number; maxLengthFactor: number; maxSteps: number; closeLoops: boolean;
}
export interface ExperimentConfigV1 {
  schemaVersion: 1; engineVersion: string; fieldId: FieldId; components: Components; parameters: Parameters;
  domain: Domain; resolution: 5 | 9 | 13 | 17 | 21; numerics: Numerics; seeds: Vec3[];
  layers: { arrows: boolean; vectors: 'field' | 'curl'; lines: boolean; seeds: boolean; axes: boolean; cut: boolean; scalar: 'none' | 'magnitude' | 'divergence' };
  slice: { plane: 'XY' | 'XZ' | 'YZ'; position: number; resolution: 65 | 129 };
  scales: { field: number; curl: number; magnitude: number; divergence: number; directionOnly: boolean };
  graphics: { pixelRatio: 1 | 1.5 | 2 };
  camera: { position: Vec3; target: Vec3; zoom: number }; inspected: Vec3;
}
export type EvaluationResult = { valid: true; vector: Vec3; norm: number } | { valid: false; reason: 'undefined' | 'complex' | 'non-finite'; message: string };
export type DerivativeResult = { valid: true; jacobian: [Vec3, Vec3, Vec3]; divergence: number; curl: Vec3; method: 'analytic' | 'symbolic' | 'finite'; error: number; reliable: boolean } | { valid: false; method: 'unavailable'; message: string };
export interface FieldSample { point: Vec3; evaluation: EvaluationResult; derivative: DerivativeResult }
export interface FieldDefinition { id: Exclude<FieldId, 'custom'>; name: string; subtitle: string; components: Components; parameters: Parameters; equilibrium: string; description: string; evaluate: (p: Vec3, parameters: Record<string, number>) => Vec3; jacobian: (p: Vec3, parameters: Record<string, number>) => [Vec3, Vec3, Vec3] }
export type StopReason = 'boundary' | 'undefined' | 'zero' | 'min-step' | 'max-length' | 'max-steps' | 'vertices' | 'time' | 'cancelled' | 'closed' | 'outside';
export interface StreamBranch { positions: Vec3[]; reason: StopReason; length: number; accepted: number; rejected: number; direction: 1 | -1 }
export interface StreamlineResult { seed: Vec3; forward: StreamBranch; backward: StreamBranch; closed: boolean }
export interface ComputeResult { equationTex?: Components; revision: number; samples: FieldSample[]; slice: FieldSample[]; lines: StreamlineResult[]; stats: { valid: number; invalid: number; zeros: number; fieldMs: number; linesMs: number; partial: boolean; inactiveSeeds: number; message?: string }; config: ExperimentConfigV1 }
