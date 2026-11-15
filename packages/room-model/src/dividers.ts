import { distanceToPolygonEdge, pointInPolygon, polygonArea } from './geometry/polygon';
import { wallAlongOutline } from './metrics';
import { roundLength, roundTo } from './round';
import {
  DIVIDER_ID_PATTERN,
  LIMITS,
  type Aperture,
  type DividerLine,
  type RoomLabel,
  type RoomModelV1,
  type Room,
} from './schema/model';
import type { Vec2 } from './schema/primitives';

/**
 * A line a seller drew across a room to split it: rooms the walls did not close off (an open
 * kitchen, a doorway RoomPlan missed). Stored in `room_scans.room_dividers`.
 *
 * The points are in the RAW scan's plan coordinates (RoomPlan's x and z), not the model's, so a
 * divider survives re-conversion even if a later converter places the model differently.
 */
export interface RoomDivider {
  /** Short and unique within the scan (`DIVIDER_ID_PATTERN`); names the room it splits off. */
  id: string;
  a: Vec2;
  b: Vec2;
}

export const ROOM_DIVIDER_LIMITS = {
  count: LIMITS.dividers,
  /** Shorter strokes are taps, not lines. */
  minLengthM: 0.3,
  /** Each part of a split room must be at least this large. */
  minPartAreaM2: 0.5,
  /** A line within this angle of the plan's axes (the walls' directions) is straightened. */
  straightenDeg: 8,
} as const;

/** Rooms split off by a divider are named `<room id, cut to this length>~<divider id>`. */
const PARENT_ID_PREFIX = 40;
/** Coordinates are stored to 0.1 mm. */
const STORED_DECIMALS = 4;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e5;
const isPoint = (value: unknown): value is Vec2 =>
  Array.isArray(value) && value.length === 2 && finite(value[0]) && finite(value[1]);

/**
 * Reads `room_scans.room_dividers`, JSON written by phones: well-formed dividers only, the
 * first of any repeated id, at most `ROOM_DIVIDER_LIMITS.count`.
 */
export function parseRoomDividers(value: unknown): RoomDivider[] {
  if (!Array.isArray(value)) return [];
  const dividers: RoomDivider[] = [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (dividers.length >= ROOM_DIVIDER_LIMITS.count) break;
    if (!entry || typeof entry !== 'object') continue;
    const { id, a, b } = entry as { id?: unknown; a?: unknown; b?: unknown };
    if (typeof id !== 'string' || !DIVIDER_ID_PATTERN.test(id) || ids.has(id)) continue;
    if (!isPoint(a) || !isPoint(b)) continue;
    ids.add(id);
    dividers.push({ id, a: [a[0], a[1]], b: [b[0], b[1]] });
  }
  return dividers;
}

/** The plan-view part of `frame.fromSource`: model = M · source + t. */
function planFrame(model: RoomModelV1) {
  const m = model.frame.fromSource;
  const at = (i: number) => m[i] ?? 0;
  return { xx: at(0), xz: at(8), zx: at(2), zz: at(10), tx: at(12), tz: at(14) };
}

/** Raw scan plan coordinates → model plan coordinates. */
export function sourceToPlan(model: RoomModelV1, point: Vec2): Vec2 {
  const f = planFrame(model);
  return [f.xx * point[0] + f.xz * point[1] + f.tx, f.zx * point[0] + f.zz * point[1] + f.tz];
}

/** Model plan coordinates → raw scan plan coordinates (for storing a line drawn on the plan). */
export function planToSource(model: RoomModelV1, point: Vec2): Vec2 {
  const f = planFrame(model);
  const det = f.xx * f.zz - f.xz * f.zx;
  const x = point[0] - f.tx;
  const z = point[1] - f.tz;
  return [
    roundTo((f.zz * x - f.xz * z) / det, STORED_DECIMALS),
    roundTo((-f.zx * x + f.xx * z) / det, STORED_DECIMALS),
  ];
}

/** A divider from a line drawn on the plan (model coordinates). */
export function dividerFromPlan(model: RoomModelV1, id: string, a: Vec2, b: Vec2): RoomDivider {
  return { id, a: planToSource(model, a), b: planToSource(model, b) };
}

export type DividerResult =
  /** The room `roomId` was split; `newRoomId` is the part split off (the smaller one). */
  | { id: string; status: 'applied'; roomId: string; newRoomId: string }
  /** The line's middle is not inside any room. */
  | { id: string; status: 'outsideRooms' }
  /** The line is too short, or does not cross the room from one side to the other. */
  | { id: string; status: 'noCut' }
  /** One of the parts would be smaller than `ROOM_DIVIDER_LIMITS.minPartAreaM2`. */
  | { id: string; status: 'tooSmall' };

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];

/** Turns a nearly axis-aligned line about its middle onto the axis. */
function straighten(a: Vec2, b: Vec2): [Vec2, Vec2] {
  const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const axis = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  if (Math.abs(angle - axis) > (ROOM_DIVIDER_LIMITS.straightenDeg * Math.PI) / 180) return [a, b];
  const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  const d: Vec2 = [Math.cos(axis) * half, Math.sin(axis) * half];
  return [
    [middle[0] - d[0], middle[1] - d[1]],
    [middle[0] + d[0], middle[1] + d[1]],
  ];
}

/**
 * Cuts a polygon along the line through `middle` (inside it) in direction `d`, from the
 * outline crossing nearest behind the middle to the nearest one ahead. Returns the two parts
 * (counter-clockwise like the input) and the cut, or null when the line does not cross.
 */
function cutPolygon(
  polygon: readonly Vec2[],
  middle: Vec2,
  d: Vec2,
): { parts: [Vec2[], Vec2[]]; chord: [Vec2, Vec2] } | null {
  let behind: { s: number; edge: number; point: Vec2 } | null = null;
  let ahead: { s: number; edge: number; point: Vec2 } | null = null;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const p = polygon[i]!;
    const e = sub(polygon[(i + 1) % n]!, p);
    const denominator = cross(d, e);
    if (Math.abs(denominator) < 1e-12) continue;
    const mp = sub(p, middle);
    const s = cross(mp, e) / denominator; // along the line from the middle
    const u = cross(mp, d) / denominator; // along the edge
    if (u < 0 || u >= 1) continue;
    const point: Vec2 = [p[0] + e[0] * u, p[1] + e[1] * u];
    if (s < 0 && (behind === null || s > behind.s)) behind = { s, edge: i, point };
    if (s > 0 && (ahead === null || s < ahead.s)) ahead = { s, edge: i, point };
  }
  if (!behind || !ahead || behind.edge === ahead.edge) return null;

  // Walk the outline from one crossing to the other, each way round.
  const walk = (from: { edge: number; point: Vec2 }, to: { edge: number; point: Vec2 }) => {
    const points: Vec2[] = [from.point];
    for (let i = (from.edge + 1) % n; ; i = (i + 1) % n) {
      points.push(polygon[i]!);
      if (i === to.edge) break;
    }
    points.push(to.point);
    return withoutRepeats(points);
  };
  return {
    parts: [walk(behind, ahead), walk(ahead, behind)],
    chord: [behind.point, ahead.point],
  };
}

/** Rounds to the model's precision and drops points that land on their neighbour. */
function withoutRepeats(points: readonly Vec2[]): Vec2[] {
  const rounded = points.map(([x, z]): Vec2 => [roundLength(x), roundLength(z)]);
  return rounded.filter((point, i) => {
    const next = rounded[(i + 1) % rounded.length]!;
    return point[0] !== next[0] || point[1] !== next[1];
  });
}

/**
 * Applies a scan's dividers to its model, one after another (a later line can split a part an
 * earlier one made). The larger part of a split room keeps the room's id, so labels and photos
 * stay with it; the smaller part is new. Both are labelled from RoomPlan's points inside them
 * (models from converter 0.5.0 on); without those, the larger part keeps the room's label and
 * the new part is `other`. Walls, doors, windows and furniture move to the part they belong to.
 *
 * Total area never changes: the parts share the room's floor exactly. Pure and deterministic.
 */
export function applyRoomDividers(
  model: RoomModelV1,
  dividers: readonly RoomDivider[],
): { model: RoomModelV1; results: DividerResult[] } {
  let rooms = [...model.rooms];
  let walls = model.walls;
  let doors = model.doors;
  let windows = model.windows;
  let openings = model.openings;
  let objects = model.objects;
  const lines: DividerLine[] = [...(model.dividers ?? [])];
  const results: DividerResult[] = [];
  const usedIds = new Set([...model.rooms.map((room) => room.id), ...lines.map((line) => line.id)]);

  for (const divider of dividers.slice(0, ROOM_DIVIDER_LIMITS.count)) {
    const fail = (status: 'outsideRooms' | 'noCut' | 'tooSmall') =>
      results.push({ id: divider.id, status });
    if (!DIVIDER_ID_PATTERN.test(divider.id) || lines.some((line) => line.id === divider.id)) {
      fail('noCut');
      continue;
    }
    const [a, b] = straighten(sourceToPlan(model, divider.a), sourceToPlan(model, divider.b));
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < ROOM_DIVIDER_LIMITS.minLengthM) {
      fail('noCut');
      continue;
    }
    const middle: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const index = rooms.findIndex((room) => pointInPolygon(middle, room.floor.polygon));
    if (index < 0) {
      fail('outsideRooms');
      continue;
    }
    const room = rooms[index]!;
    const cut = cutPolygon(room.floor.polygon, middle, [
      (b[0] - a[0]) / length,
      (b[1] - a[1]) / length,
    ]);
    if (!cut || cut.parts.some((part) => part.length < 3)) {
      fail('noCut');
      continue;
    }
    const areas = cut.parts.map((part) => polygonArea(part));
    if (areas.some((area) => area < ROOM_DIVIDER_LIMITS.minPartAreaM2)) {
      fail('tooSmall');
      continue;
    }
    const [kept, split] = areas[0]! >= areas[1]! ? cut.parts : [cut.parts[1], cut.parts[0]];
    const newId = `${room.id.slice(0, PARENT_ID_PREFIX)}~${divider.id}`;
    if (usedIds.has(newId)) {
      fail('noCut');
      continue;
    }
    usedIds.add(newId);

    const labelled = (outline: readonly Vec2[]): RoomLabel | null =>
      model.sections?.find(
        (section) =>
          section.story === room.story &&
          section.label !== 'other' &&
          pointInPolygon(section.point, outline),
      )?.label ?? null;
    const hasSections = (model.sections?.length ?? 0) > 0;
    const keptRoom: Room = {
      ...room,
      label: labelled(kept) ?? (hasSections ? 'other' : room.label),
      floor: { ...room.floor, polygon: kept },
    };
    // A custom name stays with the room's id; the new part has none.
    const newRoom: Room = {
      id: newId,
      label: labelled(split) ?? 'other',
      story: room.story,
      floor: { ...room.floor, polygon: split },
    };
    rooms = [...rooms.slice(0, index), keptRoom, newRoom, ...rooms.slice(index + 1)];

    // Elements of the room go to the part they belong to.
    const nearer = (point: Vec2) => {
      const inSplit = pointInPolygon(point, split);
      if (inSplit !== pointInPolygon(point, kept)) return inSplit ? newId : room.id;
      return distanceToPolygonEdge(point, split) < distanceToPolygonEdge(point, kept)
        ? newId
        : room.id;
    };
    walls = walls.map((wall) => {
      if (wall.roomId !== room.id) return wall;
      const alongKept = wallAlongOutline(wall, kept);
      const alongSplit = wallAlongOutline(wall, split);
      const roomId =
        alongKept === alongSplit
          ? nearer([wall.transform.position[0], wall.transform.position[2]])
          : alongSplit > alongKept
            ? newId
            : room.id;
      return roomId === wall.roomId ? wall : { ...wall, roomId };
    });
    const wallRooms = new Map(walls.map((wall) => [wall.id, wall.roomId]));
    const moveAperture = (aperture: Aperture): Aperture => {
      if (aperture.roomId !== room.id) return aperture;
      const ofWall = aperture.wallId === null ? undefined : wallRooms.get(aperture.wallId);
      const roomId =
        ofWall === room.id || ofWall === newId
          ? ofWall
          : nearer([aperture.transform.position[0], aperture.transform.position[2]]);
      return roomId === aperture.roomId ? aperture : { ...aperture, roomId };
    };
    doors = doors.map(moveAperture);
    windows = windows.map(moveAperture);
    openings = openings.map(moveAperture);
    objects = objects.map((object) => {
      if (object.roomId !== room.id) return object;
      const roomId = nearer([object.transform.position[0], object.transform.position[2]]);
      return roomId === object.roomId ? object : { ...object, roomId };
    });

    lines.push({ id: divider.id, a: cut.chord[0], b: cut.chord[1] });
    results.push({ id: divider.id, status: 'applied', roomId: room.id, newRoomId: newId });
  }

  if (lines.length === (model.dividers?.length ?? 0)) return { model, results };
  return {
    model: {
      ...model,
      rooms,
      walls,
      doors,
      windows,
      openings,
      objects,
      dividers: lines.map(({ id, a, b }) => ({
        id,
        a: [roundLength(a[0]), roundLength(a[1])],
        b: [roundLength(b[0]), roundLength(b[1])],
      })),
    },
    results,
  };
}

/**
 * Whether a room was made by one of these dividers: `<room>~<divider>`, possibly split again
 * (`<room>~<divider>~<later divider>`). Such rooms go away with the divider, and so do their
 * labels and photo assignments.
 */
export function isMadeByDivider(roomId: string, dividerIds: ReadonlySet<string>): boolean {
  return roomId
    .split('~')
    .slice(1)
    .some((part) => dividerIds.has(part));
}
