import * as z from 'zod';
import { enclosedFaces } from '../geometry/faces';
import { mat4Column, mat4FromYawTranslation, transformPoint } from '../geometry/mat4';
import {
  boundsOf,
  distanceToPolygonEdge,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonEdges,
  signedArea,
} from '../geometry/polygon';
import { apertureCutout, normalizeAngle, wallEndpoints, yawFromDirection } from '../geometry/wall';
import { MIN_ROOM_WALLS, outlineWallCount, wallAlongOutline } from '../metrics';
import { roundAngle, roundLength, roundTo } from '../round';
import {
  MIN_ROOM_AREA_M2,
  OBJECT_CATEGORIES,
  RoomModelV1Schema,
  type Aperture,
  type ObjectCategory,
  type Room,
  type RoomLabel,
  type RoomModelV1,
  type RoomObject,
  type Wall,
} from '../schema/model';
import type { Mat4, Transform, Vec2, Vec3 } from '../schema/primitives';
import { parseRoomPlanCapture, type CaptureSurface, type RoomPlanCapture } from './capture';

/** Bump when the conversion output changes for the same input. Stored with every model. */
export const CONVERTER_VERSION = '0.3.0';

export type ConversionWarningCode =
  | 'no-floors'
  | 'degenerate-element'
  | 'tilted-element'
  | 'curved-wall-flattened'
  | 'orphan-aperture'
  | 'unassigned-element'
  | 'incomplete-room'
  | 'rooms-not-split';

export interface ConversionWarning {
  code: ConversionWarningCode;
  message: string;
  elementId?: string;
}

export interface ConversionResult {
  model: RoomModelV1;
  warnings: ConversionWarning[];
}

export class RoomPlanConversionError extends Error {
  override name = 'RoomPlanConversionError';
}

/** Elements smaller than this in width or height are dropped. */
const MIN_SIZE_M = 0.001;
/** A wall or aperture belongs to a room if it lies within this distance of the floor outline. */
const ROOM_SNAP_M = 0.5;
/** An aperture without a parent is attached to a wall within this distance of its center. */
const WALL_SNAP_M = 0.3;
/** Elements leaning more than about 5 degrees are flattened and reported. */
const UPRIGHT_COS = Math.cos((5 * Math.PI) / 180);
/** How far a merged floor's corner may lie outside the rooms' floors and still count as a copy. */
const MERGED_FLOOR_SNAP_M = 0.1;
/** Walls this close to a floor (or on it) take part in splitting it into rooms. */
const FLOOR_SPLIT_SNAP_M = 0.3;
/** Areas closed off by walls that are smaller than this are not rooms (gaps, wall cavities). */
const MIN_SPLIT_ROOM_AREA_M2 = 1;
/** ... nor are areas narrower than this on average (twice the area over the perimeter). */
const MIN_SPLIT_ROOM_WIDTH_M = 0.4;
/** Two rooms' lengths along a wall closer than this are a tie. */
const WALL_TIE_M = 0.05;
/** The rooms found by splitting must cover the floor to within this fraction of its area. */
const SPLIT_COVERAGE_TOLERANCE = 0.05;

/** RoomPlan section labels that map one-to-one onto ours. Anything else becomes `other`. */
const SECTION_LABELS: Readonly<Record<string, RoomLabel>> = {
  livingRoom: 'livingRoom',
  bedroom: 'bedroom',
  bathroom: 'bathroom',
  kitchen: 'kitchen',
  diningRoom: 'diningRoom',
};

const plan = (point: Vec3): Vec2 => [point[0], point[2]];

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length === 0 ? [0, 0, 0] : [v[0] / length, v[1] / length, v[2] / length];
}

/** Position and heading of an element in raw scan coordinates. */
function sourcePose(m: Mat4): { position: Vec3; yaw: number; tilted: boolean } {
  const xAxis = normalize(mat4Column(m, 0));
  const yAxis = normalize(mat4Column(m, 1));
  return {
    position: mat4Column(m, 3),
    yaw: yawFromDirection(xAxis[0], xAxis[2]),
    // An upright element keeps its local Y axis on world +Y.
    tilted: yAxis[1] < UPRIGHT_COS,
  };
}

/** A floor surface as a plan-view polygon in raw scan coordinates. */
function sourceFloorPolygon(floor: CaptureSurface): { polygon: Vec2[]; y: number } {
  let corners: Vec3[];
  if (floor.polygonCorners.length >= 3) {
    corners = floor.polygonCorners;
  } else {
    // A rectangle in the plane of the two largest local dimensions, whichever axes those are.
    const axes = [0, 1, 2].sort((a, b) => floor.dimensions[b]! - floor.dimensions[a]!);
    const u = axes[0]!;
    const v = axes[1]!;
    const signs: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    corners = signs.map(([su, sv]) => {
      const corner: Vec3 = [0, 0, 0];
      corner[u] = (su * floor.dimensions[u]!) / 2;
      corner[v] = (sv * floor.dimensions[v]!) / 2;
      return corner;
    });
  }
  const world = corners.map((corner) => transformPoint(floor.transform, corner));
  const y = world.reduce((sum, point) => sum + point[1], 0) / world.length;
  return { polygon: world.map(plan), y };
}

/**
 * Drops the merged copies of floors that the export also has per room.
 *
 * In a real `CapturedStructure` export (iOS, expo-roomplan 1.3.2), the walls, doors and objects
 * in the top-level arrays keep the identifiers they have in `rooms[]`, but each floor reappears
 * under a new identifier and local frame with the same outline. Keeping both would count every
 * room twice. The per-room floor wins, because it says which room it is. A merged floor is
 * dropped when all of its corners lie on the per-room floors of its story, which also covers a
 * merged floor that spans several rooms.
 */
function withoutMergedCopies<T extends { floor: CaptureSurface; polygon: Vec2[] }>(
  floors: readonly T[],
): T[] {
  const perRoom = floors.filter(({ floor }) => floor.roomIndex !== null);
  if (perRoom.length === 0) return [...floors];
  const onPerRoomFloor = (point: Vec2, story: number) =>
    perRoom.some(
      ({ floor, polygon }) =>
        floor.story === story &&
        (pointInPolygon(point, polygon) ||
          distanceToPolygonEdge(point, polygon) <= MERGED_FLOOR_SNAP_M),
    );
  return floors.filter(
    ({ floor, polygon }) =>
      floor.roomIndex !== null || !polygon.every((point) => onPerRoomFloor(point, floor.story)),
  );
}

/**
 * The heading that most wall length agrees with, modulo 90 degrees. Rotating the model by the
 * negative of this puts the dominant walls on the X and Z axes.
 */
function dominantYaw(segments: readonly { yaw: number; length: number }[]): number {
  let sin = 0;
  let cos = 0;
  for (const { yaw, length } of segments) {
    sin += length * Math.sin(4 * yaw);
    cos += length * Math.cos(4 * yaw);
  }
  return Math.hypot(sin, cos) < 1e-9 ? 0 : Math.atan2(sin, cos) / 4;
}

/** FNV-1a, 32 bits, as 8 hex digits: a short stable tag, not a security hash. */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

interface PlacedWall {
  id: string;
  story: number;
  transform: Transform;
  dimensions: { width: number; height: number; depth: number };
}

type FloorSplit =
  | { kind: 'whole' }
  | { kind: 'split'; parts: Vec2[][] }
  | { kind: 'uncovered'; parts: number; coverage: number };

/**
 * Divides one floor into the rooms its walls close off.
 *
 * A single RoomPlan session (the whole apartment walked through in one scan) exports one floor
 * for every room it passed through; its walls still separate the rooms. The floor is split
 * only when the closed-off areas cover it, so a scan with missing walls stays one room.
 */
function splitFloor(floor: readonly Vec2[], walls: readonly PlacedWall[]): FloorSplit {
  const nearFloor = (point: Vec2) =>
    pointInPolygon(point, floor) || distanceToPolygonEdge(point, floor) <= FLOOR_SPLIT_SNAP_M;
  const segments = walls
    .map((wall) => wallEndpoints(wall))
    .filter(([a, b]) => nearFloor(a) && nearFloor(b));
  const parts = enclosedFaces(segments).filter((face) => {
    const area = polygonArea(face);
    let perimeter = 0;
    for (const [a, b] of polygonEdges(face)) perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
    return (
      area >= MIN_SPLIT_ROOM_AREA_M2 &&
      (2 * area) / perimeter >= MIN_SPLIT_ROOM_WIDTH_M &&
      pointInPolygon(polygonCentroid(face), floor) &&
      face.every(nearFloor)
    );
  });
  if (parts.length === 0) return { kind: 'whole' };
  const floorArea = polygonArea(floor);
  const coverage = parts.reduce((sum, part) => sum + polygonArea(part), 0) / floorArea;
  if (Math.abs(coverage - 1) > SPLIT_COVERAGE_TOLERANCE) {
    return { kind: 'uncovered', parts: parts.length, coverage };
  }
  if (parts.length === 1) return { kind: 'whole' };
  return { kind: 'split', parts: parts.sort((a, b) => polygonArea(b) - polygonArea(a)) };
}

/**
 * Converts a parsed RoomPlan capture into RoomModel v1. Pure and deterministic: the same
 * capture always yields the same model.
 */
export function convertCapture(capture: RoomPlanCapture): ConversionResult {
  const warnings: ConversionWarning[] = [];
  const warn = (code: ConversionWarningCode, message: string, elementId?: string) =>
    warnings.push(elementId === undefined ? { code, message } : { code, message, elementId });

  // --- Canonical frame -----------------------------------------------------------------------
  // Rotate the dominant wall direction onto the X axis, put the lowest floor at y = 0, and
  // center the plan bounding box on the origin.
  const sourceFloors = withoutMergedCopies(
    capture.floors.map((floor) => ({ floor, ...sourceFloorPolygon(floor) })),
  );
  const wallPoses = capture.walls.map((wall) => ({ wall, pose: sourcePose(wall.transform) }));

  const segments =
    wallPoses.length > 0
      ? wallPoses.map(({ wall, pose }) => ({ yaw: pose.yaw, length: wall.dimensions[0] }))
      : sourceFloors.flatMap(({ polygon }) =>
          [...polygonEdges(polygon)].map(([a, b]) => ({
            yaw: yawFromDirection(b[0] - a[0], b[1] - a[1]),
            length: Math.hypot(b[0] - a[0], b[1] - a[1]),
          })),
        );
  const rotation = -dominantYaw(segments);
  const rotationOnly = mat4FromYawTranslation(rotation, [0, 0, 0]);

  const footprint: Vec2[] =
    sourceFloors.length > 0
      ? sourceFloors.flatMap(({ polygon, y }) =>
          polygon.map(([x, z]) => plan(transformPoint(rotationOnly, [x, y, z]))),
        )
      : wallPoses.map(({ pose }) => plan(transformPoint(rotationOnly, pose.position)));
  const bounds = boundsOf(footprint);
  const center: Vec2 = bounds
    ? [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2]
    : [0, 0];

  let floorY = 0;
  if (sourceFloors.length > 0) {
    floorY = Math.min(...sourceFloors.map(({ y }) => y));
  } else if (wallPoses.length > 0) {
    floorY = Math.min(
      ...wallPoses.map(({ wall, pose }) => pose.position[1] - wall.dimensions[1] / 2),
    );
  }

  const fromSource = mat4FromYawTranslation(rotation, [-center[0], -floorY, -center[1]]);

  const place = (m: Mat4): { transform: Transform; tilted: boolean } => {
    const pose = sourcePose(m);
    const [x, y, z] = transformPoint(fromSource, pose.position);
    return {
      transform: {
        position: [roundLength(x), roundLength(y), roundLength(z)],
        yaw: roundAngle(normalizeAngle(pose.yaw + rotation)),
      },
      tilted: pose.tilted,
    };
  };

  // --- Rooms: one per floor surface, or one per area its walls close off ---------------------
  const sections = capture.sections.map((section) => ({
    label: SECTION_LABELS[section.label] ?? 'other',
    story: section.story,
    point: plan(transformPoint(fromSource, section.center)),
  }));
  const labelOf = (outline: readonly Vec2[], story: number): RoomLabel =>
    sections.find(
      (candidate) =>
        candidate.story === story &&
        candidate.label !== 'other' &&
        pointInPolygon(candidate.point, outline),
    )?.label ?? 'other';

  const placedWalls: PlacedWall[] = capture.walls
    .filter((wall) => wall.dimensions[0] >= MIN_SIZE_M && wall.dimensions[1] >= MIN_SIZE_M)
    .map((wall) => ({
      id: wall.id,
      story: wall.story,
      transform: place(wall.transform).transform,
      dimensions: { width: wall.dimensions[0], height: wall.dimensions[1], depth: 0 },
    }));

  const rooms: Room[] = [];
  const roomIdsByIndex = new Map<number, string[]>();
  for (const { floor, polygon, y } of sourceFloors) {
    let points = polygon.map(([x, z]): Vec2 => {
      const moved = transformPoint(fromSource, [x, y, z]);
      return [roundLength(moved[0]), roundLength(moved[2])];
    });
    if (signedArea(points) < 0) points = points.reverse();
    if (polygonArea(points) < MIN_ROOM_AREA_M2) {
      warn('degenerate-element', 'Floor surface has no area and was dropped.', floor.id);
      continue;
    }
    const roomY = roundLength(y - floorY);
    const storyWalls = placedWalls.filter((wall) => wall.story === floor.story);
    const split = splitFloor(points, storyWalls);
    if (split.kind === 'uncovered') {
      warn(
        'rooms-not-split',
        `Walls close off ${split.parts} room(s) covering ${Math.round(split.coverage * 100)}% ` +
          'of the floor; the rest is open, so the floor was kept as one room.',
        floor.id,
      );
    }

    const outlines = split.kind === 'split' ? split.parts : [points];
    const ids = new Set<string>();
    for (const outline of outlines) {
      const rounded = outline.map(([x, z]): Vec2 => [roundLength(x), roundLength(z)]);
      // A split room is named after its floor and the walls around it, so converting the
      // same export again gives the same ids (room labels and photos refer to them).
      let id = floor.id;
      if (split.kind === 'split') {
        const wallIds = storyWalls
          .filter((wall) => wallAlongOutline(wall, rounded) > 0)
          .map((wall) => wall.id)
          .sort();
        id = `${floor.id}-${shortHash(wallIds.join(','))}`;
        for (let n = 2; ids.has(id); n++)
          id = `${floor.id}-${shortHash(`${wallIds.join(',')}#${n}`)}`;
      }
      ids.add(id);
      rooms.push({
        id,
        label: labelOf(rounded, floor.story),
        story: floor.story,
        floor: { polygon: rounded, y: roomY },
      });
    }
    if (floor.roomIndex !== null) {
      roomIdsByIndex.set(floor.roomIndex, [...(roomIdsByIndex.get(floor.roomIndex) ?? []), ...ids]);
    }
  }
  if (rooms.length === 0) {
    warn('no-floors', 'The scan has no usable floor surfaces, so it has no rooms or areas.');
  }

  // --- Room membership ------------------------------------------------------------------------
  // Prefer the per-room data from the export. Fall back to geometry.
  const candidateRooms = (roomIndex: number | null, story: number) => {
    const ids = roomIndex === null ? undefined : roomIdsByIndex.get(roomIndex);
    if (ids && ids.length > 0) {
      return { rooms: rooms.filter((room) => ids.includes(room.id)), fromExport: true };
    }
    return { rooms: rooms.filter((room) => room.story === story), fromExport: false };
  };

  const nearestRoom = (point: Vec2, candidates: readonly Room[]): string | null => {
    let best: { id: string; distance: number } | null = null;
    for (const room of candidates) {
      const distance = distanceToPolygonEdge(point, room.floor.polygon);
      if (distance <= ROOM_SNAP_M && (best === null || distance < best.distance)) {
        best = { id: room.id, distance };
      }
    }
    return best?.id ?? null;
  };

  /** Walls and apertures sit on a floor's outline. */
  const roomOfBoundary = (point: Vec2, roomIndex: number | null, story: number) => {
    const candidates = candidateRooms(roomIndex, story);
    if (candidates.fromExport && candidates.rooms.length === 1) return candidates.rooms[0]!.id;
    return nearestRoom(point, candidates.rooms);
  };

  /** A wall belongs to the room that most of it runs along (a wall between two rooms touches both). */
  const roomOfWall = (wall: PlacedWall | undefined, roomIndex: number | null) => {
    if (!wall) return null;
    const point = plan(wall.transform.position);
    const candidates = candidateRooms(roomIndex, wall.story);
    if (candidates.fromExport && candidates.rooms.length === 1) return candidates.rooms[0]!.id;
    // Most length along the outline wins; on a tie (two facing walls next to two rooms), the
    // outline the wall is closest to.
    let best: { id: string; along: number; distance: number } | null = null;
    for (const room of candidates.rooms) {
      const along = wallAlongOutline(wall, room.floor.polygon);
      if (along === 0) continue;
      const distance = distanceToPolygonEdge(point, room.floor.polygon);
      if (
        best === null ||
        along > best.along + WALL_TIE_M ||
        (along > best.along - WALL_TIE_M && distance < best.distance)
      ) {
        best = { id: room.id, along, distance };
      }
    }
    return best?.id ?? nearestRoom(point, candidates.rooms);
  };
  const placedWallsById = new Map(placedWalls.map((wall) => [wall.id, wall]));

  /** Objects sit inside a floor. */
  const roomOfInterior = (point: Vec2, roomIndex: number | null, story: number) => {
    const candidates = candidateRooms(roomIndex, story);
    if (candidates.fromExport && candidates.rooms.length === 1) return candidates.rooms[0]!.id;
    const containing = candidates.rooms.find((room) => pointInPolygon(point, room.floor.polygon));
    return containing?.id ?? nearestRoom(point, candidates.rooms);
  };

  // --- Walls ----------------------------------------------------------------------------------
  const walls: Wall[] = [];
  for (const wall of capture.walls) {
    const [width, height] = wall.dimensions;
    if (width < MIN_SIZE_M || height < MIN_SIZE_M) {
      warn('degenerate-element', 'Wall has no size and was dropped.', wall.id);
      continue;
    }
    const { transform, tilted } = place(wall.transform);
    if (tilted) warn('tilted-element', 'Wall is not vertical; it was flattened.', wall.id);
    if (wall.curved) {
      warn('curved-wall-flattened', 'Curved wall was converted to a straight wall.', wall.id);
    }
    walls.push({
      id: wall.id,
      roomId: roomOfWall(placedWallsById.get(wall.id), wall.roomIndex),
      transform,
      dimensions: { width: roundLength(width), height: roundLength(height), depth: 0 },
      confidence: wall.confidence,
    });
  }
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));

  for (const room of rooms) {
    const count = outlineWallCount(walls, room.floor.polygon);
    if (count < MIN_ROOM_WALLS) {
      warn(
        'incomplete-room',
        `Room has ${count} wall(s); the scan probably missed part of it, so its area is too small.`,
        room.id,
      );
    }
  }

  // --- Doors, windows, openings ---------------------------------------------------------------
  const convertApertures = (surfaces: readonly CaptureSurface[], isDoor: boolean): Aperture[] => {
    const apertures: Aperture[] = [];
    for (const surface of surfaces) {
      const [width, height] = surface.dimensions;
      if (width < MIN_SIZE_M || height < MIN_SIZE_M) {
        warn('degenerate-element', 'Aperture has no size and was dropped.', surface.id);
        continue;
      }
      const { transform, tilted } = place(surface.transform);
      if (tilted) warn('tilted-element', 'Aperture is not vertical; it was flattened.', surface.id);
      const dimensions = { width: roundLength(width), height: roundLength(height), depth: 0 };

      let host = surface.parentId === null ? undefined : wallsById.get(surface.parentId);
      if (!host) {
        // No usable parent in the export: attach to the closest wall the aperture lies on.
        let bestDistance = WALL_SNAP_M;
        for (const wall of walls) {
          const cutout = apertureCutout({ transform, dimensions }, wall);
          if (Math.abs(cutout.u) <= wall.dimensions.width / 2 && cutout.distance <= bestDistance) {
            host = wall;
            bestDistance = cutout.distance;
          }
        }
        if (!host) warn('orphan-aperture', 'Aperture is not on any wall.', surface.id);
      }

      apertures.push({
        id: surface.id,
        roomId: host
          ? host.roomId
          : roomOfBoundary(plan(transform.position), surface.roomIndex, surface.story),
        wallId: host?.id ?? null,
        transform,
        dimensions,
        confidence: surface.confidence,
        isOpen: isDoor ? surface.isOpen : undefined,
      });
    }
    return apertures;
  };
  const doors = convertApertures(capture.doors, true);
  const windows = convertApertures(capture.windows, false);
  const openings = convertApertures(capture.openings, false);

  // --- Objects --------------------------------------------------------------------------------
  const objects: RoomObject[] = [];
  for (const object of capture.objects) {
    const [width, height, depth] = object.dimensions;
    if (width < MIN_SIZE_M || height < MIN_SIZE_M) {
      warn('degenerate-element', 'Object has no size and was dropped.', object.id);
      continue;
    }
    const { transform, tilted } = place(object.transform);
    if (tilted) warn('tilted-element', 'Object is not upright; it was flattened.', object.id);
    const roomId = roomOfInterior(plan(transform.position), object.roomIndex, object.story);
    if (roomId === null && rooms.length > 0) {
      warn('unassigned-element', 'Object is not inside any room.', object.id);
    }
    const category: ObjectCategory = (OBJECT_CATEGORIES as readonly string[]).includes(
      object.category,
    )
      ? (object.category as ObjectCategory)
      : 'other';
    objects.push({
      id: object.id,
      roomId,
      category,
      transform,
      dimensions: {
        width: roundLength(width),
        height: roundLength(height),
        depth: roundLength(Math.max(depth, 0)),
      },
      confidence: object.confidence,
    });
  }

  // --- Assemble and validate ------------------------------------------------------------------
  const result = RoomModelV1Schema.safeParse({
    schemaVersion: 1,
    source: {
      kind: 'roomplan',
      converterVersion: CONVERTER_VERSION,
      formatVersion: capture.formatVersion,
    },
    frame: { fromSource: fromSource.map((value) => roundTo(value, 6)) },
    rooms,
    walls,
    doors,
    windows,
    openings,
    objects,
    hotspots: [],
  });
  if (!result.success) {
    throw new RoomPlanConversionError(
      `Conversion produced an invalid model:\n${z.prettifyError(result.error)}`,
    );
  }
  return { model: result.data, warnings };
}

/**
 * Converts the raw JSON exported by expo-roomplan into RoomModel v1.
 * Throws `RoomPlanParseError` when the input is not a RoomPlan export.
 */
export function convertRoomPlan(raw: unknown): ConversionResult {
  return convertCapture(parseRoomPlanCapture(raw));
}
