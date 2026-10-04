import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/experiment/defaults';
import type { ComputeResult, Domain, StreamBranch, Vec3 } from '../../src/experiment/types';
import { domainOrigin, gpuPoint } from '../../src/scene/coordinates';
import { addCutPlane, addStreamlines, sliceAxes } from '../../src/scene/renderLayers';

const narrowBox: Domain = [[9999.999, 9999.999, 9999.999], [10000, 10000, 10000]];
function lattice(domain: Domain, n = 21): Vec3[] {
  const origin = domainOrigin(domain);
  return Array.from({ length: n }, (_, i) => [domain[0][0] + (domain[1][0] - domain[0][0]) * i / (n - 1), origin[1], origin[2]]);
}
function branch(points: Vec3[], direction: 1 | -1): StreamBranch { return { positions: points, direction, reason: 'boundary', length: .001, accepted: points.length - 1, rejected: 0 }; }
function dispose(group: THREE.Group) {
  group.traverse(object => {
    const renderable = object as THREE.Mesh;
    renderable.geometry?.dispose();
    if (renderable.material) for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) material.dispose();
  });
}
describe('scene coordinates before GPU serialization', () => {
  it.each([{ domain: narrowBox }, { domain: [[-10000, -10000, -10000], [-9999.999, -9999.999, -9999.999]] as Domain }])('preserves all 21 displaced samples at both coordinate limits', ({ domain }) => {
    const points = lattice(domain); const origin = domainOrigin(domain);
    // This is the actual loss produced by absolute-coordinate Float32 attributes.
    expect(new Set(new Float32Array(points.map(point => point[0]))).size).toBe(2);
    const local = new Float32Array(points.flatMap(point => gpuPoint(point, origin)));
    expect(new Set(points.map((_, i) => local[i * 3])).size).toBe(21);
    for (let i = 0; i < points.length; i++) for (let axis = 0; axis < 3; axis++) {
      expect(Math.abs(local[i * 3 + axis] + origin[axis] - points[i][axis])).toBeLessThan(1e-10);
    }
  });
  it('keeps both box boundaries and object world transforms in double precision', () => {
    const origin = domainOrigin(narrowBox); const group = new THREE.Group(); group.position.set(...origin);
    for (const point of narrowBox) {
      const object = new THREE.Object3D(); object.position.set(...gpuPoint(point, origin)); group.add(object);
      const world = object.getWorldPosition(new THREE.Vector3());
      world.toArray().forEach((value, axis) => expect(Math.abs(value - point[axis])).toBeLessThan(1e-12));
    }
    expect(gpuPoint(origin, origin)).toEqual([0, 0, 0]);
    expect(gpuPoint([1, -2, 3], [0, 0, 0])).toEqual([1, -2, 3]);
  });
  it('picks an individual displaced grid point through local Float32 geometry and a world-space ray', () => {
    const points = lattice(narrowBox); const origin = domainOrigin(narrowBox);
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points.flatMap(point => gpuPoint(point, origin)), 3));
    const picker = new THREE.Points(geometry, new THREE.PointsMaterial()); picker.position.set(...origin); picker.updateMatrixWorld(true);
    const target = points[7];
    const raycaster = new THREE.Raycaster(new THREE.Vector3(target[0], target[1], target[2] + 1), new THREE.Vector3(0, 0, -1));
    raycaster.params.Points.threshold = 1e-8;
    const hits = raycaster.intersectObject(picker);
    expect(hits).toHaveLength(1); expect(hits[0].index).toBe(7);
    expect(points[hits[0].index!]).toEqual(target);
    geometry.dispose(); (picker.material as THREE.Material).dispose();
  });
  it('preserves the actual Float32 translations used by instanced arrows and circles', () => {
    const points = lattice(narrowBox); const origin = domainOrigin(narrowBox);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), points.length);
    mesh.position.set(...origin);
    const dummy = new THREE.Object3D(); dummy.scale.setScalar(1e-6);
    points.forEach((point, i) => { dummy.position.set(...gpuPoint(point, origin)); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    const matrix = new THREE.Matrix4(); const translations: number[] = [];
    points.forEach((point, i) => {
      mesh.getMatrixAt(i, matrix); translations.push(matrix.elements[12]);
      expect(Math.abs(matrix.elements[12] + origin[0] - point[0])).toBeLessThan(1e-10);
    });
    expect(new Set(translations).size).toBe(21);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
  });
  it('subtracts group and camera origins on the CPU before the model-view uniform becomes Float32', () => {
    const points = lattice(narrowBox); const origin = domainOrigin(narrowBox);
    const group = new THREE.Group(); group.position.set(...origin); group.updateMatrixWorld(true);
    const camera = new THREE.OrthographicCamera(-.002, .002, .002, -.002, .00001, 1);
    camera.position.set(origin[0] + .002, origin[1] - .003, origin[2] + .004); camera.up.set(0, 0, 1); camera.lookAt(new THREE.Vector3(...origin)); camera.updateMatrixWorld();
    const doubleModelView = new THREE.Matrix4().multiplyMatrices(camera.matrixWorldInverse, group.matrixWorld);
    const gpuModelView = new THREE.Matrix4().fromArray(new Float32Array(doubleModelView.elements));
    const local = new Float32Array(points.flatMap(point => gpuPoint(point, origin)));
    points.forEach((point, i) => {
      const actual = new THREE.Vector3(local[i * 3], local[i * 3 + 1], local[i * 3 + 2]).applyMatrix4(gpuModelView);
      const expected = new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse);
      expect(actual.distanceTo(expected)).toBeLessThan(1e-9);
    });
  });
  it('stores both actual line segment endpoints and chevrons locally without changing integration data', () => {
    const config = defaultConfig(); config.domain = narrowBox; config.resolution = 21; config.layers.lines = true;
    const origin = domainOrigin(config.domain); const points = lattice(config.domain); const original = structuredClone(points);
    const result: ComputeResult = { revision: 1, config, samples: [], slice: [], lines: [{ seed: points[0], forward: branch(points, 1), backward: branch([], -1), closed: false }], stats: { valid: 0, invalid: 0, zeros: 0, fieldMs: 0, linesMs: 0, partial: false, inactiveSeeds: 0 } };
    const group = new THREE.Group(); group.position.set(...origin);
    const stats = addStreamlines(group, config, result, 1.25, origin);
    expect(stats.vertices).toBe(40); expect(stats.chevrons).toBeGreaterThan(0);
    const line = group.children[0] as THREE.Mesh;
    const start = line.geometry.getAttribute('instanceStart'); const end = line.geometry.getAttribute('instanceEnd');
    expect(start.count).toBe(20); expect(new Set(Array.from({ length: start.count }, (_, i) => start.getX(i))).size).toBe(20);
    for (let i = 0; i < start.count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        expect(Math.abs(start.getComponent(i, axis) + origin[axis] - points[i][axis])).toBeLessThan(1e-10);
        expect(Math.abs(end.getComponent(i, axis) + origin[axis] - points[i + 1][axis])).toBeLessThan(1e-10);
      }
    }
    const marks = group.children[1] as THREE.Mesh;
    for (const name of ['instanceStart', 'instanceEnd']) {
      const attribute = marks.geometry.getAttribute(name);
      for (let i = 0; i < attribute.count; i++) for (let axis = 0; axis < 3; axis++) expect(Math.abs(attribute.getComponent(i, axis))).toBeLessThan(.001);
    }
    expect(points).toEqual(original); dispose(group);
  });
  it.each(['XY', 'XZ', 'YZ'] as const)('builds a local %s mesh and contour while retaining the global picking plane', plane => {
    const config = defaultConfig(); config.domain = narrowBox; config.slice.plane = plane;
    const origin = domainOrigin(config.domain); const [u, v, normal] = sliceAxes(plane);
    config.slice.position = origin[normal] + .000125;
    const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    const group = new THREE.Group(); group.position.set(...origin);
    const cut = addCutPlane(group, config, texture, origin);
    expect(cut.plane.constant).toBe(-config.slice.position);
    const planePoint = [...origin] as Vec3; planePoint[normal] = config.slice.position;
    expect(cut.plane.distanceToPoint(new THREE.Vector3(...planePoint))).toBe(0);
    const mesh = group.children[0] as THREE.Mesh; const contour = group.children[1] as THREE.Line;
    for (const object of [mesh, contour]) {
      const positions = object.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Math.abs(positions.getComponent(i, normal) + origin[normal] - config.slice.position)).toBeLessThan(1e-10);
        for (const axis of [u, v]) {
          const world = positions.getComponent(i, axis) + origin[axis];
          expect(Math.min(Math.abs(world - config.domain[0][axis]), Math.abs(world - config.domain[1][axis]))).toBeLessThan(1e-10);
          expect(Math.abs(positions.getComponent(i, axis))).toBeLessThan(.001);
        }
      }
    }
    dispose(group); texture.dispose();
  });
});
