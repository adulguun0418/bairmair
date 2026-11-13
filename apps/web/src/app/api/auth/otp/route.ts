import type { Database } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/public-env';
import { requestCode, verifyTurnstile } from '@/server/request-code';

/**
 * POST /api/auth/otp  `{ phone, captchaToken }`
 *
 * Website sign-in: checks the Turnstile token, then has Supabase Auth text the code (through the
 * send-sms hook, like the app). Answers `{ sent: true, phone }` (the number in E.164) or `{ error: <Auth error code> }`;
 * the browser maps codes to messages with `authErrorKey`. See `src/server/request-code.ts`.
 */
export async function POST(request: Request) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    log('otp_error', { reason: 'TURNSTILE_SECRET_KEY is not set' });
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  // Vercel sets x-real-ip to the visitor's address.
  const ip = request.headers.get('x-real-ip');
  try {
    const result = await requestCode(
      {
        verifyCaptcha: (token, from) => verifyTurnstile(secret, token, from),
        async sendCode(phone) {
          const auth = createClient<Database>(
            publicEnv.supabaseUrl,
            publicEnv.supabasePublishableKey,
            { auth: { persistSession: false, autoRefreshToken: false } },
          ).auth;
          const { error } = await auth.signInWithOtp({ phone });
          return error
            ? { code: error.code ?? 'unexpected_failure', status: error.status ?? 500 }
            : null;
        },
      },
      body,
      ip,
    );
    if (!result.ok) {
      log('otp_refused', { error: result.error });
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ sent: true, phone: result.phone });
  } catch (cause) {
    log('otp_error', { message: cause instanceof Error ? cause.message : String(cause) });
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

function log(event: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...fields }));
}
