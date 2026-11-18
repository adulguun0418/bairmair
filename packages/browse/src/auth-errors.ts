import type { Messages } from '@bairmair/i18n';

export type AuthErrorKey = keyof Messages['auth']['errors'];

/** The send-sms hook's message for a number over its limit (`supabase/functions/send-sms`). */
export const SMS_RATE_LIMITED = 'sms_rate_limited';

/**
 * Maps a supabase-js Auth error to a message key under `auth.errors`.
 * Auth sends a stable `code` (https://supabase.com/docs/guides/auth/debugging/error-codes);
 * network failures arrive as `AuthRetryableFetchError` without one.
 */
export function authErrorKey(error: unknown): AuthErrorKey {
  const { code, name, message } = (error ?? {}) as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
  };
  // Our send-sms hook refuses a number that has had too many codes; Auth passes the hook's
  // message on (the website's code route sends it as the code).
  if (message === SMS_RATE_LIMITED || code === SMS_RATE_LIMITED) return 'tooManyRequests';
  switch (code) {
    case 'otp_expired':
    case 'otp_disabled':
      return 'invalidCode';
    case 'over_sms_send_rate_limit':
    case 'over_request_rate_limit':
      return 'tooManyRequests';
    case 'sms_send_failed':
    case 'hook_timeout':
    case 'hook_timeout_after_retry':
      return 'smsFailed';
    case 'captcha_failed':
      return 'captcha';
    case 'phone_exists':
      return 'phoneTaken';
  }
  if (name === 'AuthRetryableFetchError' || name === 'TypeError') return 'network';
  return 'generic';
}
