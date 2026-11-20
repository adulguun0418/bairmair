import type { ApiErrorKey, ProcessScanResponse, ScanRawPaths } from '@bairmair/db';
import {
  computeMetrics,
  convertRoomPlan,
  RoomPlanConversionError,
  RoomPlanParseError,
  type ConversionWarningCode,
  type ModelMetrics,
} from '@bairmair/room-model';

/**
 * Trusted scan processing: re-converts the raw RoomPlan export uploaded by its owner and marks
 * the scan ready. Only this code (with the secret key) writes `status`, the model file and
 * `metrics`. Two kinds of scan go through it: a listing's (`room_scans`; the database then sets
 * `has_3d` and `area_scanned_m2` on the listing) and a bairmair scan user's (`user_scans`).
 *
 * Storage and database access are injected, so the decisions here are unit-tested without a
 * network (test/process-scan.test.ts); `supabaseScanStore` and `supabaseUserScanStore` in
 * `supabase.ts` are the real implementations.
 */

export interface ScanRecord {
  id: string;
  ownerId: string;
  /** Where the raw export must be, rebuilt by the store from the row's ids (never a stored path,
   * so an owner cannot point their scan at someone else's files). */
  raw: ScanRawPaths;
  /** Where the converted model goes. */
  modelPath: string;
}

export interface ReadyFields {
  modelPath: string;
  schemaVersion: number;
  converterVersion: string;
  metrics: StoredMetrics;
}

/** What goes into `room_scans.metrics`. `totalAreaM2` is read by the database trigger. */
export interface StoredMetrics extends ModelMetrics {
  warnings: Partial<Record<ConversionWarningCode, number>>;
}

export interface ScanStore {
  findScan(scanId: string): Promise<ScanRecord | null>;
  /** Whether an object exists in the store's raw bucket. */
  rawExists(path: string): Promise<boolean>;
  /** The object's text from the raw bucket. Throws if it cannot be read. */
  readRaw(path: string): Promise<string>;
  /** Writes (or overwrites) `model.json` in the store's model bucket. */
  writeModel(path: string, json: string): Promise<void>;
  markReady(scanId: string, fields: ReadyFields): Promise<void>;
  markFailed(scanId: string, reason: string): Promise<void>;
}

export type ProcessOutcome =
  { ok: true; body: ProcessScanResponse } | { ok: false; status: number; error: ApiErrorKey };

/** Raw exports are 40–90 KB per room; anything this large is not a RoomPlan export. */
export const MAX_RAW_JSON_CHARS = 20 * 1024 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function fail(status: number, error: ApiErrorKey): ProcessOutcome {
  return { ok: false, status, error };
}

/**
 * Processes one scan for the signed-in user `userId`.
 *
 * The raw file paths come from the store, built from the row's ids rather than read from it, so
 * an owner cannot point their scan at someone else's files.
 *
 * Retrying is safe: a missing upload leaves the scan untouched (409), and processing a scan
 * again overwrites the same model file with the same result.
 */
export async function processScan(
  store: ScanStore,
  scanId: string,
  userId: string,
): Promise<ProcessOutcome> {
  if (!UUID_RE.test(scanId)) return fail(404, 'scan_not_found');

  const scan = await store.findScan(scanId);
  // Someone else's scan looks exactly like a missing one.
  if (!scan || scan.ownerId !== userId) return fail(404, 'scan_not_found');

  const { raw } = scan;
  const [hasJson, hasUsdz] = await Promise.all([
    store.rawExists(raw.json),
    store.rawExists(raw.usdz),
  ]);
  if (!hasJson || !hasUsdz) return fail(409, 'scan_files_missing');

  const text = await store.readRaw(raw.json);

  let reason: string | null = null;
  let converted: ReturnType<typeof convertRoomPlan> | null = null;
  if (text.length > MAX_RAW_JSON_CHARS) {
    reason = `Raw JSON is too large (${text.length} characters).`;
  } else {
    try {
      converted = convertRoomPlan(JSON.parse(text));
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        error instanceof RoomPlanParseError ||
        error instanceof RoomPlanConversionError
      ) {
        reason = `${error.name}: ${error.message}`;
      } else {
        throw error;
      }
    }
  }

  if (!converted) {
    await store.markFailed(scan.id, (reason ?? 'Unknown conversion error').slice(0, 2000));
    return fail(422, 'scan_conversion_failed');
  }

  const { model, warnings } = converted;
  const counts: Partial<Record<ConversionWarningCode, number>> = {};
  for (const warning of warnings) counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  const metrics: StoredMetrics = { ...computeMetrics(model), warnings: counts };

  const { modelPath } = scan;
  await store.writeModel(modelPath, JSON.stringify(model));
  await store.markReady(scan.id, {
    modelPath,
    schemaVersion: model.schemaVersion,
    converterVersion: model.source.converterVersion,
    metrics,
  });

  return {
    ok: true,
    body: {
      scanId: scan.id,
      status: 'ready',
      modelPath,
      schemaVersion: model.schemaVersion,
      converterVersion: model.source.converterVersion,
      totalAreaM2: metrics.totalAreaM2,
      warnings: counts,
    },
  };
}
