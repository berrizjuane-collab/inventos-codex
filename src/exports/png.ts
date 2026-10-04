import type { ComputeResult, ExperimentConfigV1, FieldSample } from '../experiment/types';
import { getField } from '../math/catalog';
import { glyphAxes, glyphStats } from '../scene/glyphs';
import type { SceneHandle } from '../scene/SceneView';
import { DIVERGENCE_DISPLAY_ZERO, mapSliceSampleToCell } from '../scene/scalarTexture';
import { stopLabels } from '../ui/labels';

export interface PngMetadata {
  title: string;
  subtitle: string;
  equations: [string, string, string];
  header: string[];
  columns: { title: string; lines: string[] }[];
}

const number = (value: number) => String(Object.is(value, -0) ? 0 : value);
const coordinates = (point: number[]) => `(${point.map(number).join(', ')})`;
const inside = (config: ExperimentConfigV1, point: number[]) => point.every((value, axis) => Number.isFinite(value) && value >= config.domain[0][axis] && value <= config.domain[1][axis]);

function sliceCounts(config: ExperimentConfigV1, samples: FieldSample[]) {
  // Match the rendered texture: duplicate cells replace earlier samples, and
  // off-grid/off-plane points never erase an actually missing cell.
  const cells = new Map<number, FieldSample>();
  for (const sample of samples) {
    const position = mapSliceSampleToCell(config, sample.point);
    if (position) cells.set(position.row * config.slice.resolution + position.column, sample);
  }
  let valid = 0, invalid = 0, unreliable = 0, saturated = 0, analyticZero = 0, nearZero = 0;
  const divergence = config.layers.scalar === 'divergence';
  const limit = divergence ? config.scales.divergence : config.scales.magnitude;
  for (const sample of cells.values()) {
    let value: number;
    if (divergence) {
      const derivative = sample.derivative;
      if (!derivative.valid || !Number.isFinite(derivative.divergence)) { invalid++; continue; }
      if (!derivative.reliable) { unreliable++; continue; }
      value = derivative.divergence;
      if (value === 0 && derivative.method === 'analytic') analyticZero++;
      if (derivative.method !== 'analytic' && Math.abs(value) <= DIVERGENCE_DISPLAY_ZERO) nearZero++;
    } else {
      const evaluation = sample.evaluation;
      if (!evaluation.valid || !Number.isFinite(evaluation.norm) || evaluation.norm < 0) { invalid++; continue; }
      value = evaluation.norm;
    }
    valid++;
    if (Math.abs(value) > limit) saturated++;
  }
  return { valid, invalid, unreliable, saturated, analyticZero, nearZero, missing: config.slice.resolution ** 2 - cells.size };
}

/** Scientific captions are derived only from the experiment being exported. */
export function buildPngMetadata(config: ExperimentConfigV1, result: ComputeResult): PngMetadata {
  const glyphs = glyphStats(config, result);
  const normal = ['x', 'y', 'z'][glyphAxes(config.slice.plane)[2]];
  const vectorName = config.layers.vectors === 'curl' ? '∇×F' : 'F';
  const vectorTitle = `${config.layers.vectors === 'curl' ? 'Rotacional' : 'Campo vectorial'}${config.layers.cut ? ' proyectado' : ' 3D'} · ${vectorName}${config.layers.cut ? 'ₚ' : ''}`;
  const vectorLines: string[] = [];
  if (config.layers.arrows) {
    vectorLines.push(`${config.layers.vectors === 'curl' ? 'Doble punta' : 'Punta simple'} = dirección de ${vectorName}.`);
    vectorLines.push(config.scales.directionOnly
      ? 'Solo dirección: longitud uniforme, sin codificar magnitud.'
      : `Longitud = ${number(glyphs.scale)} × norma ${config.layers.cut ? 'proyectada' : '3D'}; unidades espaciales.`);
    vectorLines.push(`Tope visual ${number(Number(glyphs.maximumLength.toPrecision(10)))} u; ⊖ ${glyphs.saturated} flechas limitadas.`);
    vectorLines.push(`○ ${glyphs.zero} ceros evaluados; ${glyphs.tiny} vectores demasiado pequeños.`);
    vectorLines.push(config.layers.cut
      ? `Cuadro cruzado: ${glyphs.invalid} glifos no definidos; círculo ?: ${glyphs.unreliable} derivadas no fiables.`
      : `${glyphs.invalid} vectores no definidos y ${glyphs.unreliable} derivadas no fiables; se omiten.`);
    if (config.layers.cut) {
      vectorLines.push(`Proyección sobre ${config.slice.plane}; ⊙+ / ⊗− = componente perpendicular a +${normal}.`);
      vectorLines.push(`${glyphs.perpendicularPositive} positivas / ${glyphs.perpendicularNegative} negativas; ${glyphs.projectedZero} proyecciones nulas con vector 3D no nulo.`);
    }
  } else vectorLines.push('Flechas ocultas.');
  if (config.layers.seeds) {
    const activeSeeds = config.seeds.filter(point => inside(config, point)).length;
    vectorLines.push(`× Semillas: ${activeSeeds} activas; ${config.seeds.length - activeSeeds} exteriores.`);
  }
  if (inside(config, config.inspected)) vectorLines.push(`◇ Selección con doble contorno: ${coordinates(config.inspected)}.`);
  if (config.layers.lines) vectorLines.push('Líneas 3D de F: chevrones según F, grosor constante; no representan rapidez ni líneas del campo proyectado.');

  const scalarLines: string[] = [];
  let scalarTitle = 'Dominio y muestreo';
  if (config.layers.cut) {
    scalarTitle = `Corte ${config.slice.plane} · ${normal} = ${number(config.slice.position)}`;
    scalarLines.push('Contorno discontinuo; valores y operadores del campo 3D.');
    const counts = sliceCounts(config, result.slice);
    if (config.layers.scalar === 'magnitude') {
      scalarLines.push(`Magnitud ‖F‖ 3D: escala fija [0, ${number(config.scales.magnitude)}]; gris = valor.`);
    } else if (config.layers.scalar === 'divergence') {
      scalarLines.push(`Divergencia ∇·F 3D: escala fija [−${number(config.scales.divergence)}, +${number(config.scales.divergence)}].`);
      scalarLines.push(`Gris = |valor|; + y trama / = positivo; − y trama \\ = negativo.`);
      scalarLines.push(`0 analítico (${counts.analyticZero}); ≈0 numérico (${counts.nearZero}), |valor| ≤ ${number(DIVERGENCE_DISPLAY_ZERO)}.`);
    }
    scalarLines.push(`Corte ${config.slice.resolution}²: ${config.slice.resolution ** 2} posiciones; ${counts.valid} valores válidos.`);
    if (config.layers.scalar !== 'none') scalarLines.push(`${counts.saturated} valores fuera de escala; sin normalización automática.`);
    scalarLines.push(`Trama cruzada: ${counts.invalid} no definidos; puntos: ${counts.missing} sin muestra; guiones: ${counts.unreliable} no fiables.`);
    if (config.layers.scalar === 'none') scalarLines.push('Capa escalar oculta.');
  } else scalarLines.push('Sin plano de corte activo.');
  const available = result.samples.filter(sample => sample.point.every(Number.isFinite));
  const valid3D = available.filter(sample => sample.evaluation.valid).length;
  scalarLines.push(`Malla ${config.resolution}³: ${config.resolution ** 3} posiciones; ${valid3D} válidas, ${available.length - valid3D} no definidas, ${Math.max(0, config.resolution ** 3 - available.length)} sin calcular.`);
  scalarLines.push('Ejes con igual escala espacial; cantidades adimensionales.');

  const numerics = config.numerics;
  const methodCounts = { analytic: 0, symbolic: 0, finite: 0, unavailable: 0, unreliable: 0 };
  for (const sample of available) {
    const derivative = sample.derivative;
    if (!derivative.valid) methodCounts.unavailable++;
    else { methodCounts[derivative.method]++; if (!derivative.reliable) methodCounts.unreliable++; }
  }
  const methodLines = [
    `Derivadas: ${numerics.derivativeMethod === 'auto' ? 'automático' : 'diferencias finitas'}; η = ${number(numerics.eta)}.`,
    `Malla 3D: ${methodCounts.analytic} analíticas / ${methodCounts.symbolic} simbólicas / ${methodCounts.finite} numéricas; ${methodCounts.unavailable} no disponibles, ${methodCounts.unreliable} no fiables.`,
    `RK4 ${numerics.integration === 'adaptive' ? 'adaptativo' : 'paso fijo'}; dr/ds = ±F/‖F‖, sin rapidez.`,
    `ℓ = diagonal de B; h₀ = ${number(numerics.stepFactor)}ℓ; h mín/máx = ${number(numerics.minStepFactor)}ℓ / ${number(numerics.maxStepFactor)}ℓ.`,
    `atol = ${number(numerics.atolFactor)}ℓ; rtol = ${number(numerics.rtol)}; ${numerics.integration === 'adaptive' ? 'criterio E ≤ atol + rtol·h.' : 'configuradas, sin control de error adaptativo.'}`,
    `Umbral ‖F‖ = ${number(numerics.zeroThreshold)}; longitud máxima = ${number(numerics.maxLengthFactor)}ℓ por sentido; ${numerics.maxSteps} pasos máx.`,
    `Cierre aproximado ${numerics.closeLoops ? 'activo' : 'desactivado'}. ${result.stats.partial ? 'RESULTADO PARCIAL: límite de recursos.' : 'Revisión calculada.'}`,
  ];
  if (config.layers.lines) {
    const reasons = new Map<string, number>();
    for (const line of result.lines) for (const branch of [line.forward, line.backward]) reasons.set(stopLabels[branch.reason], (reasons.get(stopLabels[branch.reason]) ?? 0) + 1);
    methodLines.push(`Líneas calculadas: ${result.lines.length} / ${config.seeds.length} semillas; paradas: ${Array.from(reasons, ([reason, count]) => `${reason} ${count}`).join(', ') || 'sin ramas'}.`);
  }
  if (result.stats.message) methodLines.push(result.stats.message);

  const parameters = Object.entries(config.parameters).map(([name, parameter]) => `${name} = ${number(parameter.value)}`).join(' · ');
  return {
    title: 'Laboratorio de campos vectoriales',
    subtitle: `${getField(config.fieldId)?.name ?? 'Campo personalizado'} · experimento aplicado · revisión ${result.revision}`,
    equations: config.components.map((expression, index) => `${['P', 'Q', 'R'][index]}(x,y,z) = ${expression}`) as [string, string, string],
    header: [
      ...(parameters ? [`Parámetros aplicados: ${parameters}`] : []),
      `B = ${config.domain[0].map((lower, axis) => `${['x', 'y', 'z'][axis]} [${number(lower)}, ${number(config.domain[1][axis])}]`).join(' × ')}`,
      `Cámara ortográfica · z vertical · posición ${coordinates(config.camera.position)} · objetivo ${coordinates(config.camera.target)} · zoom ${number(config.camera.zoom)}`,
    ],
    columns: [{ title: vectorTitle, lines: vectorLines }, { title: scalarTitle, lines: scalarLines }, { title: 'Métodos y diagnóstico', lines: methodLines }],
  };
}

/** Wrap without losing any character, including uninterrupted 256-character expressions. */
export function wrapPngText(text: string, maximumWidth: number, measure: (text: string) => number): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  let remaining = text;
  while (remaining.length) {
    let length = 0, preferred = 0;
    while (length < remaining.length && measure(remaining.slice(0, length + 1)) <= maximumWidth) {
      length++;
      if (/[\s+*/^,;=)]/.test(remaining[length - 1]) || (remaining[length - 1] === '-' && length > 1)) preferred = length;
    }
    if (length === remaining.length) { lines.push(remaining); break; }
    const end = preferred > length / 2 ? preferred : Math.max(1, length);
    lines.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  return lines;
}

/** Render only the scientific scene, then compose neutral, readable metadata. */
export async function exportPng(scene: SceneHandle, config: ExperimentConfigV1, result: ComputeResult, size: 1600 | 2400): Promise<Blob> {
  if (size !== 1600 && size !== 2400) throw new Error('Tamaño PNG no admitido.');
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size === 1600 ? 1000 : 1500;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear el compositor PNG.');
  const scale = size / 1600;
  context.scale(scale, scale);
  const width = 1600, height = 1000, padding = 32, gap = 28;
  const contentWidth = width - 2 * padding;
  const columnWidth = (contentWidth - 2 * gap) / 3;
  const metadata = buildPngMetadata(config, result);
  const scalarLegendActive = config.layers.cut && config.layers.scalar !== 'none';
  const font = (pixels: number, weight = 400, mono = false) => { context.font = `${weight} ${pixels}px ${mono ? 'ui-monospace, monospace' : 'Inter, system-ui, sans-serif'}`; };
  const wrap = (text: string, max = contentWidth) => wrapPngText(text, max, value => context.measureText(value).width);
  const arrange = (equationFont: number, metadataFont: number, footerFont: number) => {
    font(equationFont, 400, true);
    const equations = metadata.equations.map(text => wrap(text, contentWidth - 24));
    font(metadataFont);
    const headerLines = metadata.header.flatMap(text => wrap(text));
    const columns = metadata.columns.map(column => {
      font(16, 600);
      const title = wrap(column.title, columnWidth);
      font(footerFont);
      return { title, lines: column.lines.flatMap(text => wrap(text, columnWidth)) };
    });
    const equationLeading = equationFont + 6, metadataLeading = metadataFont + 6, footerLeading = footerFont + 6;
    const headerHeight = 103 + equations.reduce((count, lines) => count + lines.length, 0) * equationLeading + headerLines.length * metadataLeading + 12;
    const footerHeight = 30 + Math.max(...columns.map((column, index) => column.title.length * 23 + 12 + (index === 1 && scalarLegendActive ? 38 : 0) + column.lines.length * footerLeading)) + 24;
    return { equations, headerLines, columns, headerHeight, footerHeight, sceneHeight: height - headerHeight - footerHeight, equationFont, metadataFont, footerFont, equationLeading, metadataLeading, footerLeading };
  };
  // Long but legal expressions and dense diagnostics remain complete. Compact
  // profiles preserve 12 px minimum metadata and reserve space for the scene.
  let layout = arrange(19, 15, 15);
  if (layout.sceneHeight < 300) layout = arrange(17, 14, 14);
  if (layout.sceneHeight < 300) layout = arrange(16, 12, 12);
  const { equations, headerLines, columns, headerHeight, footerHeight, sceneHeight } = layout;
  if (sceneHeight < 160) throw new Error('Los metadatos son demasiado extensos para este formato de imagen.');
  context.fillStyle = '#101010'; context.fillRect(0, 0, width, height);
  context.textBaseline = 'top';
  font(28, 600); context.fillStyle = '#f5f5f5'; context.fillText(metadata.title, padding, 28);
  font(15); context.fillStyle = '#b0b0b0'; context.fillText(metadata.subtitle, padding, 68);
  let y = 103;
  font(layout.equationFont, 400, true); context.fillStyle = '#f5f5f5';
  for (const lines of equations) for (let index = 0; index < lines.length; index++) { context.fillText(lines[index], padding + (index ? 24 : 0), y); y += layout.equationLeading; }
  font(layout.metadataFont); context.fillStyle = '#b0b0b0';
  for (const line of headerLines) { context.fillText(line, padding, y); y += layout.metadataLeading; }
  const sceneCanvas = scene.exportImage(size, Math.round(sceneHeight * scale));
  context.drawImage(sceneCanvas, 0, headerHeight, width, sceneHeight);
  const footerY = height - footerHeight;
  context.strokeStyle = '#404040'; context.lineWidth = 1;
  for (const boundary of [headerHeight, footerY]) { context.beginPath(); context.moveTo(padding, boundary); context.lineTo(width - padding, boundary); context.stroke(); }
  for (let index = 0; index < columns.length; index++) {
    const column = columns[index], x = padding + index * (columnWidth + gap);
    let row = footerY + 24;
    font(16, 600); context.fillStyle = '#f5f5f5';
    for (const line of column.title) { context.fillText(line, x, row); row += 23; }
    row += 12;
    if (index === 1 && scalarLegendActive) {
      const divergence = config.layers.scalar === 'divergence';
      const rampWidth = columnWidth - (divergence ? 160 : 0);
      const maximum = divergence ? config.scales.divergence : config.scales.magnitude;
      const gradient = context.createLinearGradient(x, row, x + rampWidth, row);
      gradient.addColorStop(0, '#242424'); gradient.addColorStop(1, '#d0d0d0');
      context.fillStyle = gradient; context.fillRect(x, row, rampWidth, 12);
      context.strokeStyle = '#808080'; context.lineWidth = 1; context.strokeRect(x, row, rampWidth, 12);
      font(12); context.fillStyle = '#b0b0b0';
      context.fillText('0', x, row + 16);
      context.textAlign = 'right'; context.fillText(number(maximum), x + rampWidth, row + 16); context.textAlign = 'left';
      if (divergence) for (const [swatchIndex, sign] of [[0, 1], [1, -1]] as const) {
        const swatchX = x + rampWidth + 20 + swatchIndex * 64;
        context.fillStyle = '#d0d0d0'; context.fillRect(swatchX, row, 24, 12);
        context.save(); context.beginPath(); context.rect(swatchX, row, 24, 12); context.clip();
        context.strokeStyle = '#101010'; context.lineWidth = 1.5; context.beginPath();
        for (let start = -12; start <= 36; start += 6) {
          context.moveTo(swatchX + start, row);
          context.lineTo(swatchX + start - sign * 12, row + 12);
        }
        context.stroke(); context.restore();
        font(14, 600); context.fillStyle = '#f5f5f5'; context.fillText(sign === 1 ? '+' : '−', swatchX + 30, row - 1);
      }
      row += 38;
    }
    font(layout.footerFont); context.fillStyle = '#b0b0b0';
    for (const line of column.lines) { context.fillText(line, x, row); row += layout.footerLeading; }
  }
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo codificar la imagen PNG.')), 'image/png');
  });
}
