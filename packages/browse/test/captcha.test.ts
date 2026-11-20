import { describe, expect, it } from 'vitest';
import {
  captchaMessage,
  captchaPath,
  captchaReturnTarget,
  captchaReturnUrl,
  CAPTCHA_RETURN_URLS,
  isCaptchaMessageSource,
  isCaptchaNavigation,
  isCaptchaReturnMode,
  parseCaptchaMessage,
  parseCaptchaReturn,
  parseCaptchaTheme,
} from '../src/captcha';

describe('captcha in the system browser (iOS)', () => {
  it('round-trips a token through the return address', () => {
    const token = '0.abc+/=_-XYZ';
    expect(captchaReturnUrl(token).startsWith('bairmair://captcha#token=')).toBe(true);
    expect(parseCaptchaReturn(captchaReturnUrl(token))).toBe(token);
  });

  it('refuses other addresses and empty tokens', () => {
    expect(parseCaptchaReturn('bairmair://auth/callback#token=x')).toBeNull();
    expect(parseCaptchaReturn('https://example.com/#token=x')).toBeNull();
    expect(parseCaptchaReturn('bairmair://captcha#token=')).toBeNull();
    expect(parseCaptchaReturn('bairmair://captcha')).toBeNull();
  });

  it('knows return mode', () => {
    expect(isCaptchaReturnMode('app')).toBe(true);
    expect(isCaptchaReturnMode('scan')).toBe(true);
    expect(isCaptchaReturnMode(null)).toBe(false);
    expect(isCaptchaReturnMode('https://evil.example')).toBe(false);
  });

  it('returns to the app that asked, and to no other address', () => {
    expect(captchaReturnTarget('scan')).toBe('scan');
    expect(captchaReturnTarget('bairmairscan://captcha')).toBeNull();
    const token = 'tok-1';
    const url = captchaReturnUrl(token, 'scan');
    expect(url).toBe('bairmairscan://captcha#token=tok-1');
    expect(parseCaptchaReturn(url, CAPTCHA_RETURN_URLS.scan)).toBe(token);
    // Each app reads only its own address.
    expect(parseCaptchaReturn(url)).toBeNull();
    expect(parseCaptchaReturn(captchaReturnUrl(token), CAPTCHA_RETURN_URLS.scan)).toBeNull();
  });
});

describe('captcha page', () => {
  it('has a path per language', () => {
    expect(captchaPath('mn')).toBe('/embed/captcha');
    expect(captchaPath('en')).toBe('/en/embed/captcha');
  });

  it('reads the theme', () => {
    expect(parseCaptchaTheme('dark')).toBe('dark');
    expect(parseCaptchaTheme('light')).toBe('light');
    expect(parseCaptchaTheme('purple')).toBe('auto');
    expect(parseCaptchaTheme(null)).toBe('auto');
  });
});

describe('captcha messages', () => {
  it('round-trips every event', () => {
    for (const event of [
      { type: 'token', token: 'abc.def' },
      { type: 'expired' },
      { type: 'error' },
      { type: 'size', height: 65 },
      { type: 'error', code: '600010' },
      { type: 'status', status: 'rendered' },
    ] as const) {
      expect(parseCaptchaMessage(captchaMessage(event))).toEqual(event);
    }
  });

  it('rounds and bounds the height', () => {
    expect(parseCaptchaMessage(captchaMessage({ type: 'size', height: 64.2 }))).toEqual({
      type: 'size',
      height: 65,
    });
    expect(parseCaptchaMessage(captchaMessage({ type: 'size', height: -3 }))).toEqual({
      type: 'size',
      height: 0,
    });
    expect(parseCaptchaMessage(captchaMessage({ type: 'size', height: 1e6 }))).toEqual({
      type: 'size',
      height: 400,
    });
  });

  it('drops odd codes and statuses', () => {
    const raw = (fields: object) =>
      JSON.stringify({ source: 'bairmair-captcha', version: 1, ...fields });
    expect(parseCaptchaMessage(raw({ type: 'error', code: '<script>' }))).toEqual({
      type: 'error',
    });
    expect(parseCaptchaMessage(raw({ type: 'status', status: 'a b' }))).toBeNull();
    expect(parseCaptchaMessage(raw({ type: 'status', status: 'x'.repeat(41) }))).toBeNull();
  });

  it('ignores anything else', () => {
    expect(parseCaptchaMessage('not json')).toBeNull();
    expect(parseCaptchaMessage('null')).toBeNull();
    expect(parseCaptchaMessage(JSON.stringify({ type: 'token', token: 'x' }))).toBeNull();
    expect(
      parseCaptchaMessage(JSON.stringify({ source: 'bairmair-embed', version: 1, type: 'error' })),
    ).toBeNull();
    expect(
      parseCaptchaMessage(
        JSON.stringify({ source: 'bairmair-captcha', version: 1, type: 'token', token: '' }),
      ),
    ).toBeNull();
    expect(
      parseCaptchaMessage(
        JSON.stringify({ source: 'bairmair-captcha', version: 1, type: 'ready' }),
      ),
    ).toBeNull();
  });
});

describe('isCaptchaNavigation', () => {
  const page = 'https://bairmair.vercel.app/embed/captcha';
  it('allows the page and frames inside it', () => {
    expect(isCaptchaNavigation(`${page}?theme=dark`, page, true)).toBe(true);
    expect(isCaptchaNavigation('https://challenges.cloudflare.com/cdn-cgi/x', page, false)).toBe(
      true,
    );
  });
  it('refuses other top-level pages', () => {
    expect(isCaptchaNavigation('https://www.cloudflare.com/privacypolicy/', page, true)).toBe(
      false,
    );
    expect(isCaptchaNavigation('https://bairmair.vercel.app/', page, true)).toBe(false);
  });
});

describe('isCaptchaMessageSource', () => {
  const page = 'https://bairmair.vercel.app/embed/captcha';
  it('accepts the page (iOS: full address) and its origin (Android)', () => {
    expect(isCaptchaMessageSource(`${page}?theme=dark`, page)).toBe(true);
    expect(isCaptchaMessageSource('https://bairmair.vercel.app', page)).toBe(true);
    expect(isCaptchaMessageSource('https://BAIRMAIR.vercel.app/', page)).toBe(true);
  });
  it('refuses other sites', () => {
    expect(isCaptchaMessageSource('https://challenges.cloudflare.com', page)).toBe(false);
    expect(isCaptchaMessageSource('https://bairmair.vercel.app.evil.example', page)).toBe(false);
    expect(isCaptchaMessageSource('http://bairmair.vercel.app', page)).toBe(false);
    expect(isCaptchaMessageSource('', page)).toBe(false);
  });
});
