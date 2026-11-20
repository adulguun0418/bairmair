import { isShareSlug, userScanModelPath } from '@bairmair/db';
import {
  applyAnnotations,
  computeMetrics,
  parseEntranceDoorId,
  parseRoomDividers,
  parseRoomLabelOverrides,
  safeParseRoomModel,
  type ModelMetrics,
  type RoomModelV1,
} from '@bairmair/room-model';

/**
 * A bairmair scan behind its private link (`/s/<slug>`): the owner's processed scan with their
 * room names, dividers and front door applied. Nothing about the owner is part of it.
 *
 * `user_scans` is readable only by its owner, so the website reads it with the secret key; the
 * slug is the only key. Database and Storage are injected, so the rules below are unit-tested
 * (test/shared-scan.test.ts); `supabaseSharedScanSource` in `supabase.ts` is the real one.
 */

export interface SharedScanRow {
  id: string;
  owner_id: string;
  title: string | null;
  created_at: string;
  room_labels: unknown;
  room_dividers: unknown;
  entrance_door_id: string | null;
}

export interface SharedScanSource {
  /** The scan with this slug when its link is on and it is processed (`ready`), else null. */
  findBySlug(slug: string): Promise<SharedScanRow | null>;
  /** The parsed `model.json` at this path in `user-scan-models`, or null when it is missing. */
  readModel(path: string): Promise<unknown>;
}

export interface SharedScan {
  slug: string;
  /** The owner's title, if they gave one. */
  title: string | null;
  /** ISO 8601. */
  createdAt: string;
  model: RoomModelV1;
  metrics: ModelMetrics;
}

export async function loadSharedScan(
  source: SharedScanSource,
  slug: string,
): Promise<SharedScan | null> {
  if (!isShareSlug(slug)) return null;
  const row = await source.findBySlug(slug);
  if (!row) return null;

  const json = await source.readModel(userScanModelPath(row.owner_id, row.id));
  if (json === null || json === undefined) return null;
  const parsed = safeParseRoomModel(json);
  if (!parsed.success) {
    console.warn(`model of user scan ${row.id} does not parse`);
    return null;
  }

  const model = applyAnnotations(parsed.data, {
    dividers: parseRoomDividers(row.room_dividers),
    entranceDoorId: parseEntranceDoorId(row.entrance_door_id),
    roomLabels: parseRoomLabelOverrides(row.room_labels),
  });
  return {
    slug,
    title: row.title,
    createdAt: row.created_at,
    model,
    metrics: computeMetrics(model),
  };
}
