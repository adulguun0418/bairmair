import type { ApiErrorKey } from '@bairmair/db';
import { processScan } from '@/server/process-scan';
import { adminClient, supabaseScanStore, userIdFromRequest } from '@/server/supabase';

/**
 * POST /api/scans/{id}/process
 *
 * Called by the mobile app after it has uploaded a scan's raw JSON and USDZ. Converts the raw
 * export on the server and marks the scan ready. See `src/server/process-scan.ts`.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/scans/[id]/process'>) {
  const { id } = await ctx.params;
  try {
    const userId = await userIdFromRequest(request);
    if (!userId) return error(401, 'unauthorized');

    const outcome = await processScan(supabaseScanStore(adminClient()), id, userId);
    if (!outcome.ok) {
      log('scan_process_rejected', { scanId: id, status: outcome.status, error: outcome.error });
      return error(outcome.status, outcome.error);
    }
    log('scan_processed', { scanId: id, totalAreaM2: outcome.body.totalAreaM2 });
    return Response.json(outcome.body);
  } catch (cause) {
    log('scan_process_error', {
      scanId: id,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return error(500, 'server_error');
  }
}

function error(status: number, key: ApiErrorKey): Response {
  return Response.json({ error: key }, { status });
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
