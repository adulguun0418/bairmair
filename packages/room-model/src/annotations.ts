import { applyRoomDividers, type RoomDivider } from './dividers';
import { ROOM_LABELS, type Hotspot, type RoomLabel, type RoomModelV1 } from './schema/model';

/** A user's correction to one room. Stored in `room_scans.room_labels`, keyed by room id. */
export interface RoomLabelOverride {
  label?: RoomLabel;
  /** A string sets a custom name; `null` or an empty string removes it. */
  name?: string | null;
}

const LABELS: ReadonlySet<string> = new Set(ROOM_LABELS);

/**
 * Reads `room_scans.room_labels`, JSON written by phones, keeping only well-formed entries: a
 * known label and a non-blank name. Anything else in an entry is dropped.
 */
export function parseRoomLabelOverrides(value: unknown): Record<string, RoomLabelOverride> {
  const labels: Record<string, RoomLabelOverride> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return labels;
  for (const [roomId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const { label, name } = entry as { label?: unknown; name?: unknown };
    const override: RoomLabelOverride = {};
    if (typeof label === 'string' && LABELS.has(label)) override.label = label as RoomLabel;
    if (typeof name === 'string' && name.trim() !== '') override.name = name;
    labels[roomId] = override;
  }
  return labels;
}

/** A photo and the room the user assigned it to (`listing_photos.id` and `.room_id`). */
export interface PhotoAssignment {
  id: string;
  roomId: string | null;
}

export interface Annotations {
  /** Seller lines splitting rooms (`room_scans.room_dividers`), applied before labels. */
  dividers?: readonly RoomDivider[];
  roomLabels?: Readonly<Record<string, RoomLabelOverride>>;
  photos?: readonly PhotoAssignment[];
  /**
   * The seller's front door (`room_scans.entrance_door_id`). Ignored when the model has no such
   * door; `null` or omitted keeps the model as it is (viewers then guess the entrance).
   */
  entranceDoorId?: string | null;
}

/** Reads `room_scans.entrance_door_id`: a door id, or null for anything else. */
export function parseEntranceDoorId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= 64 ? value : null;
}

/**
 * Layers user input from the database on top of a converted model.
 *
 * The stored model file is exactly `convert(raw)`, so it can be regenerated from the raw scan
 * at any time. Labels and photo assignments are not in the raw scan; they live in the database
 * and are applied here each time the model is served.
 *
 * Dividers go first: they split rooms, and labels and photos then refer to the result (a
 * split room keeps its id on its larger part). Returns a new model. Photos assigned to a room that is not in the model are skipped.
 * Omitting `photos` keeps the model's existing hotspots; omitting `roomLabels` keeps its labels.
 */
export function applyAnnotations(converted: RoomModelV1, annotations: Annotations): RoomModelV1 {
  const { roomLabels, photos, dividers, entranceDoorId } = annotations;
  const model =
    dividers && dividers.length > 0 ? applyRoomDividers(converted, dividers).model : converted;

  const rooms = model.rooms.map((room) => {
    const override = roomLabels?.[room.id];
    if (!override) return room;

    const { name: currentName, ...rest } = room;
    const label = override.label ?? room.label;
    const name = override.name === undefined ? currentName : override.name?.trim() || undefined;
    return name === undefined ? { ...rest, label } : { ...rest, label, name };
  });

  let hotspots = model.hotspots;
  if (photos) {
    const roomIds = new Set(model.rooms.map((room) => room.id));
    const seen = new Set<string>();
    hotspots = [];
    for (const photo of photos) {
      if (photo.roomId === null || !roomIds.has(photo.roomId) || seen.has(photo.id)) continue;
      seen.add(photo.id);
      const hotspot: Hotspot = { photoId: photo.id, roomId: photo.roomId };
      hotspots.push(hotspot);
    }
  }

  // Door ids are RoomPlan's own, so a choice survives re-conversion and dividers.
  const entrance =
    entranceDoorId && model.doors.some((door) => door.id === entranceDoorId)
      ? { entranceDoorId }
      : {};
  return { ...model, rooms, hotspots, ...entrance };
}

/**
 * One label change for a room: the label, and/or a name (kept as typed; an empty name or
 * `null` removes it). Returns the same object when nothing changes.
 */
export function withRoomLabel(
  labels: Readonly<Record<string, RoomLabelOverride>>,
  roomId: string,
  change: RoomLabelOverride,
): Record<string, RoomLabelOverride> {
  const current = labels[roomId] ?? {};
  const next: RoomLabelOverride = { ...current, ...change };
  if (next.name === null || next.name === '') delete next.name;
  if (next.label === current.label && next.name === current.name) {
    return labels as Record<string, RoomLabelOverride>;
  }
  return { ...labels, [roomId]: next };
}
