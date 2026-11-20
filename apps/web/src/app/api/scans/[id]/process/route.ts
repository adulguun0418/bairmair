import { handleProcessScan } from '@/server/process-route';
import { supabaseScanStore } from '@/server/supabase';

/**
 * POST /api/scans/{id}/process
 *
 * Called by the mobile app after it has uploaded a listing scan's raw JSON and USDZ. Converts the
 * raw export on the server and marks the scan ready. See `src/server/process-scan.ts`.
 */
export async function POST(request: Request, ctx: RouteContext<'/api/scans/[id]/process'>) {
  const { id } = await ctx.params;
  return handleProcessScan(request, id, supabaseScanStore, '/api/scans/[id]/process');
}
