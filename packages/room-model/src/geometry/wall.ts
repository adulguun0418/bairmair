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
