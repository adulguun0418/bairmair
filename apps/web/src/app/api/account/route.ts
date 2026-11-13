import type { ApiErrorKey } from '@bairmair/db';
import { deleteAccount } from '@/server/delete-account';
import { adminClient, supabaseAccountStore, userIdFromRequest } from '@/server/supabase';

/**
 * DELETE /api/account
 *
 * The signed-in user deletes their own account (App Store and Google Play require this in the
 * app). The user comes from the Bearer access token, checked with Auth; there is no way to name
 * another user. See `src/server/delete-account.ts`.
 */
export async function DELETE(request: Request) {
  let userId: string | null = null;
  try {
    userId = await userIdFromRequest(request);
    if (!userId) return error(401, 'unauthorized');

    const result = await deleteAccount(supabaseAccountStore(adminClient()), userId);
    log('account_deleted', { userId, removedFiles: result.removedFiles });
    return Response.json(result);
  } catch (cause) {
    log('account_delete_error', {
      userId,
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
