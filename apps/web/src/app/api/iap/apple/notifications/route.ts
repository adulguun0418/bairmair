import { appleIapDeps } from '@/server/apple-iap-env';
import { handleNotification } from '@/server/apple-iap';
import { reportServerError } from '@/server/error-reporting';
import { log } from '@/server/payment-routes';

/**
 * App Store Server Notifications v2 for bairmair scan (the URL is set in App Store Connect, for
 * both Production and Sandbox): `POST { signedPayload }`. Apple retries anything but 2xx, so
 * verified notifications always get 200 (also the ones we ignore), unverifiable ones 400, and
 * our own failures 500 (retried).
 */
export async function POST(request: Request) {
  try {
    const body: unknown = await request.json().catch(() => null);
    const outcome = await handleNotification(appleIapDeps(), body);
    return Response.json(outcome.status === 200 ? { ok: true } : { ok: false }, {
      status: outcome.status,
    });
  } catch (cause) {
    log('iap_error', {
      route: '/api/iap/apple/notifications',
      message: cause instanceof Error ? cause.message : String(cause),
    });
    await reportServerError(cause, { route: '/api/iap/apple/notifications', method: 'POST' });
    return Response.json({ ok: false }, { status: 500 });
  }
}
