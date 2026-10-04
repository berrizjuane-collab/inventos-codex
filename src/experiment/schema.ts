import { z } from 'zod';
import { getField } from '../math/catalog';
import type { ExperimentConfigV1 } from './types';

export const MAX_CONFIG_BYTES = 1024 * 1024;
const finite = () => z.number().finite();
const bounded = (min: number, max: number) => finite().min(min).max(max);
const positive = () => finite().positive();
const vec3 = () => z.tuple([finite(), finite(), finite()]);
const domainPoint = () => z.tuple([bounded(-1e4, 1e4), bounded(-1e4, 1e4), bounded(-1e4, 1e4)]);
const cameraPoint = () => z.tuple([bounded(-1e7, 1e7), bounded(-1e7, 1e7), bounded(-1e7, 1e7)]);

const parameter = z.strictObject({ value: finite(), min: finite(), max: finite(), step: positive() })
  .superRefine((value, ctx) => {
    if (value.min >= value.max) ctx.addIssue({ code: 'custom', path: ['max'], message: 'El mínimo debe ser menor que el máximo.' });
    if (value.value < value.min || value.value > value.max) ctx.addIssue({ code: 'custom', path: ['value'], message: 'El valor debe estar dentro del intervalo del parámetro.' });
  });

/** Solo datos reproducibles: cada objeto rechaza propiedades desconocidas. */
export const experimentConfigSchema = z.strictObject({
  schemaVersion: z.literal(1),
  engineVersion: z.literal('1.0.0'),
  fieldId: z.enum(['uniform', 'outward', 'inward', 'rotation', 'helix', 'saddle', 'custom']),
  components: z.tuple([z.string().min(1).max(256), z.string().min(1).max(256), z.string().min(1).max(256)]),
  parameters: z.strictObject({ a: parameter.optional(), b: parameter.optional(), c: parameter.optional() }),
  domain: z.tuple([domainPoint(), domainPoint()]),
  resolution: z.union([z.literal(5), z.literal(9), z.literal(13), z.literal(17), z.literal(21)]),
  numerics: z.strictObject({
    derivativeMethod: z.enum(['auto', 'finite']), eta: bounded(1e-8, .01),
    integration: z.enum(['adaptive', 'fixed']),
    stepFactor: bounded(1e-6, .1), minStepFactor: bounded(1e-9, .001), maxStepFactor: bounded(1e-5, .1),
    atolFactor: bounded(1e-12, .01), rtol: bounded(1e-12, .01), zeroThreshold: bounded(1e-14, .001),
    maxLengthFactor: bounded(.01, 8), maxSteps: bounded(20, 1500).int(), closeLoops: z.boolean(),
  }).superRefine((value, ctx) => {
    if (value.minStepFactor > value.stepFactor || value.stepFactor > value.maxStepFactor) {
      ctx.addIssue({ code: 'custom', path: ['stepFactor'], message: 'Debe cumplirse paso mínimo ≤ inicial ≤ máximo.' });
    }
  }),
  seeds: z.array(vec3()).max(64),
  layers: z.strictObject({
    arrows: z.boolean(), vectors: z.enum(['field', 'curl']), lines: z.boolean(), seeds: z.boolean(),
    axes: z.boolean(), cut: z.boolean(), scalar: z.enum(['none', 'magnitude', 'divergence']),
  }),
  slice: z.strictObject({ plane: z.enum(['XY', 'XZ', 'YZ']), position: finite(), resolution: z.union([z.literal(65), z.literal(129)]) }),
  scales: z.strictObject({ field: positive(), curl: positive(), magnitude: positive(), divergence: positive(), directionOnly: z.boolean() }),
  graphics: z.strictObject({ pixelRatio: z.union([z.literal(1), z.literal(1.5), z.literal(2)]) }),
  camera: z.strictObject({ position: cameraPoint(), target: cameraPoint(), zoom: bounded(.05, 100) }),
  inspected: vec3(),
}).superRefine((config, ctx) => {
  for (let axis = 0; axis < 3; axis++) {
    const length = config.domain[1][axis] - config.domain[0][axis];
    if (length < 1e-3 || length > 1e4) ctx.addIssue({ code: 'custom', path: ['domain', 1, axis], message: 'Cada intervalo debe medir entre 0,001 y 10 000.' });
  }
  const normal = config.slice.plane === 'XY' ? 2 : config.slice.plane === 'XZ' ? 1 : 0;
  if (config.slice.position < config.domain[0][normal] || config.slice.position > config.domain[1][normal]) {
    ctx.addIssue({ code: 'custom', path: ['slice', 'position'], message: 'El corte debe estar dentro del dominio.' });
  }
  if (config.camera.position.every((value, axis) => value === config.camera.target[axis])) {
    ctx.addIssue({ code: 'custom', path: ['camera', 'target'], message: 'La posición y el objetivo de la cámara deben ser distintos.' });
  }
  if (config.fieldId !== 'custom') {
    const field = getField(config.fieldId)!;
    if (config.components.some((component, index) => component !== field.components[index])) {
      ctx.addIssue({ code: 'custom', path: ['components'], message: 'Las componentes no corresponden al campo del catálogo indicado.' });
    }
    const names = Object.keys(config.parameters).sort();
    if (names.join(',') !== Object.keys(field.parameters).sort().join(',')) {
      ctx.addIssue({ code: 'custom', path: ['parameters'], message: 'Los parámetros no corresponden al campo del catálogo indicado.' });
    }
  }
});

function checkedConfig(value: unknown): ExperimentConfigV1 {
  const result = experimentConfigSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.length ? ` (${issue.path.join('.')})` : '';
    const detail = issue.code === 'custom' ? issue.message : 'Revisa el tipo, los límites y las propiedades permitidas.';
    throw new Error(`Configuración inválida${path}: ${detail}`);
  }
  return result.data;
}

/** JSON decimal sin redondeos; conserva también el cero con signo IEEE-754. */
function exactJson(value: unknown, depth = 0): string {
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(item => exactJson(item, depth + 1)).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    const indent = '  '.repeat(depth);
    return `{\n${entries.map(([key, item]) => `${indent}  ${JSON.stringify(key)}: ${exactJson(item, depth + 1)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

/** Exporta exclusivamente el estado aplicado que facilita el coordinador. */
export function serializeConfig(config: ExperimentConfigV1): string {
  return exactJson(checkedConfig(config)) + '\n';
}

/** Valida por completo antes de devolver un estado que la interfaz pueda aplicar. */
export async function parseConfig(text: string): Promise<ExperimentConfigV1> {
  if (new TextEncoder().encode(text).byteLength > MAX_CONFIG_BYTES) throw new Error('La configuración supera el límite de 1 MiB.');
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error('El archivo no contiene JSON válido.'); }
  const config = checkedConfig(value);
  // El editor normal y el importador comparten exactamente la misma gramática.
  // Carga diferida: este módulo no añade mathjs al arranque de la interfaz.
  const { validateComponents } = await import('../math/engine');
  const validation = validateComponents(config.components);
  if (!validation.ok) {
    const error = validation.errors[0];
    throw new Error(`Componente ${['P', 'Q', 'R'][error.component]} inválida: ${error.message}`);
  }
  const names = Object.keys(config.parameters).sort();
  if (names.join(',') !== [...validation.usedParameters].sort().join(',')) {
    throw new Error('Los parámetros deben coincidir exactamente con los utilizados en las expresiones.');
  }
  return config;
}
