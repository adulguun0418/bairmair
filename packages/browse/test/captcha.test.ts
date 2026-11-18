import { describe, expect, it } from 'vitest';
import {
  captchaMessage,
  captchaPath,
  isCaptchaNavigation,
  parseCaptchaMessage,
  parseCaptchaTheme,
} from '../src/captcha';

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
