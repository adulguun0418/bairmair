/**
 * The per-number limit on sign-in codes (migration `20261121100000_sms_limits.sql`): the hook
 * asks the database before texting. No Deno APIs here, so Vitest can run it.
 */

export interface SmsLimiter {
  /** Records one code for `phone` (E.164) and resolves true, or false when over its limit.
   * Throws when the check itself fails. */
  claim(phone: string, signal: AbortSignal): Promise<boolean>;
}

/** Calls `public.claim_sms_send` through PostgREST with the project's secret key. */
export function supabaseSmsLimiter(
  supabaseUrl: string,
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): SmsLimiter {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/claim_sms_send`;
  return {
    async claim(phone, signal) {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { apikey: secretKey, 'content-type': 'application/json' },
        body: JSON.stringify({ p_phone: phone }),
        signal,
      });
      if (!response.ok) throw new Error(`claim_sms_send ${response.status}`);
      const result: unknown = await response.json();
      if (typeof result !== 'boolean') throw new Error('claim_sms_send: unexpected response');
      return result;
    },
  };
}

/**
 * The project's URL and secret key from the Edge Function's environment: `SUPABASE_URL` and the
 * default key in `SUPABASE_SECRET_KEYS` (JSON `{ "default": "sb_secret_..." }`, set by Supabase),
 * else the legacy `SUPABASE_SERVICE_ROLE_KEY`. Null when either is missing.
 */
export function serviceCredentials(
  env: (name: string) => string | undefined,
): { url: string; key: string } | null {
  const url = env('SUPABASE_URL');
  if (!url) return null;
  let key: string | undefined;
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default !== '') key = keys.default;
  } catch {
    // Malformed: fall back to the legacy key.
  }
  key ??= env('SUPABASE_SERVICE_ROLE_KEY') || undefined;
  return key ? { url, key } : null;
}

/** The limiter from the Edge Function's environment (`serviceCredentials`), or null. */
export function smsLimiterFromEnv(
  env: (name: string) => string | undefined,
  fetchImpl: typeof fetch = fetch,
): SmsLimiter | null {
  const credentials = serviceCredentials(env);
  return credentials ? supabaseSmsLimiter(credentials.url, credentials.key, fetchImpl) : null;
}
