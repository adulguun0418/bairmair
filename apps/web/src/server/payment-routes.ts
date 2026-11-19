import type { ApiErrorKey } from '@bairmair/db';
import { reportServerError } from './error-reporting';
import type { PaymentOutcome } from './payments';
import { QPayError } from './qpay';

/** Shared by the payment route handlers: answers, logs and error handling. */

export function errorResponse(status: number, key: ApiErrorKey): Response {
  return Response.json({ error: key }, { status });
}

export function outcomeResponse(outcome: PaymentOutcome): Response {
  return outcome.ok
    ? Response.json(outcome.body, { status: outcome.status })
    : errorResponse(outcome.status, outcome.error);
}

export function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}

/** QPay down or refusing → 503 `payment_unavailable`; anything else → 500. Both reported. */
export async function failure(
  cause: unknown,
  context: { route: string; method: string; payment_id?: string },
): Promise<Response> {
  const qpay = cause instanceof QPayError;
  log('payment_error', {
    ...context,
    qpayStatus: qpay ? cause.status : undefined,
    message: cause instanceof Error ? cause.message : String(cause),
  });
  await reportServerError(cause, context);
  return qpay ? errorResponse(503, 'payment_unavailable') : errorResponse(500, 'server_error');
}
