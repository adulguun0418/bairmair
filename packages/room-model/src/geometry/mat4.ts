import type { Mat4, Vec3 } from '../schema/primitives';

// 4x4 matrices are 16 numbers in column-major order: element (row, column) is m[column * 4 + row].

export function mat4Identity(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** A rotation by `yaw` about +Y followed by a translation. */
export function mat4FromYawTranslation(yaw: number, translation: Vec3): Mat4 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const [tx, ty, tz] = translation;
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, tx, ty, tz, 1];
}

/** Column `index` (0..3) of the matrix as a 3-vector. */
export function mat4Column(m: Mat4, index: number): Vec3 {
  const base = index * 4;
  return [m[base] ?? 0, m[base + 1] ?? 0, m[base + 2] ?? 0];
}

/** Applies the matrix to a point (w = 1). */
export function transformPoint(m: Mat4, point: Vec3): Vec3 {
  const [x, y, z] = point;
  const at = (i: number) => m[i] ?? 0;
  return [
    at(0) * x + at(4) * y + at(8) * z + at(12),
    at(1) * x + at(5) * y + at(9) * z + at(13),
    at(2) * x + at(6) * y + at(10) * z + at(14),
  ];
}
