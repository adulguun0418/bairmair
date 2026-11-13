import { normalizeMongolianPhone } from '@bairmair/browse';

/**
 * Web sign-in, step 1: text a 6-digit code to a Mongolian number, but only after Cloudflare
 * Turnstile says the visitor is not a bot. Supabase Auth itself has no captcha switched on (it
 * would apply to the app and the integration tests too), so the website asks through this
 * route instead of calling Auth directly. Step 2 (checking the code) happens in the browser.
 *
 * Limits of this check: Auth's own endpoint stays reachable with the public key, so a bot can
 * skip this route; the project's SMS cap per hour and WeSend's per-number limits bound that.
 */

export interface RequestCodeDeps {
  /** Asks Cloudflare whether the Turnstile token is valid for this visitor. */
  verifyCaptcha(token: string, ip: string | null): Promise<boolean>;
  /** Asks Supabase Auth to text the code. Resolves to Auth's error code, or null when sent. */
  sendCode(phone: string): Promise<{ code: string; status: number } | null>;
}

export type RequestCodeResult =
  { ok: true; phone: string } | { ok: false; status: number; error: string };

export async function requestCode(
  deps: RequestCodeDeps,
  body: unknown,
  ip: string | null,
): Promise<RequestCodeResult> {
  const { phone: rawPhone, captchaToken } = (body ?? {}) as Record<string, unknown>;
  const phone = typeof rawPhone === 'string' ? normalizeMongolianPhone(rawPhone) : null;
  if (!phone) return { ok: false, status: 400, error: 'invalid_phone' };
  if (typeof captchaToken !== 'string' || captchaToken === '' || captchaToken.length > 4096) {
    return { ok: false, status: 400, error: 'captcha_failed' };
  }
  if (!(await deps.verifyCaptcha(captchaToken, ip))) {
    return { ok: false, status: 400, error: 'captcha_failed' };
  }
  const failure = await deps.sendCode(phone);
  if (failure) return { ok: false, status: failure.status, error: failure.code };
  return { ok: true, phone };
}

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Cloudflare's server-side check of a Turnstile token (single use, valid for 5 minutes). */
export async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set('remoteip', ip);
  const response = await fetchImpl(SITEVERIFY, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return false;
  const result = (await response.json()) as { success?: unknown };
  return result.success === true;
}
