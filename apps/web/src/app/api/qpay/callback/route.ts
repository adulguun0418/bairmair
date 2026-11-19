import { paymentDeps } from '@/server/payment-env';
import { failure, log } from '@/server/payment-routes';
import { handleCallback } from '@/server/payments';

/**
 * QPay's payment callback: `{CALLBACK_PATH}?id=<payment id>&sig=<HMAC>`, the URL given when the
 * invoice was created. QPay does not document the method or body, so GET and POST both work and
 * the body is ignored: the callback only makes us ask QPay (`/v2/payment/check`), which decides.
 * A wrong signature or unknown payment gets 404.
 */
async function handle(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const id = params.get('id');
  try {
    const result = await handleCallback(paymentDeps(), id, params.get('sig'));
    log('payment_callback', { paymentId: id, ok: result.ok, status: result.status });
    return result.ok
      ? Response.json({ ok: true, status: result.status })
      : Response.json({ ok: false }, { status: 404 });
  } catch (cause) {
    return failure(cause, {
      route: '/api/qpay/callback',
      method: request.method,
      payment_id: id ?? undefined,
    });
  }
}

export const GET = handle;
export const POST = handle;
