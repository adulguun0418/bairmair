import type { Messages } from '@bairmair/i18n';

export type AuthErrorKey = keyof Messages['auth']['errors'];

/**
 * Maps a supabase-js Auth error to a message key under `auth.errors`.
 * Auth sends a stable `code` (https://supabase.com/docs/guides/auth/debugging/error-codes);
 * network failures arrive as `AuthRetryableFetchError` without one.
 */
export function authErrorKey(error: unknown): AuthErrorKey {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
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
    case 'phone_exists':
      return 'phoneTaken';
  }
  if (name === 'AuthRetryableFetchError' || name === 'TypeError') return 'network';
  return 'generic';
}
