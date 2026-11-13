import { lengthAlongOutline } from './geometry/faces';
import { polygonArea } from './geometry/polygon';
import { wallEndpoints } from './geometry/wall';
import type { RoomModelV1, Wall } from './schema/model';
import type { Vec2 } from './schema/primitives';

/** A room with fewer walls along its outline was not scanned all the way round. */
export const MIN_ROOM_WALLS = 3;
/** How far a wall may sit from a room's outline and still be one of its walls, in meters. */
const OUTLINE_WALL_TOLERANCE_M = 0.3;
/** A wall belongs to an outline when this much of it runs along it (or half of a shorter wall). */
const OUTLINE_WALL_MIN_M = 0.3;

/**
 * How many meters of a wall run along a room outline; 0 unless enough of it does to make it
 * one of that room's walls.
 */
export function wallAlongOutline(
  wall: Pick<Wall, 'transform' | 'dimensions'>,
  outline: readonly Vec2[],
): number {
  const [a, b] = wallEndpoints(wall);
  const along = lengthAlongOutline(a, b, outline, OUTLINE_WALL_TOLERANCE_M);
  return along >= Math.min(OUTLINE_WALL_MIN_M, wall.dimensions.width / 2) ? along : 0;
}

/**
 * How many walls run along a room outline, whichever room they are assigned to: a wall
 * between two rooms counts for both.
 */
export function outlineWallCount(
  walls: readonly Pick<Wall, 'transform' | 'dimensions'>[],
  outline: readonly Vec2[],
): number {
  return walls.filter((wall) => wallAlongOutline(wall, outline) > 0).length;
}

/** Rooms with fewer than `MIN_ROOM_WALLS` walls: the scan probably missed part of them. */
export function incompleteRoomIds(model: RoomModelV1): string[] {
  return model.rooms
    .filter((room) => outlineWallCount(model.walls, room.floor.polygon) < MIN_ROOM_WALLS)
    .map((room) => room.id);
}

export interface RoomMetrics {
  id: string;
  /** Floor area in square meters, rounded to 2 decimals. */
  areaM2: number;
}

export interface ModelMetrics {
  /**
   * Sum of the rounded room areas, so the per-room numbers shown to a user always add up
   * to the total. Scanned areas are approximate and measured between inner wall surfaces.
   */
  totalAreaM2: number;
  rooms: RoomMetrics[];
  counts: {
    rooms: number;
    walls: number;
    doors: number;
    windows: number;
    openings: number;
    objects: number;
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Per-room and total floor area, plus element counts. Stored in `room_scans.metrics`. */
export function computeMetrics(model: RoomModelV1): ModelMetrics {
  const rooms = model.rooms.map((room) => ({
    id: room.id,
    areaM2: round2(polygonArea(room.floor.polygon)),
  }));
  return {
    totalAreaM2: round2(rooms.reduce((sum, room) => sum + room.areaM2, 0)),
    rooms,
    counts: {
      rooms: model.rooms.length,
      walls: model.walls.length,
      doors: model.doors.length,
      windows: model.windows.length,
      openings: model.openings.length,
      objects: model.objects.length,
    },
  };
}
