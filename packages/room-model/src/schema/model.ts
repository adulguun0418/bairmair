import * as z from 'zod';
import { signedArea } from '../geometry/polygon';
import {
  ConfidenceSchema,
  DimensionsSchema,
  IdSchema,
  Mat4Schema,
  QuatSchema,
  TransformSchema,
  Vec2Schema,
  Vec3Schema,
} from './primitives';

/** Upper bounds. Model files are public, so consumers refuse anything larger. */
export const LIMITS = {
  rooms: 100,
  walls: 2000,
  apertures: 2000,
  objects: 5000,
  hotspots: 500,
  polygonPoints: 500,
  /** Maximum size of a serialized model file. */
  jsonBytes: 2_000_000,
} as const;

/** Smallest floor polygon accepted as a room, in square meters. */
export const MIN_ROOM_AREA_M2 = 0.01;

/** The first five are RoomPlan's own labels; the rest cover local apartment layouts. */
export const ROOM_LABELS = [
  'livingRoom',
  'bedroom',
  'kitchen',
  'bathroom',
  'diningRoom',
  'toilet',
  'hallway',
  'balcony',
  'storage',
  'other',
] as const;
export type RoomLabel = (typeof ROOM_LABELS)[number];
/** Tolerant: a label this version does not know is read as `'other'`. */
export const RoomLabelSchema = z.enum(ROOM_LABELS).catch('other');

export const OBJECT_CATEGORIES = [
  'storage',
  'refrigerator',
  'stove',
  'bed',
  'sink',
  'washerDryer',
  'toilet',
  'bathtub',
  'oven',
  'dishwasher',
  'table',
  'sofa',
  'chair',
  'fireplace',
  'television',
  'stairs',
  'other',
] as const;
export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];
/** Tolerant: a category this version does not know is read as `'other'`. */
export const ObjectCategorySchema = z.enum(OBJECT_CATEGORIES).catch('other');

const PolygonSchema = z.array(Vec2Schema).min(3).max(LIMITS.polygonPoints);

export const RoomSchema = z.object({
  id: IdSchema,
  label: RoomLabelSchema,
  /** Free text shown instead of the label. */
  name: z.string().min(1).max(80).optional(),
  /** 0 is the lowest scanned story. */
  story: z.number().int().min(-10).max(100),
  /** Simple polygon in plan view, not closed (the last point connects back to the first). */
  floor: z.object({ polygon: PolygonSchema, y: z.number() }),
});
export type Room = z.infer<typeof RoomSchema>;

const elementBase = {
  id: IdSchema,
  roomId: IdSchema.nullable(),
  transform: TransformSchema,
  dimensions: DimensionsSchema,
  confidence: ConfidenceSchema.optional(),
};

export const WallSchema = z.object({
  ...elementBase,
  /** Non-rectangular wall face in wall-local `[u, v]` meters from the wall center. */
  outline: PolygonSchema.optional(),
});
export type Wall = z.infer<typeof WallSchema>;

/** A door, a window, or a doorless opening. */
export const ApertureSchema = z.object({
  ...elementBase,
  /** The wall this aperture cuts through. */
  wallId: IdSchema.nullable(),
  /** Doors only. */
  isOpen: z.boolean().optional(),
});
export type Aperture = z.infer<typeof ApertureSchema>;

export const RoomObjectSchema = z.object({
  ...elementBase,
  category: ObjectCategorySchema,
});
export type RoomObject = z.infer<typeof RoomObjectSchema>;

/** Reserved for pose-pinned photos. Model coordinates. */
export const CameraPoseSchema = z.object({
  position: Vec3Schema,
  rotation: QuatSchema,
});
export type CameraPose = z.infer<typeof CameraPoseSchema>;

export const HotspotSchema = z.object({
  /** `listing_photos.id` */
  photoId: IdSchema,
  roomId: IdSchema,
  cameraPose: CameraPoseSchema.optional(),
});
export type Hotspot = z.infer<typeof HotspotSchema>;

export const SourceSchema = z.object({
  /** `roomplan`: converted from an Apple RoomPlan export. `manual`: authored by hand. */
  kind: z.enum(['roomplan', 'manual']),
  /** Version of the converter (or authoring tool) that produced this file. */
  converterVersion: z.string().min(1).max(32),
  /** Apple's own format version from the raw export, when present. */
  formatVersion: z.number().int().optional(),
});

export const RoomModelV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    source: SourceSchema,
    /** `fromSource` maps raw scan coordinates into this model's coordinates. */
    frame: z.object({ fromSource: Mat4Schema }),
    rooms: z.array(RoomSchema).max(LIMITS.rooms),
    walls: z.array(WallSchema).max(LIMITS.walls),
    doors: z.array(ApertureSchema).max(LIMITS.apertures),
    windows: z.array(ApertureSchema).max(LIMITS.apertures),
    openings: z.array(ApertureSchema).max(LIMITS.apertures),
    objects: z.array(RoomObjectSchema).max(LIMITS.objects),
    hotspots: z.array(HotspotSchema).max(LIMITS.hotspots),
  })
  .superRefine((model, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: 'custom', message, path });

    const roomIds = new Set(model.rooms.map((room) => room.id));
    const wallIds = new Set(model.walls.map((wall) => wall.id));

    // Every element id is unique across the whole model.
    const seen = new Set<string>();
    const groups = ['rooms', 'walls', 'doors', 'windows', 'openings', 'objects'] as const;
    for (const group of groups) {
      model[group].forEach((element, index) => {
        if (seen.has(element.id)) issue(`Duplicate id "${element.id}"`, [group, index, 'id']);
        seen.add(element.id);
      });
    }

    model.rooms.forEach((room, index) => {
      if (Math.abs(signedArea(room.floor.polygon)) < MIN_ROOM_AREA_M2) {
        issue('Floor polygon has no area', ['rooms', index, 'floor', 'polygon']);
      }
    });

    for (const group of ['walls', 'doors', 'windows', 'openings', 'objects'] as const) {
      model[group].forEach((element, index) => {
        if (element.roomId !== null && !roomIds.has(element.roomId)) {
          issue(`Unknown roomId "${element.roomId}"`, [group, index, 'roomId']);
        }
      });
    }

    for (const group of ['doors', 'windows', 'openings'] as const) {
      model[group].forEach((aperture, index) => {
        if (aperture.wallId !== null && !wallIds.has(aperture.wallId)) {
          issue(`Unknown wallId "${aperture.wallId}"`, [group, index, 'wallId']);
        }
      });
    }

    const photoIds = new Set<string>();
    model.hotspots.forEach((hotspot, index) => {
      if (!roomIds.has(hotspot.roomId)) {
        issue(`Unknown roomId "${hotspot.roomId}"`, ['hotspots', index, 'roomId']);
      }
      if (photoIds.has(hotspot.photoId)) {
        issue(`Photo "${hotspot.photoId}" has more than one hotspot`, [
          'hotspots',
          index,
          'photoId',
        ]);
      }
      photoIds.add(hotspot.photoId);
    });
  });

export type RoomModelV1 = z.infer<typeof RoomModelV1Schema>;

/** Validates untrusted input. Throws a `ZodError` when it is not a valid RoomModel v1. */
export function parseRoomModel(input: unknown): RoomModelV1 {
  return RoomModelV1Schema.parse(input);
}

/** Validates untrusted input without throwing. */
export function safeParseRoomModel(input: unknown) {
  return RoomModelV1Schema.safeParse(input);
}
