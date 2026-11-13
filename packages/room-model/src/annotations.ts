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
  roomLabels?: Readonly<Record<string, RoomLabelOverride>>;
  photos?: readonly PhotoAssignment[];
}

/**
 * Layers user input from the database on top of a converted model.
 *
 * The stored model file is exactly `convert(raw)`, so it can be regenerated from the raw scan
 * at any time. Labels and photo assignments are not in the raw scan; they live in the database
 * and are applied here each time the model is served.
 *
 * Returns a new model. Photos assigned to a room that is not in the model are skipped.
 * Omitting `photos` keeps the model's existing hotspots; omitting `roomLabels` keeps its labels.
 */
export function applyAnnotations(model: RoomModelV1, annotations: Annotations): RoomModelV1 {
  const { roomLabels, photos } = annotations;

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

  return { ...model, rooms, hotspots };
}
