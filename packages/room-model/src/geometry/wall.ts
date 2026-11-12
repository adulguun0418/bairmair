import type { Dimensions, Transform, Vec2 } from '../schema/primitives';

interface Placed {
  transform: Transform;
  dimensions: Dimensions;
}

/** Wraps an angle into the range (-PI, PI]. */
export function normalizeAngle(angle: number): number {
  const wrapped = angle % (2 * Math.PI);
  if (wrapped > Math.PI) return wrapped - 2 * Math.PI;
  if (wrapped <= -Math.PI) return wrapped + 2 * Math.PI;
  return wrapped;
}

/** Plan-view direction `[x, z]` of an element's local +X axis for a given yaw. */
export function directionFromYaw(yaw: number): Vec2 {
  return [Math.cos(yaw), -Math.sin(yaw)];
}

/** The yaw whose local +X axis points along the plan-view direction `[dx, dz]`. */
export function yawFromDirection(dx: number, dz: number): number {
  // Avoid negative zero, which would turn a heading of +PI into -PI.
  return Math.atan2(dz === 0 ? 0 : -dz, dx);
}

/** Plan-view endpoints of a wall: `[start, end]`, with local +X pointing from start to end. */
export function wallEndpoints(wall: Placed): [Vec2, Vec2] {
  const [dx, dz] = directionFromYaw(wall.transform.yaw);
  const half = wall.dimensions.width / 2;
  const [x, , z] = wall.transform.position;
  return [
    [x - dx * half, z - dz * half],
    [x + dx * half, z + dz * half],
  ];
}

export interface ApertureCutout {
  /** Aperture center along the wall, in meters from the wall center (wall-local +X). */
  u: number;
  /** Aperture center height, in meters from the wall center (up). */
  v: number;
  width: number;
  height: number;
  /** Plan-view distance between the aperture center and the wall plane. */
  distance: number;
}

/**
 * Projects a door, window or opening onto a wall. Both renderers use this to cut the hole,
 * so the wall and the aperture never have to agree on exact coordinates.
 */
export function apertureCutout(aperture: Placed, wall: Placed): ApertureCutout {
  const [dx, dz] = directionFromYaw(wall.transform.yaw);
  const offsetX = aperture.transform.position[0] - wall.transform.position[0];
  const offsetZ = aperture.transform.position[2] - wall.transform.position[2];
  return {
    u: offsetX * dx + offsetZ * dz,
    v: aperture.transform.position[1] - wall.transform.position[1],
    width: aperture.dimensions.width,
    height: aperture.dimensions.height,
    // The wall normal in plan view is the direction rotated by 90 degrees.
    distance: Math.abs(offsetX * -dz + offsetZ * dx),
  };
}

/** A solid rectangle of a wall face, in wall-local meters from the wall center. */
export interface WallSegment {
  /** Along the wall (local +X). */
  u0: number;
  u1: number;
  /** Up (local +Y). */
  v0: number;
  v1: number;
}

/**
 * Splits a wall face into solid rectangles around its doors, windows and openings, so a
 * renderer can draw a wall with holes as a few boxes.
 *
 * Cutouts are clamped to the wall. Cutouts whose spans along the wall overlap are merged into
 * one, which covers the realistic cases (a door next to a window) without polygon clipping.
 */
export function wallSegments(
  width: number,
  height: number,
  cutouts: readonly Pick<ApertureCutout, 'u' | 'v' | 'width' | 'height'>[],
  minSize = 0.01,
): WallSegment[] {
  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;

  const holes = cutouts
    .map((cutout) => ({
      u0: Math.max(left, cutout.u - cutout.width / 2),
      u1: Math.min(right, cutout.u + cutout.width / 2),
      v0: Math.max(bottom, cutout.v - cutout.height / 2),
      v1: Math.min(top, cutout.v + cutout.height / 2),
    }))
    .filter((hole) => hole.u1 - hole.u0 >= minSize && hole.v1 - hole.v0 >= minSize)
    .sort((a, b) => a.u0 - b.u0);

  const merged: WallSegment[] = [];
  for (const hole of holes) {
    const last = merged[merged.length - 1];
    if (last && hole.u0 < last.u1) {
      last.u1 = Math.max(last.u1, hole.u1);
      last.v0 = Math.min(last.v0, hole.v0);
      last.v1 = Math.max(last.v1, hole.v1);
    } else {
      merged.push({ ...hole });
    }
  }

  const segments: WallSegment[] = [];
  const add = (u0: number, u1: number, v0: number, v1: number) => {
    if (u1 - u0 >= minSize && v1 - v0 >= minSize) segments.push({ u0, u1, v0, v1 });
  };
  let cursor = left;
  for (const hole of merged) {
    add(cursor, hole.u0, bottom, top);
    add(hole.u0, hole.u1, bottom, hole.v0);
    add(hole.u0, hole.u1, hole.v1, top);
    cursor = hole.u1;
  }
  add(cursor, right, bottom, top);
  return segments;
}
