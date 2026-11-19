/**
 * The per-number limit on sign-in codes (migration `20261121100000_sms_limits.sql`): the hook
 * asks the database before texting. No Deno APIs here, so Vitest can run it.
 */

import { serviceCredentials } from '../_shared/service.ts';

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

/** The limiter from the Edge Function's environment (`serviceCredentials`), or null. */
export function smsLimiterFromEnv(
  env: (name: string) => string | undefined,
  fetchImpl: typeof fetch = fetch,
): SmsLimiter | null {
  const credentials = serviceCredentials(env);
  return credentials ? supabaseSmsLimiter(credentials.url, credentials.key, fetchImpl) : null;
}
