import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { ComputeResult, ExperimentConfigV1, Vec3 } from '../experiment/types';
import { domainOrigin, gpuPoint } from './coordinates';

const finitePoint = (p: Vec3) => p.every(Number.isFinite);
export interface LineLayer { materials: LineMaterial[]; vertices: number; chevrons: number }
export function addStreamlines(group: THREE.Group, config: ExperimentConfigV1, result: ComputeResult, lineWidth = 1.25, origin: Vec3 = [0, 0, 0]): LineLayer {
  const positions: number[] = [];
  const marks: number[] = [];
  const spacing = Math.min(...config.domain[1].map((v, i) => (v - config.domain[0][i]) / (config.resolution - 1)));
  const markEvery = new THREE.Vector3(...config.domain[1]).sub(new THREE.Vector3(...config.domain[0])).length() * .055;
  const markLength = spacing * .105;
  let chevrons = 0;
  if (config.layers.lines) for (const line of result.lines) for (const branch of [line.forward, line.backward]) {
    let distance = 0;
    let nextMark = markEvery * .45;
    for (let i = 1; i < branch.positions.length; i++) {
      const a = branch.positions[i - 1]; const b = branch.positions[i];
      if (!finitePoint(a) || !finitePoint(b)) continue;
      const start = new THREE.Vector3(...gpuPoint(a, origin)); const end = new THREE.Vector3(...gpuPoint(b, origin));
      const delta = end.clone().sub(start); const length = delta.length();
      if (length === 0) continue;
      positions.push(...start.toArray(), ...end.toArray());
      // Backward storage follows -F, so reverse only the marks, never the underlying curve.
      const direction = delta.clone().multiplyScalar(branch.direction / length);
      const normal = Math.abs(direction.z) < .9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
      const side = direction.clone().cross(normal).normalize();
      while (nextMark <= distance + length) {
        const point = start.clone().addScaledVector(delta, (nextMark - distance) / length);
        const tip = point.clone().addScaledVector(direction, markLength * .45);
        const base = point.clone().addScaledVector(direction, -markLength * .55);
        const left = base.clone().addScaledVector(side, markLength * .48);
        const right = base.clone().addScaledVector(side, -markLength * .48);
        marks.push(...left.toArray(), ...tip.toArray(), ...tip.toArray(), ...right.toArray());
        chevrons++; nextMark += markEvery;
      }
      distance += length;
    }
  }
  const materials: LineMaterial[] = [];
  for (const [array, color, width] of [[positions, 0xb0b0b0, lineWidth], [marks, 0xf5f5f5, lineWidth + .2]] as const) {
    if (!array.length) continue;
    const geometry = new LineSegmentsGeometry(); geometry.setPositions(array);
    const material = new LineMaterial({ color, linewidth: width, worldUnits: false, alphaToCoverage: true });
    materials.push(material);
    const segments = new LineSegments2(geometry, material); segments.frustumCulled = false; group.add(segments);
  }
  return { materials, vertices: positions.length / 3, chevrons };
}
type MarkerKind = 'seed' | 'positive' | 'negative' | 'undefined' | 'unreliable';
function markerTexture(kind: MarkerKind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d')!;
  context.lineCap = 'round';
  if (kind === 'positive' || kind === 'negative') {
    context.beginPath(); context.arc(37, 48, 21, 0, Math.PI * 2);
    if (kind === 'positive') { context.moveTo(40, 48); context.arc(37, 48, 3, 0, Math.PI * 2); }
    else { context.moveTo(24, 35); context.lineTo(50, 61); context.moveTo(50, 35); context.lineTo(24, 61); }
    context.strokeStyle = '#101010'; context.lineWidth = 12; context.stroke();
    context.strokeStyle = '#f5f5f5'; context.lineWidth = 5; context.stroke();
    context.font = '700 33px system-ui'; context.textBaseline = 'middle'; context.strokeStyle = '#101010'; context.lineWidth = 7;
    context.strokeText(kind === 'positive' ? '+' : '−', 65, 48); context.fillStyle = '#f5f5f5'; context.fillText(kind === 'positive' ? '+' : '−', 65, 48);
  } else if (kind === 'unreliable') {
    context.beginPath(); context.setLineDash([8, 5]); context.arc(48, 48, 28, 0, Math.PI * 2);
    context.strokeStyle = '#101010'; context.lineWidth = 12; context.stroke();
    context.strokeStyle = '#f5f5f5'; context.lineWidth = 5; context.stroke(); context.setLineDash([]);
    context.font = '700 45px system-ui'; context.textBaseline = 'middle'; context.textAlign = 'center';
    context.strokeStyle = '#101010'; context.lineWidth = 7; context.strokeText('?', 48, 49);
    context.fillStyle = '#f5f5f5'; context.fillText('?', 48, 49);
  } else {
    context.beginPath();
    if (kind === 'seed') { context.moveTo(28, 28); context.lineTo(68, 68); context.moveTo(68, 28); context.lineTo(28, 68); }
    else { context.rect(25, 25, 46, 46); context.moveTo(25, 25); context.lineTo(71, 71); context.moveTo(71, 25); context.lineTo(25, 71); }
    context.strokeStyle = '#101010'; context.lineWidth = 12; context.stroke();
    context.strokeStyle = '#f5f5f5'; context.lineWidth = 5; context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
export function addMarkers(group: THREE.Group, points: Vec3[], kind: MarkerKind, origin: Vec3 = [0, 0, 0]): THREE.Sprite[] {
  if (!points.length) return [];
  const material = new THREE.SpriteMaterial({ map: markerTexture(kind), transparent: true, depthTest: false, depthWrite: false });
  return points.filter(finitePoint).map(point => {
    const sprite = new THREE.Sprite(material); sprite.position.set(...gpuPoint(point, origin)); sprite.renderOrder = 6;
    sprite.userData.kind = kind;
    sprite.userData.samplePoint = new THREE.Vector3(...point);
    sprite.userData.pixels = kind === 'seed' ? 16 : kind === 'undefined' ? 20 : 26;
    group.add(sprite); return sprite;
  });
}
export function sliceAxes(plane: ExperimentConfigV1['slice']['plane']): [number, number, number] {
  return plane === 'XY' ? [0, 1, 2] : plane === 'XZ' ? [0, 2, 1] : [1, 2, 0];
}
export function addCutPlane(group: THREE.Group, config: ExperimentConfigV1, texture?: THREE.Texture, origin: Vec3 = [0, 0, 0]) {
  const [u, v, n] = sliceAxes(config.slice.plane);
  const [min, max] = config.domain;
  const center = domainOrigin(config.domain);
  center[n] = config.slice.position;
  const width = max[u] - min[u]; const height = max[v] - min[v];
  if (texture) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i); const y = positions.getY(i);
      const point = gpuPoint(center, origin); point[u] += x; point[v] += y;
      positions.setXYZ(i, ...point);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    group.add(new THREE.Mesh(geometry, material));
  }
  const corners = [[min[u], min[v]], [max[u], min[v]], [max[u], max[v]], [min[u], max[v]], [min[u], min[v]]].map(([x, y]) => {
    const p = [...center] as Vec3; p[u] = x; p[v] = y; return new THREE.Vector3(...gpuPoint(p, origin));
  });
  const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(corners), new THREE.LineDashedMaterial({ color: 0xf5f5f5, dashSize: Math.min(width, height) * .03, gapSize: Math.min(width, height) * .017, depthTest: false }));
  outline.computeLineDistances(); outline.renderOrder = 4; group.add(outline);
  const plane = new THREE.Plane(new THREE.Vector3().setComponent(n, 1), -config.slice.position);
  return { plane, axes: [u, v, n] as const, center };
}
