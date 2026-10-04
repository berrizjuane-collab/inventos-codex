import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { ComputeResult, ExperimentConfigV1, FieldSample, Vec3 } from '../../src/experiment/types';
import { analyticSample, sampleCatalog } from '../../src/math/catalog';
import { buildPngMetadata, wrapPngText } from '../../src/exports/png';

function result(config: ExperimentConfigV1, samples: FieldSample[], slice: FieldSample[] = []): ComputeResult {
  return { revision: 7, config, samples, slice, lines: [], stats: { valid: samples.filter(sample => sample.evaluation.valid).length, invalid: samples.filter(sample => !sample.evaluation.valid).length, zeros: 0, fieldMs: 0, linesMs: 0, partial: false, inactiveSeeds: 0 } };
}
function caption(config: ExperimentConfigV1, computed: ComputeResult) {
  const metadata = buildPngMetadata(config, computed);
  return [metadata.title, metadata.subtitle, ...metadata.equations, ...metadata.header, ...metadata.columns.flatMap(column => [column.title, ...column.lines])].join('\n');
}
function sampled(config: ExperimentConfigV1, point: Vec3, edits: Partial<FieldSample> = {}): FieldSample {
  return { ...analyticSample(config, point), ...edits };
}

describe('scientific PNG captions', () => {
  it('exports applied equations, precise values and neutral scientific semantics', () => {
    const config = defaultConfig();
    config.fieldId = 'helix'; config.components = ['-y', 'x', 'a'];
    config.parameters = { a: { value: 0.12345678901234567, min: -3, max: 3, step: .1 } };
    const before = structuredClone(config);
    const computed = result(config, sampleCatalog(config));
    const text = caption(config, computed);
    expect(text).toContain('R(x,y,z) = a');
    expect(text).toContain('a = 0.12345678901234566');
    expect(text).toContain('x [-3, 3] × y [-3, 3] × z [-3, 3]');
    expect(text).toContain('Cámara ortográfica · z vertical');
    expect(text).toContain('729 válidas, 0 no definidas, 0 sin calcular');
    expect(text).toContain('Longitud = 0.1 × norma 3D');
    expect(text).not.toContain('sin normalización automática');
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(config).toEqual(before);
  });

  it('counts saturation with the same vectors and scale as the scene, keeping true zeros distinct', () => {
    const config = defaultConfig(); config.scales.field = 1;
    const text = caption(config, result(config, sampleCatalog(config)));
    expect(text).toContain('⊖ 720 flechas limitadas');
    expect(text).toContain('○ 9 ceros evaluados');
    expect(text).toContain('Tope visual 0.6 u');
    config.scales.directionOnly = true;
    const directions = caption(config, result(config, sampleCatalog(config)));
    expect(directions).toContain('Solo dirección: longitud uniforme, sin codificar magnitud');
    expect(directions).toContain('⊖ 0 flechas limitadas');
    expect(directions).not.toContain('Longitud = 1 × norma');
  });

  it('identifies projected curl and its perpendicular sign without calling a nonzero vector zero', () => {
    const config = defaultConfig(); config.layers.cut = true; config.layers.vectors = 'curl';
    const derivative = { valid: true as const, jacobian: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] as [Vec3, Vec3, Vec3], divergence: 0, curl: [0, 0, -2] as Vec3, method: 'finite' as const, error: 1, reliable: true };
    const slice = [sampled(config, [-3, -3, 0]), sampled(config, [3, 3, 0], { derivative }), sampled(config, [0, 0, 0], { derivative: { ...derivative, reliable: false } })];
    const text = caption(config, result(config, [], slice));
    expect(text).toContain('Rotacional proyectado · ∇×Fₚ');
    expect(text).toContain('Doble punta = dirección de ∇×F');
    expect(text).toContain('componente perpendicular a +z');
    expect(text).toContain('1 positivas / 1 negativas; 2 proyecciones nulas con vector 3D no nulo');
    expect(text).toContain('○ 0 ceros evaluados');
    expect(text).toContain('círculo ?: 1 derivadas no fiables');
  });

  it('preserves missing, undefined, unreliable, analytic zero and approximate zero as different scalar states', () => {
    const config = defaultConfig(); config.layers.cut = true; config.layers.scalar = 'divergence';
    const numeric = sampled(config, [3, 3, 0]);
    if (!numeric.derivative.valid) throw new Error('Expected catalog derivative');
    numeric.derivative = { ...numeric.derivative, method: 'finite', divergence: 5e-8 };
    const unreliable = sampled(config, [3, -3, 0]);
    if (!unreliable.derivative.valid) throw new Error('Expected catalog derivative');
    unreliable.derivative = { ...unreliable.derivative, reliable: false };
    const invalid = sampled(config, [-3, 3, 0], { derivative: { valid: false, method: 'unavailable', message: 'No disponible' } });
    const text = caption(config, result(config, [], [sampled(config, [-3, -3, 0]), numeric, unreliable, invalid, sampled(config, [0.123, 0, 0]), sampled(config, [0, 0, 1])]));
    expect(text).toContain('escala fija [−3, +3]');
    expect(text).toContain('0 analítico (1); ≈0 numérico (1), |valor| ≤ 1e-7');
    expect(text).toContain('2 valores válidos');
    expect(text).toContain('Trama cruzada: 1 no definidos; puntos: 4221 sin muestra; guiones: 1 no fiables');
    expect(text).toContain('+ y trama / = positivo; − y trama \\ = negativo');
  });

  it('uses the full 3D norm for scalar magnitude while vector lengths use the projected norm', () => {
    const config = defaultConfig(); config.layers.cut = true; config.layers.scalar = 'magnitude';
    const slice = [sampled(config, [0, 0, 0], { evaluation: { valid: true, vector: [3, 4, 12], norm: 13 } })];
    const text = caption(config, result(config, [], slice));
    expect(text).toContain('Longitud = 0.1 × norma proyectada');
    expect(text).toContain('⊖ 0 flechas limitadas');
    expect(text).toContain('Magnitud ‖F‖ 3D: escala fija [0, 6]');
    expect(text).toContain('1 valores fuera de escala');
    expect(text).toContain('1 positivas / 0 negativas; 0 proyecciones nulas');
  });

  it('documents the actual fixed/adaptive numerical settings, partial work and oriented lines', () => {
    const config = defaultConfig(); config.layers.lines = true; config.numerics.integration = 'fixed';
    config.numerics.stepFactor = .02; config.numerics.zeroThreshold = 1e-8; config.numerics.closeLoops = false;
    config.seeds = [[0, 0, 0], [5, 0, 0]];
    const computed = result(config, [sampled(config, [0, 0, 0])]);
    computed.stats.partial = true; computed.stats.message = 'Presupuesto de tiempo agotado.';
    computed.lines = [{ seed: [0, 0, 0], closed: false, forward: { positions: [[0, 0, 0]], reason: 'zero', length: 0, accepted: 0, rejected: 0, direction: 1 }, backward: { positions: [[0, 0, 0]], reason: 'zero', length: 0, accepted: 0, rejected: 0, direction: -1 } }];
    const text = caption(config, computed);
    expect(text).toContain('× Semillas: 1 activas; 1 exteriores');
    expect(text).toContain('chevrones según F, grosor constante; no representan rapidez');
    expect(text).toContain('RK4 paso fijo');
    expect(text).toContain('h₀ = 0.02ℓ');
    expect(text).toContain('sin control de error adaptativo');
    expect(text).not.toContain('criterio E ≤');
    expect(text).toContain('Umbral ‖F‖ = 1e-8');
    expect(text).toContain('Cierre aproximado desactivado. RESULTADO PARCIAL');
    expect(text).toContain('magnitud bajo umbral 2');
    expect(text).toContain('728 sin calcular');
    expect(text).toContain('Presupuesto de tiempo agotado.');
  });

  it('does not advertise hidden vector or scalar encodings as visible', () => {
    const config = defaultConfig(); config.layers.arrows = false; config.layers.seeds = false;
    const text = caption(config, result(config, sampleCatalog(config)));
    expect(text).toContain('Flechas ocultas.');
    expect(text).not.toContain('Punta simple');
    expect(text).not.toContain('Semillas:');
    expect(text).not.toContain('gris = valor');
    expect(text).not.toContain('trama /');
  });
});

describe('untruncated PNG equations', () => {
  it('wraps full-length mathematical expressions without losing signs, separators or any character', () => {
    const expression = `sin(x)+${'1'.repeat(240)}+a*cos(z)`;
    const lines = wrapPngText(expression, 48, text => text.length);
    expect(lines.join('')).toBe(expression);
    expect(lines.every(line => line.length > 0 && line.length <= 48)).toBe(true);
    expect(lines.length).toBeGreaterThan(5);
  });

  it('retains long metadata, decimal precision and whitespace with natural breaks', () => {
    const text = 'B = x [-123.45678901234567, 300] × y [-3, 3] × z [-1e-8, 3]';
    const lines = wrapPngText(text, 22, value => value.length);
    expect(lines.join('')).toBe(text);
    expect(lines.every(line => line.length <= 22)).toBe(true);
    expect(wrapPngText('', 22, value => value.length)).toEqual(['']);
  });
});
