import { paymentDeps } from '@/server/payment-env';
import { errorResponse, failure, log, outcomeResponse } from '@/server/payment-routes';
import { createPayment } from '@/server/payments';
import { userIdFromRequest } from '@/server/supabase';

/**
 * POST /api/payments  `{ "product": "test", "subjectId"?: uuid }`
 *
 * Creates a QPay invoice for the signed-in user (Bearer access token) and answers with the
 * payment, including the QR code and bank-app links (201), or the same open invoice when asked
 * again within 15 minutes (200). See `src/server/payments.ts`.
 */
export async function POST(request: Request) {
  try {
    const userId = await userIdFromRequest(request);
    if (!userId) return errorResponse(401, 'unauthorized');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(400, 'payment_invalid');
    }

    const outcome = await createPayment(paymentDeps(), userId, body);
    if (outcome.ok) {
      log('payment_created', {
        paymentId: outcome.body.id,
        product: outcome.body.product,
        reused: outcome.status === 200,
      });
    } else {
      log('payment_rejected', { userId, error: outcome.error });
    }
    return outcomeResponse(outcome);
  } catch (cause) {
    return failure(cause, { route: '/api/payments', method: 'POST' });
  }
}
