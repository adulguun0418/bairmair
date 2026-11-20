import { appleIapDeps } from '@/server/apple-iap-env';
import { handleAppTransaction } from '@/server/apple-iap';
import { reportServerError } from '@/server/error-reporting';
import { errorResponse, log } from '@/server/payment-routes';
import { userIdFromRequest } from '@/server/supabase';

/**
 * POST /api/iap/apple/transactions `{ signedTransaction }` with the user's Bearer token: the
 * bairmair scan app hands over a StoreKit transaction after a purchase or restore. 200 → the
 * app finishes the transaction; 400 `iap_invalid` / 409 `iap_other_account` → nothing to retry;
 * 5xx → keep it and try again later.
 */
export async function POST(request: Request) {
  try {
    const userId = await userIdFromRequest(request);
    if (!userId) return errorResponse(401, 'unauthorized');
    const body: unknown = await request.json().catch(() => null);
    const outcome = await handleAppTransaction(appleIapDeps(), userId, body);
    return outcome.ok
      ? Response.json(outcome.body, { status: outcome.status })
      : errorResponse(outcome.status, outcome.error);
  } catch (cause) {
    log('iap_error', {
      route: '/api/iap/apple/transactions',
      message: cause instanceof Error ? cause.message : String(cause),
    });
    await reportServerError(cause, { route: '/api/iap/apple/transactions', method: 'POST' });
    return errorResponse(500, 'server_error');
  }
}
