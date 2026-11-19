import { paymentDeps } from '@/server/payment-env';
import { errorResponse, failure, log, outcomeResponse } from '@/server/payment-routes';
import { cancelPayment, getPayment } from '@/server/payments';
import { userIdFromRequest } from '@/server/supabase';

/**
 * GET /api/payments/{id}[?check=1]: the signed-in user's payment. With `check=1` a pending
 * payment is first checked with QPay (at most every few seconds), so a waiting page can poll.
 *
 * DELETE /api/payments/{id}: cancels a pending payment (its QPay invoice). A payment paid
 * meanwhile comes back as paid; other states come back unchanged.
 */
export async function GET(request: Request, ctx: RouteContext<'/api/payments/[id]'>) {
  const { id } = await ctx.params;
  try {
    const userId = await userIdFromRequest(request);
    if (!userId) return errorResponse(401, 'unauthorized');

    const check = new URL(request.url).searchParams.get('check') === '1';
    const outcome = await getPayment(paymentDeps(), userId, id, { check });
    return outcomeResponse(outcome);
  } catch (cause) {
    return failure(cause, { route: '/api/payments/[id]', method: 'GET', payment_id: id });
  }
}

export async function DELETE(request: Request, ctx: RouteContext<'/api/payments/[id]'>) {
  const { id } = await ctx.params;
  try {
    const userId = await userIdFromRequest(request);
    if (!userId) return errorResponse(401, 'unauthorized');

    const outcome = await cancelPayment(paymentDeps(), userId, id);
    if (outcome.ok) log('payment_cancel', { paymentId: id, status: outcome.body.status });
    return outcomeResponse(outcome);
  } catch (cause) {
    return failure(cause, { route: '/api/payments/[id]', method: 'DELETE', payment_id: id });
  }
}
