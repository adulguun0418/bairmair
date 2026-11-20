import { BUCKETS, userScanModelPath, type Tables, type TypedSupabaseClient } from '@bairmair/db';
import {
  applyAnnotations,
  parseEntranceDoorId,
  parseRoomDividers,
  parseRoomLabelOverrides,
  safeParseRoomModel,
  type RoomModelV1,
} from '@bairmair/room-model';

type ScanForModel = Pick<
  Tables<'user_scans'>,
  'id' | 'owner_id' | 'room_labels' | 'room_dividers' | 'entrance_door_id'
>;

/**
 * A scan's processed model with the owner's room names, dividers and front door, or null when
 * it cannot be had. Never throws: the scan screen works without its plan.
 *
 * Read through a short-lived signed URL and `fetch`, not `storage.download()`: download returns
 * a Blob, and React Native's Blob has no `text()`, so reading it failed on every phone.
 * The client is a parameter so the integration test runs this exact code.
 */
export async function loadScanModel(
  client: TypedSupabaseClient,
  scan: ScanForModel,
  fetcher: typeof fetch = fetch,
): Promise<RoomModelV1 | null> {
  try {
    const { data, error } = await client.storage
      .from(BUCKETS.userScanModels)
      .createSignedUrl(userScanModelPath(scan.owner_id, scan.id), 60);
    if (error) return null;
    const response = await fetcher(data.signedUrl);
    if (!response.ok) return null;
    const parsed = safeParseRoomModel(await response.json());
    if (!parsed.success) return null;
    return applyAnnotations(parsed.data, {
      dividers: parseRoomDividers(scan.room_dividers),
      entranceDoorId: parseEntranceDoorId(scan.entrance_door_id),
      roomLabels: parseRoomLabelOverrides(scan.room_labels),
    });
  } catch {
    return null;
  }
}
