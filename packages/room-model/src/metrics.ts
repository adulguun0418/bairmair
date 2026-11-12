import { polygonArea } from './geometry/polygon';
import type { RoomModelV1 } from './schema/model';

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
