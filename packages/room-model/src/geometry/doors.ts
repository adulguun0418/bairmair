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
}

/**
 * The apartment's front door, guessed from the scan: a door with no scanned floor behind it,
 * in a room a front door can open into. RoomPlan does not mark entrances, and a door into a room
 * that was not scanned looks the same, so when several doors qualify and none stands out (a
 * hallway, a front-door width), there is no answer rather than a wrong one.
 */
export function findEntrance(model: RoomModelV1): Entrance | null {
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
    const leadsIntoRoom = ENTRANCE_PROBES_M.some((distance) => {
      const probe: Vec2 = [x + outward[0] * distance, z + outward[1] * distance];
      return model.rooms.some(
        (other) => other.story === room.story && pointInPolygon(probe, other.floor.polygon),
      );
    });
    if (leadsIntoRoom) continue;

    const score =
      (room.label === 'hallway' ? 2 : room.label === 'other' ? 1 : 0) +
      (door.dimensions.width >= ENTRANCE_MIN_WIDTH_M ? 1 : 0);
    candidates.push({ door, outward, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const [best, second] = candidates;
  if (!best || (second && second.score === best.score)) return null;
  return { door: best.door, outward: best.outward };
}
