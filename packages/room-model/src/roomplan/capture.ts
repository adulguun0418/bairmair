import * as z from 'zod';
import type { Confidence, Mat4, Vec3 } from '../schema/primitives';

/**
 * Tolerant reader for the JSON that expo-roomplan exports.
 *
 * That file is Apple's own `Codable` encoding of `CapturedStructure` (multi-room, iOS 17+) or
 * `CapturedRoom`. Apple does not document the format. The shape below is confirmed against real
 * single-room exports (`test/fixtures/roomplan/`, findings in
 * `docs/proposal/00-expo-roomplan-findings.md`) and still read leniently, because the format can
 * change between iOS versions. The converter works on the neutral `RoomPlanCapture` produced here.
 */

export interface CaptureSurface {
  id: string;
  /** Column-major 4x4, raw scan coordinates. */
  transform: Mat4;
  /** Size along the surface's local X, Y and Z axes. */
  dimensions: Vec3;
  parentId: string | null;
  /** Corners in the surface's local coordinates. Empty for plain rectangles. */
  polygonCorners: Vec3[];
  story: number;
  confidence?: Confidence;
  /** Doors only. */
  isOpen?: boolean;
  curved: boolean;
  /** Index into the structure's `rooms`, when the export carries per-room data. */
  roomIndex: number | null;
}

export interface CaptureObject {
  id: string;
  category: string;
  transform: Mat4;
  dimensions: Vec3;
  story: number;
  confidence?: Confidence;
  roomIndex: number | null;
}

export interface CaptureSection {
  label: string;
  center: Vec3;
  story: number;
}

export interface RoomPlanCapture {
  /** Apple's own format version, when present. */
  formatVersion?: number;
  walls: CaptureSurface[];
  doors: CaptureSurface[];
  windows: CaptureSurface[];
  openings: CaptureSurface[];
  floors: CaptureSurface[];
  objects: CaptureObject[];
  sections: CaptureSection[];
}

export class RoomPlanParseError extends Error {
  override name = 'RoomPlanParseError';
}

// Swift enums with associated values encode as single-key objects, e.g. { "door": { "isOpen": true } }.
// Plain strings are accepted as well.
const KeyedEnum = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value): { key: string; payload: unknown } => {
    if (typeof value === 'string') return { key: value, payload: undefined };
    const key = Object.keys(value)[0];
    return key === undefined ? { key: '', payload: undefined } : { key, payload: value[key] };
  });

// Either 16 numbers, or 4 columns of 4 numbers.
const Matrix = z.union([
  z.array(z.number()).length(16),
  z
    .array(z.array(z.number()).length(4))
    .length(4)
    .transform((columns) => columns.flat()),
]);

// Three numbers; a fourth padding component is tolerated.
const Vector3 = z
  .array(z.number())
  .min(3)
  .max(4)
  .transform((v): Vec3 => [v[0]!, v[1]!, v[2]!]);

const RawSurface = z.object({
  identifier: z.string().min(1),
  transform: Matrix,
  dimensions: Vector3,
  category: KeyedEnum.optional(),
  confidence: KeyedEnum.optional(),
  parentIdentifier: z.string().nullish(),
  polygonCorners: z.array(Vector3).nullish(),
  // Real exports write `"curve": null` for straight walls. Optional anyway, because Swift's
  // synthesized Codable omits nil keys, and in zod 4 a bare `z.unknown()` key is required.
  curve: z.unknown().optional(),
  story: z.number().int().nullish(),
});
type RawSurface = z.infer<typeof RawSurface>;

const RawObject = z.object({
  identifier: z.string().min(1),
  transform: Matrix,
  dimensions: Vector3,
  category: KeyedEnum.optional(),
  confidence: KeyedEnum.optional(),
  story: z.number().int().nullish(),
});

const RawSection = z.object({
  label: KeyedEnum,
  center: Vector3,
  story: z.number().int().nullish(),
});

const roomShape = {
  version: z.number().nullish(),
  walls: z.array(RawSurface).nullish(),
  doors: z.array(RawSurface).nullish(),
  windows: z.array(RawSurface).nullish(),
  openings: z.array(RawSurface).nullish(),
  floors: z.array(RawSurface).nullish(),
  objects: z.array(RawObject).nullish(),
  sections: z.array(RawSection).nullish(),
};
const RawRoom = z.object(roomShape);
type RawRoom = z.infer<typeof RawRoom>;
const RawStructure = z.object({ ...roomShape, rooms: z.array(RawRoom).nullish() });

const SURFACE_KINDS = ['walls', 'doors', 'windows', 'openings', 'floors'] as const;

function toConfidence(key: string | undefined): Confidence | undefined {
  return key === 'low' || key === 'medium' || key === 'high' ? key : undefined;
}

function toSurface(raw: RawSurface, roomIndex: number | null): CaptureSurface {
  const payload = raw.category?.payload;
  const isOpen =
    typeof payload === 'object' && payload !== null && 'isOpen' in payload
      ? payload.isOpen === true
      : undefined;
  return {
    id: raw.identifier,
    transform: raw.transform,
    dimensions: raw.dimensions,
    parentId: raw.parentIdentifier ?? null,
    polygonCorners: raw.polygonCorners ?? [],
    story: raw.story ?? 0,
    confidence: toConfidence(raw.confidence?.key),
    isOpen,
    curved: raw.curve !== undefined && raw.curve !== null,
    roomIndex,
  };
}

/**
 * Reads a raw RoomPlan export into a neutral structure.
 * Accepts a `CapturedStructure` (with or without per-room data) or a single `CapturedRoom`.
 */
export function parseRoomPlanCapture(raw: unknown): RoomPlanCapture {
  const result = RawStructure.safeParse(raw);
  if (!result.success) {
    throw new RoomPlanParseError(`Not a RoomPlan export:\n${z.prettifyError(result.error)}`);
  }
  const structure = result.data;

  const capture: RoomPlanCapture = {
    walls: [],
    doors: [],
    windows: [],
    openings: [],
    floors: [],
    objects: [],
    sections: [],
  };
  const seenIds = new Set<string>();
  const seenSections = new Set<string>();

  const add = (room: RawRoom, roomIndex: number | null) => {
    for (const kind of SURFACE_KINDS) {
      for (const surface of room[kind] ?? []) {
        if (seenIds.has(surface.identifier)) continue;
        seenIds.add(surface.identifier);
        capture[kind].push(toSurface(surface, roomIndex));
      }
    }
    for (const object of room.objects ?? []) {
      if (seenIds.has(object.identifier)) continue;
      seenIds.add(object.identifier);
      capture.objects.push({
        id: object.identifier,
        category: object.category?.key ?? '',
        transform: object.transform,
        dimensions: object.dimensions,
        story: object.story ?? 0,
        confidence: toConfidence(object.confidence?.key),
        roomIndex,
      });
    }
    for (const section of room.sections ?? []) {
      const key = `${section.label.key}:${section.center.join(',')}`;
      if (seenSections.has(key)) continue;
      seenSections.add(key);
      capture.sections.push({
        label: section.label.key,
        center: section.center,
        story: section.story ?? 0,
      });
    }
  };

  // Per-room data first, because it tells us which room each element belongs to.
  // Then anything that only appears in the merged top-level arrays.
  const rooms = structure.rooms ?? [];
  rooms.forEach((room, index) => add(room, index));
  add(structure, null);

  const version = structure.version ?? rooms.find((room) => room.version != null)?.version;
  if (version != null && Number.isInteger(version)) capture.formatVersion = version;

  if (capture.walls.length === 0 && capture.floors.length === 0) {
    throw new RoomPlanParseError('Not a RoomPlan export: it contains no walls and no floors.');
  }
  return capture;
}
