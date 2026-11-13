import { describe, expect, it } from 'vitest';
import { authErrorKey } from '../src/auth-errors';
import { formatMongolianPhone, normalizeMongolianPhone } from '../src/phone';

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
    [{ code: 'captcha_failed' }, 'captcha'],
    [{ name: 'AuthRetryableFetchError' }, 'network'],
    [{ name: 'TypeError', message: 'Network request failed' }, 'network'],
    [{ code: 'something_new' }, 'generic'],
    [null, 'generic'],
  ])('%j → %s', (error, key) => {
    expect(authErrorKey(error)).toBe(key);
  });
});
