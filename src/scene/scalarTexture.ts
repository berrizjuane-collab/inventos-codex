import * as THREE from 'three';
import type { ExperimentConfigV1, FieldSample, Vec3 } from '../experiment/types';

/** Only numeric/symbolic results use this display tolerance; it is not an equilibrium test. */
export const DIVERGENCE_DISPLAY_ZERO = 1e-7;
type CellKind = 'magnitude' | 'positive' | 'negative' | 'analytic-zero' | 'near-zero' | 'invalid' | 'missing' | 'unreliable';
interface Cell { kind: CellKind; value: number }
interface Region { kind: CellKind; cells: number[] }

/** The first axis increases left to right; the second increases bottom to top. */
export function scalarSliceAxes(plane: ExperimentConfigV1['slice']['plane']): [number, number, number] {
  return plane === 'XY' ? [0, 1, 2] : plane === 'XZ' ? [0, 2, 1] : [1, 2, 0];
}

/** Canvas rows run downward, opposite to the second spatial axis. Order in the input is irrelevant. */
export function mapSliceSampleToCell(config: ExperimentConfigV1, point: Vec3): { column: number; row: number } | null {
  if (!point.every(Number.isFinite)) return null;
  const [horizontal, vertical, normal] = scalarSliceAxes(config.slice.plane);
  const n = config.slice.resolution;
  const planeTolerance = 32 * Number.EPSILON * Math.max(1, Math.abs(config.slice.position), Math.abs(point[normal]));
  if (Math.abs(point[normal] - config.slice.position) > planeTolerance) return null;
  const indexes = [horizontal, vertical].map(axis => {
    const lower = config.domain[0][axis];
    const length = config.domain[1][axis] - lower;
    if (!(length > 0)) return NaN;
    const coordinate = (point[axis] - lower) / length * (n - 1);
    const index = Math.round(coordinate);
    // Do not assign arbitrary off-grid samples or outside points to a nearby valid cell.
    return index >= 0 && index < n && Math.abs(coordinate - index) <= 1e-5 ? index : NaN;
  });
  if (!indexes.every(Number.isFinite)) return null;
  return { column: indexes[0], row: n - 1 - indexes[1] };
}

function classify(config: ExperimentConfigV1, sample: FieldSample): Cell {
  if (config.layers.scalar !== 'divergence') {
    const evaluation = sample.evaluation;
    return evaluation.valid && Number.isFinite(evaluation.norm) && evaluation.norm >= 0
      ? { kind: 'magnitude', value: evaluation.norm }
      : { kind: 'invalid', value: 0 };
  }
  const derivative = sample.derivative;
  if (!derivative.valid || !Number.isFinite(derivative.divergence)) return { kind: 'invalid', value: 0 };
  if (!derivative.reliable) return { kind: 'unreliable', value: 0 };
  const value = derivative.divergence;
  if (value === 0 && derivative.method === 'analytic') return { kind: 'analytic-zero', value };
  if (derivative.method !== 'analytic' && Math.abs(value) <= DIVERGENCE_DISPLAY_ZERO) return { kind: 'near-zero', value };
  return { kind: value > 0 ? 'positive' : 'negative', value };
}

function regionsOf(cells: Cell[], n: number): Region[] {
  const visited = new Uint8Array(cells.length);
  const regions: Region[] = [];
  for (let start = 0; start < cells.length; start++) {
    if (visited[start] || cells[start].kind === 'magnitude') continue;
    const region: Region = { kind: cells[start].kind, cells: [] };
    const queue = [start];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const index = queue[head];
      const x = index % n; const y = Math.floor(index / n);
      region.cells.push(index);
      const neighbors = [x > 0 ? index - 1 : -1, x + 1 < n ? index + 1 : -1, y > 0 ? index - n : -1, y + 1 < n ? index + n : -1];
      for (const neighbor of neighbors) if (neighbor >= 0 && !visited[neighbor] && cells[neighbor].kind === region.kind) {
        visited[neighbor] = 1; queue.push(neighbor);
      }
    }
    regions.push(region);
  }
  return regions;
}

function clipCells(context: CanvasRenderingContext2D, cells: Cell[], kind: CellKind, n: number, cellSize: number) {
  context.beginPath();
  for (let index = 0; index < cells.length; index++) if (cells[index].kind === kind) {
    context.rect((index % n) * cellSize, Math.floor(index / n) * cellSize, cellSize, cellSize);
  }
  context.clip();
}

function drawHatch(context: CanvasRenderingContext2D, size: number, slope: 1 | -1, step: number) {
  context.beginPath();
  for (let start = -size; start <= size * 2; start += step) {
    context.moveTo(start, 0);
    context.lineTo(start + slope * size, size);
  }
  context.stroke();
}

function drawMissingDots(context: CanvasRenderingContext2D, size: number) {
  context.fillStyle = '#b0b0b0';
  for (let y = 12; y < size; y += 24) for (let x = 12; x < size; x += 24) {
    context.beginPath(); context.arc(x, y, 2, 0, Math.PI * 2); context.fill();
  }
}

function drawUnreliableDashes(context: CanvasRenderingContext2D, size: number) {
  context.beginPath();
  for (let y = 12; y < size; y += 28) for (let x = 6; x < size; x += 32) {
    context.moveTo(x, y); context.lineTo(x + 14, y);
  }
  context.stroke();
}

function isStatus(kind: CellKind) { return kind === 'invalid' || kind === 'missing' || kind === 'unreliable'; }
function labelPriority(kind: CellKind) { return kind === 'invalid' ? 3 : kind === 'unreliable' ? 2 : kind === 'missing' ? 1 : 0; }

interface LabelBounds { left: number; right: number; top: number; bottom: number }

function textAt(context: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, occupied: LabelBounds[], background = false) {
  context.font = `600 ${size}px system-ui, sans-serif`;
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.lineJoin = 'round';
  const width = context.measureText(text).width;
  const pad = 10;
  x = THREE.MathUtils.clamp(x, width / 2 + pad, context.canvas.width - width / 2 - pad);
  y = THREE.MathUtils.clamp(y, size / 2 + pad, context.canvas.height - size / 2 - pad);
  const bounds: LabelBounds = { left: x - width / 2 - 14, right: x + width / 2 + 14, top: y - size / 2 - 14, bottom: y + size / 2 + 14 };
  if (occupied.some(box => bounds.left < box.right && bounds.right > box.left && bounds.top < box.bottom && bounds.bottom > box.top)) return;
  occupied.push(bounds);
  if (background) {
    context.fillStyle = '#181818';
    context.fillRect(x - width / 2 - 8, y - size / 2 - 7, width + 16, size + 14);
    context.strokeStyle = '#b0b0b0'; context.lineWidth = 1.5;
    context.strokeRect(x - width / 2 - 8, y - size / 2 - 7, width + 16, size + 14);
  }
  // The dark outline preserves the symbol on the brightest values of the fixed scale.
  context.strokeStyle = '#101010'; context.lineWidth = 5;
  context.strokeText(text, x, y);
  context.fillStyle = '#f5f5f5'; context.fillText(text, x, y);
}

function regionAnchors(region: Region, n: number, cellSize: number): { x: number; y: number }[] {
  const anchors: { x: number; y: number }[] = [];
  // A spatial lattice avoids repeated signs in every 8/16 px sample cell.
  const separation = isStatus(region.kind) ? 256 : 160;
  const bins = new Map<string, { x: number; y: number; distance: number }>();
  for (const index of region.cells) {
    const x = (index % n + .5) * cellSize;
    const y = (Math.floor(index / n) + .5) * cellSize;
    const bx = Math.floor(x / separation); const by = Math.floor(y / separation);
    const distance = (x - (bx + .5) * separation) ** 2 + (y - (by + .5) * separation) ** 2;
    const key = `${bx}:${by}`;
    if (!bins.has(key) || distance < bins.get(key)!.distance) bins.set(key, { x, y, distance });
  }
  for (const candidate of bins.values()) {
    if (anchors.every(existing => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) >= separation * .72)) {
      anchors.push(candidate);
    }
  }
  return anchors;
}

/**
 * A sampled cut, without interpolation or automatic normalization. The plane must
 * map u to its first axis and v to its second axis. With flipY=true, v=0 receives
 * the bottom canvas row (the second axis minimum), and v=1 the top canvas row.
 * Missing samples, including a partial computation, are distinct from undefined
 * mathematical values and from finite-difference results that failed convergence.
 */
export function createScalarTexture(config: ExperimentConfigV1, samples: FieldSample[]): {
  texture: THREE.CanvasTexture; valid: number; invalid: number; missing: number; unreliable: number;
  saturated: number; analyticZero: boolean; nearZero: number;
} {
  const n = config.slice.resolution;
  const cellSize = n === 65 ? 16 : 8;
  const size = n * cellSize;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo crear la representación 2D del corte.');
  const cells: Cell[] = Array.from({ length: n * n }, () => ({ kind: 'missing', value: 0 }));
  for (const sample of samples) {
    const position = mapSliceSampleToCell(config, sample.point);
    if (position) cells[position.row * n + position.column] = classify(config, sample);
  }
  const divergence = config.layers.scalar === 'divergence';
  const scale = divergence ? config.scales.divergence : config.scales.magnitude;
  let valid = 0, invalid = 0, missing = 0, unreliable = 0, saturated = 0, nearZero = 0, analyticZero = false;
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    let gray = 24;
    if (cell.kind === 'invalid') invalid++;
    else if (cell.kind === 'missing') { missing++; gray = 16; }
    else if (cell.kind === 'unreliable') { unreliable++; gray = 48; }
    else {
      valid++;
      if (Math.abs(cell.value) > scale) saturated++;
      if (cell.kind === 'analytic-zero') analyticZero = true;
      if (cell.kind === 'near-zero') nearZero++;
      const proportion = scale > 0 ? THREE.MathUtils.clamp(Math.abs(cell.value) / scale, 0, 1) : 0;
      gray = Math.round(36 + proportion * (208 - 36));
    }
    context.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
    context.fillRect((index % n) * cellSize, Math.floor(index / n) * cellSize, cellSize, cellSize);
  }
  for (const kind of ['positive', 'negative', 'invalid', 'missing', 'unreliable'] as const) {
    if (!cells.some(cell => cell.kind === kind)) continue;
    context.save();
    clipCells(context, cells, kind, n, cellSize);
    context.strokeStyle = isStatus(kind) ? '#b0b0b0' : '#101010';
    context.lineWidth = isStatus(kind) ? 2 : 1.5;
    if (kind === 'missing') drawMissingDots(context, size);
    else if (kind === 'unreliable') drawUnreliableDashes(context, size);
    else {
      drawHatch(context, size, kind === 'positive' ? -1 : 1, kind === 'invalid' ? 18 : 30);
      if (kind === 'invalid') drawHatch(context, size, -1, 18);
    }
    context.restore();
  }
  const occupied: LabelBounds[] = [];
  // State labels take priority; tiny disconnected islands still retain their
  // own hatch while labels share a global collision guard across all regions.
  const regions = regionsOf(cells, n).sort((a, b) => labelPriority(b.kind) - labelPriority(a.kind) || b.cells.length - a.cells.length);
  for (const region of regions) {
    const text = region.kind === 'positive' ? '+' : region.kind === 'negative' ? '−'
      : region.kind === 'analytic-zero' ? '0' : region.kind === 'near-zero' ? '≈0'
      : region.kind === 'missing' ? '··· Sin muestra' : region.kind === 'unreliable' ? '— No fiable' : '× No definido';
    for (const anchor of regionAnchors(region, n, cellSize)) {
      textAt(context, text, anchor.x, anchor.y, isStatus(region.kind) ? 24 : 32, occupied, isStatus(region.kind));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false; texture.flipY = true;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, valid, invalid, missing, unreliable, saturated, analyticZero, nearZero };
}
