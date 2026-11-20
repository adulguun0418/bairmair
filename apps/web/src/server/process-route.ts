import type { ApiErrorKey, TypedSupabaseClient } from '@bairmair/db';
import { reportServerError } from './error-reporting';
import { processScan, type ScanStore } from './process-scan';
import { adminClient, userIdFromRequest } from './supabase';

/**
 * The HTTP side of scan processing, shared by `POST /api/scans/{id}/process` (a listing's scan)
 * and `POST /api/user-scans/{id}/process` (a bairmair scan): Bearer token → user, the store's
 * scan converted (see `process-scan.ts`), JSON answer, logs and error reports.
 */
export async function handleProcessScan(
  request: Request,
  scanId: string,
  store: (client: TypedSupabaseClient) => ScanStore,
  route: string,
): Promise<Response> {
  try {
    const userId = await userIdFromRequest(request);
    if (!userId) return error(401, 'unauthorized');

    const outcome = await processScan(store(adminClient()), scanId, userId);
    if (!outcome.ok) {
      log('scan_process_rejected', { route, scanId, status: outcome.status, error: outcome.error });
      return error(outcome.status, outcome.error);
    }
    log('scan_processed', { route, scanId, totalAreaM2: outcome.body.totalAreaM2 });
    return Response.json(outcome.body);
  } catch (cause) {
    log('scan_process_error', {
      route,
      scanId,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    await reportServerError(cause, { route, method: 'POST', scan_id: scanId });
    return error(500, 'server_error');
  }
}

function error(status: number, key: ApiErrorKey): Response {
  return Response.json({ error: key }, { status });
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
