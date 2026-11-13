import { describe, expect, it } from 'vitest';
import { authErrorKey } from '../src/auth/errors';
import { formatMongolianPhone, normalizeMongolianPhone } from '../src/auth/phone';
import { parseAuthRedirect } from '../src/auth/redirect';

describe('normalizeMongolianPhone', () => {
  it.each([
    ['99112233', '+97699112233'],
    ['9911 2233', '+97699112233'],
    ['9911-2233', '+97699112233'],
    ['+976 9911 2233', '+97699112233'],
    ['976 99112233', '+97699112233'],
    ['00976 99112233', '+97699112233'],
    ['00000001', '+97600000001'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeMongolianPhone(input)).toBe(expected);
  });

  it.each(['', '9911223', '991122334', '+7 9911 2233', '+1 202 555 0100', '9911a233', '+976'])(
    'rejects %j',
    (input) => {
      expect(normalizeMongolianPhone(input)).toBeNull();
    },
  );
});

describe('formatMongolianPhone', () => {
  it('groups the local digits', () => {
    expect(formatMongolianPhone('+97699112233')).toBe('+976 9911 2233');
    // auth.users stores phones without the plus.
    expect(formatMongolianPhone('97699112233')).toBe('+976 9911 2233');
  });

  it('leaves anything else alone', () => {
    expect(formatMongolianPhone('+12025550100')).toBe('+12025550100');
  });
});

describe('authErrorKey', () => {
  it.each([
    [{ code: 'otp_expired' }, 'invalidCode'],
    [{ code: 'over_sms_send_rate_limit' }, 'tooManyRequests'],
    [{ code: 'over_request_rate_limit' }, 'tooManyRequests'],
    [{ code: 'sms_send_failed' }, 'smsFailed'],
    [{ code: 'hook_timeout' }, 'smsFailed'],
    [{ code: 'phone_exists' }, 'phoneTaken'],
    [{ name: 'AuthRetryableFetchError' }, 'network'],
    [{ name: 'TypeError', message: 'Network request failed' }, 'network'],
    [{ code: 'something_new' }, 'generic'],
    [null, 'generic'],
  ])('%j → %s', (error, key) => {
    expect(authErrorKey(error)).toBe(key);
  });
});

describe('parseAuthRedirect', () => {
  it('reads tokens from the fragment', () => {
    expect(
      parseAuthRedirect(
        'bairmair://auth/callback#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'a.b.c', refreshToken: 'r1' });
  });

  it('reads errors from the query or the fragment', () => {
    expect(
      parseAuthRedirect(
        'bairmair://auth/callback?error=access_denied&error_code=provider_disabled&error_description=Unsupported+provider',
      ),
    ).toEqual({
      kind: 'error',
      code: 'provider_disabled',
      description: 'Unsupported provider',
    });
    expect(parseAuthRedirect('bairmair://auth/callback#error=server_error')).toEqual({
      kind: 'error',
      code: 'server_error',
      description: '',
    });
  });

  it('returns none when the URL carries neither', () => {
    expect(parseAuthRedirect('bairmair://auth/callback')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect('bairmair://auth/callback#access_token=only')).toEqual({
      kind: 'none',
    });
  });
});
