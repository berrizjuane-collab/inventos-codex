import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { ComputeResult, ExperimentConfigV1, Vec3 } from '../experiment/types';
import { addCutPlane, addMarkers, addStreamlines } from './renderLayers';
import { createScalarTexture } from './scalarTexture';
import { glyphAxes, glyphEntries, normalizedDirection } from './glyphs';
import { domainOrigin, gpuPoint } from './coordinates';

export interface SceneHandle {
  view(plane: 'XY' | 'XZ' | 'YZ' | 'oblique'): void;
  reset(): void;
  getCamera(): ExperimentConfigV1['camera'];
  exportImage(width: number, height: number): HTMLCanvasElement;
  getInfo(): unknown;
}
interface Props {
  config: ExperimentConfigV1;
  result: ComputeResult;
  onSelect: (p: Vec3) => void;
  onCameraChange?: (camera: ExperimentConfigV1['camera']) => void;
  onUnavailable?: (message: string) => void;
}
interface Counts { valid: number; invalid: number; unreliable?: number; zero: number; tiny: number; saturated: number; scale: number; maximumLength: number; directionOnly: boolean; cutValid?: number; cutInvalid?: number; cutMissing?: number; cutUnreliable?: number; cutSaturated?: number; cutAnalyticZero?: boolean; cutNearZero?: number; projectedZero?: number; perpendicularPositive?: number; perpendicularNegative?: number; lineVertices?: number; chevrons?: number }
interface Runtime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  controls: OrbitControls;
  data: THREE.Group;
  selection: THREE.Group;
  selectedMarker?: THREE.Sprite;
  selectedLabel?: THREE.Sprite;
  axisLabels: THREE.Sprite[];
  markerSprites: THREE.Sprite[];
  lineMaterials: LineMaterial[];
  cutPlane?: THREE.Plane;
  cutAxes?: readonly [number, number, number];
  renderConfig?: ExperimentConfigV1;
  zeroMesh?: THREE.InstancedMesh;
  zeroOutline?: THREE.InstancedMesh;
  zeroPositions: THREE.Vector3[];
  picker?: THREE.Points;
  points: Vec3[];
  origin: Vec3;
  span: number;
  width: number;
  height: number;
  requestRender: () => void;
  render: () => void;
  fit: (view?: 'XY' | 'XZ' | 'YZ' | 'oblique') => void;
  available: boolean;
  applyingCamera: boolean;
  counts: Counts;
  renderFrames: number;
  renderDurations: number[];
  lastResult?: ComputeResult;
  lastSceneKey?: string;
}
const mono = { background: 0x101010, arrows: 0xd0d0d0, axes: 0x808080, box: 0x404040, selection: 0xf5f5f5 };
const upZ = new THREE.Vector3(0, 0, 1);
const yAxis = new THREE.Vector3(0, 1, 0);
function vector(p: Vec3) { return new THREE.Vector3(...p); }
function cameraState(r: Runtime): ExperimentConfigV1['camera'] {
  return { position: r.camera.position.toArray() as Vec3, target: r.controls.target.toArray() as Vec3, zoom: r.camera.zoom };
}
function renderMeasured(r: Runtime) {
  const start = performance.now();
  r.renderer.render(r.scene, r.camera);
  const elapsed = performance.now() - start;
  r.renderFrames++;
  r.renderDurations.push(elapsed);
  if (r.renderDurations.length > 500) r.renderDurations.shift();
}
function runtimeInfo(r: Runtime) {
  const durations = [...r.renderDurations].sort((a, b) => a - b);
  const middle = Math.floor(durations.length / 2);
  return {
    ...r.counts, webgl: r.available, pixelRatio: r.renderer.getPixelRatio(), camera: cameraState(r), coordinateOrigin: [...r.origin],
    drawCalls: r.renderer.info.render.calls, geometries: r.renderer.info.memory.geometries,
    textures: r.renderer.info.memory.textures, programs: r.renderer.info.programs?.length ?? 0,
    renderFrames: r.renderFrames, renderSamples: durations.length,
    minRenderMs: durations.length ? durations[0] : null,
    medianRenderMs: durations.length ? durations.length % 2 ? durations[middle] : (durations[middle - 1] + durations[middle]) / 2 : null,
    p95RenderMs: durations.length ? durations[Math.ceil(durations.length * .95) - 1] : null,
  };
}
/** Keep persisted camera coordinates within the public schema, preserving pan offsets when possible. */
function constrainCamera(r: Runtime) {
  const limit = 1e7;
  let adjusted = false;
  for (let axis = 0; axis < 3; axis++) {
    const position = r.camera.position.getComponent(axis);
    const target = r.controls.target.getComponent(axis);
    if (!Number.isFinite(position) || !Number.isFinite(target)) {
      r.camera.position.setComponent(axis, axis === 2 ? Math.min(r.span * 2, limit) : 0);
      r.controls.target.setComponent(axis, 0); adjusted = true; continue;
    }
    if (Math.abs(position - target) <= limit * 2) {
      const delta = Math.max(position, target) > limit ? limit - Math.max(position, target)
        : Math.min(position, target) < -limit ? -limit - Math.min(position, target) : 0;
      if (delta) { r.camera.position.setComponent(axis, THREE.MathUtils.clamp(position + delta, -limit, limit)); r.controls.target.setComponent(axis, THREE.MathUtils.clamp(target + delta, -limit, limit)); adjusted = true; }
    } else {
      r.camera.position.setComponent(axis, THREE.MathUtils.clamp(position, -limit, limit));
      r.controls.target.setComponent(axis, THREE.MathUtils.clamp(target, -limit, limit)); adjusted = true;
    }
  }
  const zoom = THREE.MathUtils.clamp(Number.isFinite(r.camera.zoom) ? r.camera.zoom : 1, .05, 100);
  if (zoom !== r.camera.zoom) { r.camera.zoom = zoom; adjusted = true; }
  if (adjusted) r.camera.updateProjectionMatrix();
  return adjusted;
}
function sameCamera(a: ExperimentConfigV1['camera'], b: ExperimentConfigV1['camera']) {
  const other = [...b.position, ...b.target, b.zoom];
  return [...a.position, ...a.target, a.zoom].every((value, i) => Object.is(value, other[i]));
}
function disposeGroup(group: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  group.traverse(object => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
      materials.add(material);
      const map = (material as THREE.MeshBasicMaterial).map;
      if (map) textures.add(map);
    }
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  textures.forEach(t => t.dispose());
  group.clear();
}
function labelSprite(text: string, size = 36, color = '#b0b0b0'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(96, Math.ceil(text.length * size * .66) + 24);
  canvas.height = size + 24;
  const context = canvas.getContext('2d')!;
  context.font = `500 ${size}px system-ui, sans-serif`;
  context.textBaseline = 'middle';
  context.lineWidth = 7;
  context.strokeStyle = '#101010';
  context.strokeText(text, 12, canvas.height / 2);
  context.fillStyle = color;
  context.fillText(text, 12, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  sprite.userData.aspect = canvas.width / canvas.height;
  sprite.renderOrder = 8;
  return sprite;
}
function selectionSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d')!;
  for (const inset of [10, 24]) {
    context.beginPath();
    context.moveTo(48, inset); context.lineTo(96 - inset, 48); context.lineTo(48, 96 - inset); context.lineTo(inset, 48); context.closePath();
    context.strokeStyle = '#101010'; context.lineWidth = 10; context.stroke();
    context.strokeStyle = '#f5f5f5'; context.lineWidth = 4; context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true }));
  sprite.renderOrder = 10;
  return sprite;
}
function addAxes(group: THREE.Group, config: ExperimentConfigV1, spacing: number, origin: Vec3): THREE.Sprite[] {
  const labels: THREE.Sprite[] = [];
  if (!config.layers.axes) return labels;
  const [min, max] = config.domain;
  const center = domainOrigin(config.domain);
  const size = max.map((v, i) => v - min[i]) as Vec3;
  const boxGeometry = new THREE.BoxGeometry(...size);
  const box = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeometry), new THREE.LineBasicMaterial({ color: mono.box }));
  boxGeometry.dispose();
  box.position.set(...gpuPoint(center, origin));
  group.add(box);
  const anchor = min.map((v, i) => THREE.MathUtils.clamp(0, v, max[i])) as Vec3;
  const positions: number[] = [];
  for (let axis = 0; axis < 3; axis++) {
    const start = [...anchor] as Vec3; const end = [...anchor] as Vec3;
    start[axis] = min[axis]; end[axis] = max[axis] + spacing * .22;
    positions.push(...gpuPoint(start, origin), ...gpuPoint(end, origin));
    const label = labelSprite(['x', 'y', 'z'][axis]);
    label.userData.axis = axis;
    const labelPoint = [...end] as Vec3; labelPoint[axis] += spacing * .18;
    label.position.set(...gpuPoint(labelPoint, origin));
    label.scale.set(spacing * .28 * label.userData.aspect, spacing * .28, 1);
    group.add(label);
    labels.push(label);
    // The axes use equal world units; sparse ticks make this explicit without a dense grid.
    for (let tick = 0; tick <= 4; tick++) {
      const p = [...anchor] as Vec3;
      p[axis] = min[axis] + (max[axis] - min[axis]) * tick / 4;
      const q = [...p] as Vec3;
      const tickAxis = axis === 2 ? 0 : 2;
      p[tickAxis] -= spacing * .025; q[tickAxis] += spacing * .025;
      positions.push(...gpuPoint(p, origin), ...gpuPoint(q, origin));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: mono.axes })));
  return labels;
}
function buildField(r: Runtime, config: ExperimentConfigV1, result: ComputeResult) {
  disposeGroup(r.data);
  r.picker?.geometry.dispose();
  if (r.picker) (r.picker.material as THREE.Material).dispose();
  r.zeroMesh = undefined; r.zeroOutline = undefined; r.zeroPositions = [];
  r.markerSprites = []; r.lineMaterials = []; r.cutPlane = undefined; r.cutAxes = undefined; r.renderConfig = config;
  const [min, max] = config.domain;
  r.origin = domainOrigin(config.domain);
  r.data.position.set(...r.origin); r.selection.position.set(...r.origin);
  const spacing = Math.min(...max.map((v, i) => (v - min[i]) / (config.resolution - 1)));
  const glyphData = glyphEntries(config, result);
  const counts: Counts = { ...glyphData.stats, directionOnly: config.scales.directionOnly };
  r.axisLabels = addAxes(r.data, config, spacing, r.origin);
  const lineLayer = addStreamlines(r.data, config, result, 1.25, r.origin);
  r.lineMaterials = lineLayer.materials; counts.lineVertices = lineLayer.vertices; counts.chevrons = lineLayer.chevrons;
  if (config.layers.seeds) r.markerSprites.push(...addMarkers(r.data, config.seeds.filter(p => p.every((value, i) => value >= min[i] && value <= max[i])), 'seed', r.origin));
  if (config.layers.cut) {
    const scalar = config.layers.scalar !== 'none' ? createScalarTexture(config, result.slice) : undefined;
    const cut = addCutPlane(r.data, config, scalar?.texture, r.origin);
    r.cutPlane = cut.plane; r.cutAxes = cut.axes;
    counts.cutValid = scalar?.valid ?? result.slice.filter(s => s.evaluation.valid).length;
    counts.cutInvalid = scalar?.invalid ?? result.slice.filter(s => !s.evaluation.valid).length;
    counts.cutMissing = scalar?.missing ?? Math.max(0, config.slice.resolution ** 2 - result.slice.length);
    counts.cutUnreliable = scalar?.unreliable ?? 0;
    counts.cutSaturated = scalar?.saturated ?? 0; counts.cutAnalyticZero = scalar?.analyticZero ?? false; counts.cutNearZero = scalar?.nearZero ?? 0;
    const label = labelSprite(`${config.slice.plane} · ${['x', 'y', 'z'][cut.axes[2]]} = ${Number(config.slice.position.toPrecision(12))}`, 36, '#f5f5f5');
    const labelPoint = [...cut.center] as Vec3; labelPoint[cut.axes[0]] = min[cut.axes[0]]; labelPoint[cut.axes[1]] = max[cut.axes[1]] + spacing * .22;
    label.position.set(...gpuPoint(labelPoint, r.origin)); r.data.add(label); r.axisLabels.push(label);
  }
  r.points = result.samples.filter(sample => sample.point.every(Number.isFinite)).map(sample => sample.point);
  const pickGeometry = new THREE.BufferGeometry();
  pickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(r.points.flatMap(point => gpuPoint(point, r.origin)), 3));
  r.picker = new THREE.Points(pickGeometry, new THREE.PointsMaterial());
  r.picker.position.set(...r.origin); r.picker.updateMatrixWorld(true);
  const arrows: { point: THREE.Vector3; direction: THREE.Vector3; length: number; saturated: boolean }[] = [];
  const positivePerpendicular: Vec3[] = []; const negativePerpendicular: Vec3[] = []; const undefinedGlyphs: Vec3[] = []; const unreliableGlyphs: Vec3[] = [];
  for (const entry of glyphData.entries) {
    const { sample } = entry;
    if (entry.state === 'undefined') { if (config.layers.cut) undefinedGlyphs.push(sample.point); continue; }
    if (entry.state === 'unreliable') { if (config.layers.cut) unreliableGlyphs.push(sample.point); continue; }
    if (entry.originalNorm === 0) { r.zeroPositions.push(vector(gpuPoint(sample.point, r.origin))); continue; }
    if (entry.perpendicular > 0) positivePerpendicular.push(sample.point);
    else if (entry.perpendicular < 0) negativePerpendicular.push(sample.point);
    if (entry.norm === 0) continue;
    const direction = normalizedDirection(entry.vector);
    if (!direction) continue;
    arrows.push({ point: vector(gpuPoint(sample.point, r.origin)), direction: vector(direction), length: entry.length, saturated: entry.saturated });
  }
  r.counts = counts;
  if (!config.layers.arrows) return;
  r.markerSprites.push(...addMarkers(r.data, positivePerpendicular, 'positive', r.origin), ...addMarkers(r.data, negativePerpendicular, 'negative', r.origin), ...addMarkers(r.data, undefinedGlyphs, 'undefined', r.origin), ...addMarkers(r.data, unreliableGlyphs, 'unreliable', r.origin));
  const material = new THREE.MeshBasicMaterial({ color: mono.arrows });
  const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7), material, arrows.length);
  const heads = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 10), material, arrows.length);
  const secondHeads = config.layers.vectors === 'curl' ? new THREE.InstancedMesh(heads.geometry, material, arrows.length) : undefined;
  const saturatedArrows = arrows.filter(a => a.saturated);
  const saturationMarks = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .19, 4, 10), material, saturatedArrows.length);
  const dummy = new THREE.Object3D();
  let markIndex = 0;
  arrows.forEach((arrow, i) => {
    const headLength = Math.min(spacing * .095, arrow.length * .36);
    const shaftLength = arrow.length - headLength;
    const radius = Math.min(spacing * .012, arrow.length * .045);
    dummy.quaternion.setFromUnitVectors(yAxis, arrow.direction);
    dummy.position.copy(arrow.point).addScaledVector(arrow.direction, shaftLength / 2);
    dummy.scale.set(radius, shaftLength, radius); dummy.updateMatrix(); shafts.setMatrixAt(i, dummy.matrix);
    dummy.position.copy(arrow.point).addScaledVector(arrow.direction, shaftLength + headLength / 2);
    dummy.scale.set(Math.min(spacing * .055, arrow.length * .2), headLength, Math.min(spacing * .055, arrow.length * .2));
    dummy.updateMatrix(); heads.setMatrixAt(i, dummy.matrix);
    if (secondHeads) {
      dummy.position.copy(arrow.point).addScaledVector(arrow.direction, Math.max(headLength / 2, shaftLength - headLength * .6));
      dummy.updateMatrix(); secondHeads.setMatrixAt(i, dummy.matrix);
    }
    if (arrow.saturated) {
      dummy.quaternion.setFromUnitVectors(upZ, arrow.direction);
      dummy.position.copy(arrow.point).addScaledVector(arrow.direction, arrow.length * .56);
      dummy.scale.setScalar(spacing * .026); dummy.updateMatrix(); saturationMarks.setMatrixAt(markIndex++, dummy.matrix);
    }
  });
  const meshes = [shafts, heads, saturationMarks, ...(secondHeads ? [secondHeads] : [])];
  for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.frustumCulled = false; mesh.renderOrder = config.layers.cut ? 3 : 0; if (config.layers.cut) { material.depthTest = false; material.depthWrite = false; } r.data.add(mesh); }
  // A wider black silhouette preserves direction over bright scalar cells.
  if (config.layers.cut) for (const mesh of [shafts, heads, ...(secondHeads ? [secondHeads] : [])]) {
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0x101010, depthTest: false, depthWrite: false });
    const outline = new THREE.InstancedMesh(mesh.geometry, outlineMaterial, mesh.count);
    const transform = new THREE.Matrix4(); const position = new THREE.Vector3(); const rotation = new THREE.Quaternion(); const size = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, transform); transform.decompose(position, rotation, size); size.x *= 1.8; size.z *= 1.8; transform.compose(position, rotation, size); outline.setMatrixAt(i, transform); }
    outline.instanceMatrix.needsUpdate = true; outline.frustumCulled = false; outline.renderOrder = 2; r.data.add(outline);
  }
  if (config.layers.cut && saturationMarks.count) {
    const outline = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .4, 4, 10), new THREE.MeshBasicMaterial({ color: 0x101010, depthTest: false, depthWrite: false }), saturationMarks.count);
    outline.instanceMatrix.copy(saturationMarks.instanceMatrix); outline.frustumCulled = false; outline.renderOrder = 2; r.data.add(outline);
  }
  if (r.zeroPositions.length) {
    r.zeroMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(spacing * .03, spacing * .0045, 4, 16), material, r.zeroPositions.length);
    r.zeroMesh.frustumCulled = false;
    r.zeroMesh.userData.diameter = spacing * .06;
    r.zeroMesh.renderOrder = config.layers.cut ? 3 : 0;
    r.data.add(r.zeroMesh);
    if (config.layers.cut) {
      r.zeroOutline = new THREE.InstancedMesh(new THREE.TorusGeometry(spacing * .03, spacing * .012, 4, 16), new THREE.MeshBasicMaterial({ color: 0x101010, depthTest: false, depthWrite: false }), r.zeroPositions.length);
      r.zeroOutline.frustumCulled = false; r.zeroOutline.renderOrder = 2; r.data.add(r.zeroOutline);
    }
  }
}
function updateSelection(r: Runtime, point: Vec3) {
  disposeGroup(r.selection);
  r.selectedMarker = undefined; r.selectedLabel = undefined;
  if (!r.renderConfig || !point.every((value, i) => Number.isFinite(value) && value >= r.renderConfig!.domain[0][i] && value <= r.renderConfig!.domain[1][i])) return;
  r.selectedMarker = selectionSprite();
  r.selectedMarker.position.set(...gpuPoint(point, r.origin));
  r.selectedLabel = labelSprite(`(${point.map(v => Number(v.toPrecision(12))).join(', ')})`, 24, '#f5f5f5');
  r.selection.add(r.selectedMarker, r.selectedLabel);
}
function projection(r: Runtime, width = r.width, height = r.height) {
  const aspect = width / Math.max(1, height);
  const halfHeight = r.span * .53 / Math.min(1, aspect);
  r.camera.left = -halfHeight * aspect; r.camera.right = halfHeight * aspect;
  r.camera.top = halfHeight; r.camera.bottom = -halfHeight;
  r.camera.far = Math.max(100, r.span * 10 + r.camera.position.distanceTo(r.controls.target));
  r.camera.updateProjectionMatrix();
}
function billboard(r: Runtime, height = r.height) {
  const pixel = (r.camera.top - r.camera.bottom) / (Math.max(1, height) * r.camera.zoom);
  // The texture has 24 px of vertical padding: 14 px of actual type needs a 23.3 px sprite.
  const cameraDirection = r.camera.position.clone().sub(r.controls.target).normalize();
  for (const label of r.axisLabels) {
    label.scale.set(pixel * (14 * 60 / 36) * label.userData.aspect, pixel * (14 * 60 / 36), 1);
    const axis = label.userData.axis;
    label.visible = axis === undefined || Math.abs(cameraDirection.getComponent(axis)) < .999;
  }
  const right = new THREE.Vector3().setFromMatrixColumn(r.camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(r.camera.matrixWorld, 1);
  for (const sprite of r.markerSprites) {
    if (sprite.userData.kind === 'positive' || sprite.userData.kind === 'negative') {
      const spacing = r.renderConfig ? Math.min(...r.renderConfig.domain[1].map((value, i) => (value - r.renderConfig!.domain[0][i]) / (r.renderConfig!.resolution - 1))) : pixel * 32;
      const pixels = Math.min(18, spacing / pixel * .42);
      sprite.scale.setScalar(pixel * pixels);
      // An 8.6 px offset keeps the perpendicular glyph near its own sample without covering the arrow.
      const samplePoint = sprite.userData.samplePoint as THREE.Vector3;
      sprite.position.set(...gpuPoint(samplePoint.toArray() as Vec3, r.origin)).addScaledVector(right, pixel * 7).addScaledVector(up, pixel * 5);
    } else sprite.scale.setScalar(pixel * sprite.userData.pixels);
  }
  const size = r.renderer.getSize(new THREE.Vector2());
  for (const material of r.lineMaterials) material.resolution.copy(size);
  if (r.selectedMarker && r.selectedLabel) {
    r.selectedMarker.scale.setScalar(pixel * 28);
    r.selectedLabel.scale.set(pixel * 18 * r.selectedLabel.userData.aspect, pixel * 18, 1);
    r.selectedLabel.position.copy(r.selectedMarker.position).addScaledVector(right, pixel * (23 + 9 * r.selectedLabel.userData.aspect)).addScaledVector(up, pixel * 15);
  }
  if (r.zeroMesh) {
    const dummy = new THREE.Object3D(); dummy.quaternion.copy(r.camera.quaternion);
    dummy.scale.setScalar(pixel * 7 / r.zeroMesh.userData.diameter);
    r.zeroPositions.forEach((position, i) => { dummy.position.copy(position); dummy.updateMatrix(); r.zeroMesh!.setMatrixAt(i, dummy.matrix); r.zeroOutline?.setMatrixAt(i, dummy.matrix); });
    r.zeroMesh.instanceMatrix.needsUpdate = true;
    if (r.zeroOutline) r.zeroOutline.instanceMatrix.needsUpdate = true;
  }
}

const SceneView = forwardRef<SceneHandle, Props>(function SceneView(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [unavailable, setUnavailable] = useState<string>();
  useImperativeHandle(ref, () => ({
    view: plane => runtime.current?.fit(plane),
    reset: () => runtime.current?.fit('oblique'),
    getCamera: () => runtime.current ? cameraState(runtime.current) : latest.current.config.camera,
    getInfo: () => runtime.current ? runtimeInfo(runtime.current) : { webgl: false },
    exportImage: (width, height) => {
      const r = runtime.current;
      if (!r?.available) throw new Error('WebGL no está disponible para exportar la escena.');
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('Dimensiones de exportación no admitidas.');
      const pixelRatio = r.renderer.getPixelRatio();
      const size = r.renderer.getSize(new THREE.Vector2());
      const viewport = r.renderer.getViewport(new THREE.Vector4());
      const scissor = r.renderer.getScissor(new THREE.Vector4());
      const scissorTest = r.renderer.getScissorTest();
      const savedFrustum = { left: r.camera.left, right: r.camera.right, top: r.camera.top, bottom: r.camera.bottom, near: r.camera.near, far: r.camera.far };
      const output = document.createElement('canvas'); output.width = width; output.height = height;
      try {
        r.renderer.setPixelRatio(1); r.renderer.setSize(width, height, false); r.renderer.setScissorTest(false);
        const aspect = width / height;
        const halfHeight = Math.max((savedFrustum.top - savedFrustum.bottom) / 2, (savedFrustum.right - savedFrustum.left) / (2 * aspect));
        const centerX = (savedFrustum.left + savedFrustum.right) / 2; const centerY = (savedFrustum.top + savedFrustum.bottom) / 2;
        r.camera.left = centerX - halfHeight * aspect; r.camera.right = centerX + halfHeight * aspect;
        r.camera.bottom = centerY - halfHeight; r.camera.top = centerY + halfHeight;
        r.camera.updateProjectionMatrix(); r.camera.updateMatrixWorld(); billboard(r, height);
        renderMeasured(r);
        const context = output.getContext('2d');
        if (!context) throw new Error('No se pudo crear la imagen.');
        context.drawImage(r.renderer.domElement, 0, 0);
      } finally {
        r.renderer.setPixelRatio(pixelRatio); r.renderer.setSize(size.x, size.y, false);
        r.renderer.setViewport(viewport); r.renderer.setScissor(scissor); r.renderer.setScissorTest(scissorTest);
        Object.assign(r.camera, savedFrustum); r.camera.updateProjectionMatrix(); r.render();
      }
      return output;
    },
  }), []);
  useEffect(() => {
    const container = host.current!;
    const fail = (message: string) => { setUnavailable(message); latest.current.onUnavailable?.(message); };
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); }
    catch { fail('WebGL no está disponible. Puedes editar el campo y consultar los resultados numéricos.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, latest.current.config.graphics.pixelRatio));
    renderer.setClearColor(mono.background, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Escena tridimensional del campo. Cursores: órbita; Mayús y cursores: desplazamiento; más y menos: zoom; Inicio: encuadrar.');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-3px;';
    container.appendChild(canvas);
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, .001, 1e7);
    const initialCamera = latest.current.config.camera;
    camera.position.copy(vector(initialCamera.position));
    const initialDirection = camera.position.clone().sub(vector(initialCamera.target)).normalize();
    camera.up.copy(Math.abs(initialDirection.dot(upZ)) > .999 ? yAxis : upZ);
    camera.zoom = initialCamera.zoom;
    const controls = new OrbitControls(camera, canvas);
    controls.target.copy(vector(initialCamera.target));
    controls.enableDamping = false; controls.minZoom = .05; controls.maxZoom = 100;
    controls.screenSpacePanning = true;
    controls.update();
    // OrbitControls normalizes spherical coordinates; an imported tuple remains authoritative.
    camera.position.copy(vector(initialCamera.position)); controls.target.copy(vector(initialCamera.target)); camera.zoom = initialCamera.zoom;
    camera.lookAt(controls.target); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    const scene = new THREE.Scene();
    const data = new THREE.Group(); const selection = new THREE.Group(); scene.add(data, selection);
    let frame = 0; let disposed = false;
    const r: Runtime = {
      renderer, scene, camera, controls, data, selection, axisLabels: [], markerSprites: [], lineMaterials: [], zeroPositions: [], points: [], origin: [0, 0, 0], span: 6, width: 1, height: 1, available: true, applyingCamera: false,
      counts: { valid: 0, invalid: 0, zero: 0, tiny: 0, saturated: 0, scale: .1, maximumLength: .6, directionOnly: false },
      renderFrames: 0, renderDurations: [],
      requestRender: () => { if (!frame && r.available && !disposed) frame = requestAnimationFrame(() => { frame = 0; r.render(); }); },
      render: () => { if (!r.available || disposed) return; camera.updateMatrixWorld(); billboard(r); renderMeasured(r); },
      fit: (view = 'oblique') => {
        const [min, max] = latest.current.config.domain;
        const target = vector(min.map((v, i) => (v + max[i]) / 2) as Vec3);
        const direction = { XY: new THREE.Vector3(0, 0, 1), XZ: new THREE.Vector3(0, -1, 0), YZ: new THREE.Vector3(1, 0, 0), oblique: new THREE.Vector3(8, -10, 7).normalize() }[view];
        camera.up.copy(view === 'XY' ? yAxis : upZ);
        controls.target.copy(target); camera.position.copy(target).addScaledVector(direction, r.span * 2);
        projection(r);
        if (view === 'oblique') camera.zoom = 1;
        else {
          const [u, v] = glyphAxes(view);
          // Include the bounded arrow overhang and labels in the 20% margin.
          camera.zoom = THREE.MathUtils.clamp(Math.min((camera.right - camera.left) / ((max[u] - min[u]) * 1.25), (camera.top - camera.bottom) / ((max[v] - min[v]) * 1.25)), .05, 100);
        }
        camera.updateProjectionMatrix(); controls.update(); r.requestRender();
        latest.current.onCameraChange?.(cameraState(r));
      },
    };
    runtime.current = r;
    let constraining = false;
    const changed = () => {
      if (constraining || r.applyingCamera) return;
      if (constrainCamera(r)) { constraining = true; controls.update(); constraining = false; }
      r.requestRender(); latest.current.onCameraChange?.(cameraState(r));
    };
    controls.addEventListener('change', changed);
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      r.width = Math.max(1, Math.round(bounds.width)); r.height = Math.max(1, Math.round(bounds.height));
      renderer.setSize(r.width, r.height, false); projection(r); r.requestRender();
    };
    const observer = new ResizeObserver(resize); observer.observe(container); resize();
    const keydown = (event: KeyboardEvent) => {
      if (event.target !== canvas || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') { r.fit(); return; }
      if (['+', '=', '-', '_'].includes(event.key)) {
        camera.zoom = THREE.MathUtils.clamp(camera.zoom * (['+', '='].includes(event.key) ? 1.15 : 1 / 1.15), .05, 100);
        camera.updateProjectionMatrix();
      } else if (event.shiftKey) {
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const offset = (event.key.includes('Left') || event.key.includes('Right') ? right : up).multiplyScalar(r.span * .04 / camera.zoom * (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1));
        camera.position.add(offset); controls.target.add(offset);
      } else {
        const relative = camera.position.clone().sub(controls.target);
        const orbitUp = camera.up.clone().normalize();
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') relative.applyAxisAngle(orbitUp, event.key === 'ArrowLeft' ? .09 : -.09);
        else {
          const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
          const rotated = relative.clone().applyAxisAngle(right, event.key === 'ArrowUp' ? -.09 : .09);
          if (Math.abs(rotated.clone().normalize().dot(orbitUp)) < .995) relative.copy(rotated);
        }
        camera.position.copy(controls.target).add(relative);
      }
      controls.update(); changed();
    };
    canvas.addEventListener('keydown', keydown);
    let pointerStart: { x: number; y: number; button: number } | null = null;
    const pointerdown = (event: PointerEvent) => { pointerStart = { x: event.clientX, y: event.clientY, button: event.button }; canvas.focus({ preventScroll: true }); };
    const pointerup = (event: PointerEvent) => {
      if (!pointerStart || pointerStart.button !== 0 || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) { pointerStart = null; return; }
      pointerStart = null;
      const bounds = canvas.getBoundingClientRect();
      const cursor = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.params.Points.threshold = (camera.top - camera.bottom) / (r.height * camera.zoom) * 10;
      raycaster.setFromCamera(cursor, camera);
      if (r.cutPlane && r.cutAxes && r.renderConfig) {
        const point = raycaster.ray.intersectPlane(r.cutPlane, new THREE.Vector3());
        const config = r.renderConfig;
        if (point && r.cutAxes.slice(0, 2).every(axis => point.getComponent(axis) >= config.domain[0][axis] && point.getComponent(axis) <= config.domain[1][axis])) { latest.current.onSelect(point.toArray() as Vec3); return; }
      }
      if (!r.picker) return;
      const hit = raycaster.intersectObject(r.picker)[0];
      if (hit?.index !== undefined && r.points[hit.index]) latest.current.onSelect([...r.points[hit.index]] as Vec3);
    };
    canvas.addEventListener('pointerdown', pointerdown); canvas.addEventListener('pointerup', pointerup);
    const contextlost = (event: Event) => { event.preventDefault(); r.available = false; fail('Se perdió el contexto WebGL. Los datos numéricos siguen disponibles; recarga para recuperar la escena.'); };
    canvas.addEventListener('webglcontextlost', contextlost);
    return () => {
      disposed = true; if (frame) cancelAnimationFrame(frame); observer.disconnect();
      controls.removeEventListener('change', changed); controls.dispose();
      canvas.removeEventListener('keydown', keydown); canvas.removeEventListener('pointerdown', pointerdown); canvas.removeEventListener('pointerup', pointerup); canvas.removeEventListener('webglcontextlost', contextlost);
      disposeGroup(data); disposeGroup(selection); r.picker?.geometry.dispose(); if (r.picker) (r.picker.material as THREE.Material).dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove(); runtime.current = null;
    };
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (!r?.available) return;
    const sceneKey = JSON.stringify([props.config.domain, props.config.resolution, props.config.layers, props.config.scales, props.config.slice, props.config.seeds]);
    if (r.lastResult !== props.result || sceneKey !== r.lastSceneKey) {
      r.span = vector(props.config.domain[1]).sub(vector(props.config.domain[0])).length();
      projection(r); buildField(r, props.config, props.result); r.lastResult = props.result; r.lastSceneKey = sceneKey;
    }
    const saved = props.config.camera;
    if (!sameCamera(saved, cameraState(r))) {
      r.applyingCamera = true;
      try {
        r.camera.position.copy(vector(saved.position)); r.controls.target.copy(vector(saved.target)); r.camera.zoom = saved.zoom;
        const direction = r.camera.position.clone().sub(r.controls.target).normalize();
        r.camera.up.copy(Math.abs(direction.dot(upZ)) > .999 ? yAxis : upZ);
        r.camera.updateProjectionMatrix(); r.controls.update();
        r.camera.position.copy(vector(saved.position)); r.controls.target.copy(vector(saved.target)); r.camera.zoom = saved.zoom;
        r.camera.lookAt(r.controls.target); r.camera.updateProjectionMatrix(); r.camera.updateMatrixWorld();
      } finally { r.applyingCamera = false; }
    }
    r.requestRender();
  }, [props.config, props.result]);
  useEffect(() => { const r = runtime.current; if (r?.available) { updateSelection(r, props.config.inspected); r.requestRender(); } }, [props.config.inspected, props.config.domain]);
  useEffect(() => { const r = runtime.current; if (r?.available) { r.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, props.config.graphics.pixelRatio)); r.renderer.setSize(r.width, r.height, false); r.requestRender(); } }, [props.config.graphics.pixelRatio]);
  return <div ref={host} className="scene-host" style={{ position: 'relative', width: '100%', height: '100%' }}>
    {unavailable && <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', padding: 32, background: '#101010', color: '#f5f5f5', textAlign: 'center' }}><strong>Escena no disponible</strong><p>{unavailable}</p></div>}
  </div>;
});
export default SceneView;
