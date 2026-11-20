import { handleProcessScan } from '@/server/process-route';
import { supabaseUserScanStore } from '@/server/supabase';

/**
 * POST /api/user-scans/{id}/process
 *
 * Called by bairmair scan after it has uploaded a scan's raw JSON and USDZ. Converts the raw
 * export on the server and marks the scan ready; its private link then shows it. Same rules and
 * answers as the listing route (`src/server/process-scan.ts`).
 */
export async function POST(request: Request, ctx: RouteContext<'/api/user-scans/[id]/process'>) {
  const { id } = await ctx.params;
  return handleProcessScan(request, id, supabaseUserScanStore, '/api/user-scans/[id]/process');
}
