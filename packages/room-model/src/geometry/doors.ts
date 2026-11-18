import type { Aperture, RoomLabel, RoomModelV1 } from '../schema/model';
import type { Vec2 } from '../schema/primitives';
import { inwardNormal } from './layout';
import { pointInPolygon } from './polygon';
import { directionFromYaw } from './wall';

/** Two doors closer than this, and parallel, are the two sides of one physical door. */
export const DOOR_PAIR_DISTANCE_M = 0.5;

/** Whether two doors are the two sides of one physical door (scanned from both rooms). */
export function isSameDoor(a: Aperture, b: Aperture): boolean {
  const [ax, , az] = a.transform.position;
  const [bx, , bz] = b.transform.position;
  const [adx, adz] = directionFromYaw(a.transform.yaw);
  const [bdx, bdz] = directionFromYaw(b.transform.yaw);
  return (
    Math.hypot(ax - bx, az - bz) < DOOR_PAIR_DISTANCE_M && Math.abs(adx * bdx + adz * bdz) > 0.9
  );
}

/**
 * Plan-view hinge side of a door, the same one the floor plan draws: the door's local -X end.
 * RoomPlan does not report hinges, so this is a convention, not a measurement.
 */
export function doorHinge(door: Aperture): Vec2 {
  const [x, , z] = door.transform.position;
  const [dx, dz] = directionFromYaw(door.transform.yaw);
  const half = door.dimensions.width / 2;
  return [x - dx * half, z - dz * half];
}

/** How far beyond a door to look for floor, in meters (past a wall scanned from both sides). */
const ENTRANCE_PROBES_M = [0.3, 0.6, 0.9];
/** Rooms an apartment's front door never opens into. */
const NOT_ENTRANCE_ROOMS: readonly RoomLabel[] = [
  'bedroom',
  'bathroom',
  'toilet',
  'balcony',
  'storage',
];
/** Front doors are usually at least this wide; interior and bathroom doors often narrower. */
const ENTRANCE_MIN_WIDTH_M = 0.78;

export interface Entrance {
  door: Aperture;
  /** Plan-view unit vector pointing out of the apartment through the door. */
  outward: Vec2;
  /** `seller`: marked by the seller (`entranceDoorId`); `guess`: worked out from the scan. */
  source: 'seller' | 'guess';
}

/** Whether a plan point is on the floor of any room of the given story. */
function onFloor(model: RoomModelV1, point: Vec2, story: number): boolean {
  return model.rooms.some(
    (room) => room.story === story && pointInPolygon(point, room.floor.polygon),
  );
}

/**
 * The plan-view direction out of the apartment through a door: away from its own room, or,
 * without one, towards the side with no floor.
 */
export function doorOutward(model: RoomModelV1, door: Aperture): Vec2 {
  const [x, , z] = door.transform.position;
  const room = door.roomId === null ? undefined : model.rooms.find((r) => r.id === door.roomId);
  const inward = room ? inwardNormal([x, z], door.transform.yaw, room.floor.polygon) : null;
  if (inward) return [-inward[0], -inward[1]];
  const [dx, dz] = directionFromYaw(door.transform.yaw);
  const normals: Vec2[] = [
    [-dz, dx],
    [dz, -dx],
  ];
  const story = room?.story ?? 0;
  const open = normals.find(
    ([nx, nz]) =>
      !onFloor(model, [x + nx * ENTRANCE_PROBES_M[0]!, z + nz * ENTRANCE_PROBES_M[0]!], story),
  );
  return open ?? normals[0]!;
}

/** Taps further than this from every door pick no door. */
export const DOOR_PICK_DISTANCE_M = 0.6;

/**
 * The door nearest to a plan point (distance to the door's span along its wall), if any is
 * within `maxDistance`. For picking a door on the floor plan.
 */
export function doorNear(
  model: RoomModelV1,
  point: Vec2,
  maxDistance = DOOR_PICK_DISTANCE_M,
): Aperture | null {
  let best: { door: Aperture; distance: number } | null = null;
  for (const door of model.doors) {
    const [x, , z] = door.transform.position;
    const [dx, dz] = directionFromYaw(door.transform.yaw);
    const half = door.dimensions.width / 2;
    const along = Math.max(-half, Math.min(half, (point[0] - x) * dx + (point[1] - z) * dz));
    const distance = Math.hypot(point[0] - (x + dx * along), point[1] - (z + dz * along));
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { door, distance };
  }
  return best?.door ?? null;
}

/**
 * The apartment's front door: the one the seller marked (`entranceDoorId`), else a guess from
 * the scan: a door with no scanned floor behind it, in a room a front door can open into.
 * RoomPlan does not mark entrances, and a door into a room that was not scanned looks the same,
 * so when several doors qualify and none stands out (a hallway, a front-door width), the guess
 * is no answer rather than a wrong one.
 */
export function findEntrance(model: RoomModelV1): Entrance | null {
  const marked =
    model.entranceDoorId === undefined
      ? undefined
      : model.doors.find((door) => door.id === model.entranceDoorId);
  if (marked) return { door: marked, outward: doorOutward(model, marked), source: 'seller' };

  const rooms = new Map(model.rooms.map((room) => [room.id, room]));
  const candidates: (Entrance & { score: number })[] = [];

  for (const door of model.doors) {
    const room = door.roomId === null ? undefined : rooms.get(door.roomId);
    if (!room || NOT_ENTRANCE_ROOMS.includes(room.label)) continue;
    // Seen from both sides: it joins two rooms.
    if (model.doors.some((other) => other !== door && isSameDoor(other, door))) continue;

    const [x, , z] = door.transform.position;
    const inward = inwardNormal([x, z], door.transform.yaw, room.floor.polygon);
    if (!inward) continue;
    const outward: Vec2 = [-inward[0], -inward[1]];
    const leadsIntoRoom = ENTRANCE_PROBES_M.some((distance) =>
      onFloor(model, [x + outward[0] * distance, z + outward[1] * distance], room.story),
    );
    if (leadsIntoRoom) continue;

    const score =
      (room.label === 'hallway' ? 2 : room.label === 'other' ? 1 : 0) +
      (door.dimensions.width >= ENTRANCE_MIN_WIDTH_M ? 1 : 0);
    candidates.push({ door, outward, source: 'guess', score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const [best, second] = candidates;
  if (!best || (second && second.score === best.score)) return null;
  return { door: best.door, outward: best.outward, source: 'guess' };
}
