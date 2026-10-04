import type { Domain, Vec3 } from '../experiment/types';

/** Scene translation remains Float64; subtract it before constructing any GPU buffer. */
export function domainOrigin(domain: Domain): Vec3 {
  return domain[0].map((lower, axis) => lower + (domain[1][axis] - lower) / 2) as Vec3;
}

/** Return local coordinates in double precision, before any Float32 serialization. */
export function gpuPoint(point: Vec3, origin: Vec3): Vec3 {
  return [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
}
