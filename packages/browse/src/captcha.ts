import { localePath, type Locale } from '@bairmair/i18n';

/**
 * Cloudflare Turnstile for the mobile app. Supabase Auth asks for a captcha token before it texts
 * a sign-in code, and Turnstile only runs on a web page of an allowed hostname, so the app shows
 * the website's `/embed/captcha` page in a small WebView. The page posts the messages below
 * through `window.ReactNativeWebView.postMessage`; the app passes the token to `signInWithOtp`.
 */

/** Path of the captcha page, e.g. `/embed/captcha` or `/en/embed/captcha`. */
export function captchaPath(locale: Locale): string {
  return localePath(locale, '/embed/captcha');
}

export const CAPTCHA_THEMES = ['light', 'dark'] as const;
export type CaptchaTheme = (typeof CAPTCHA_THEMES)[number];

/** `?theme=` of the captcha page: the app's colour scheme, else Turnstile's own choice. */
export function parseCaptchaTheme(value: string | null | undefined): CaptchaTheme | 'auto' {
  return CAPTCHA_THEMES.includes(value as CaptchaTheme) ? (value as CaptchaTheme) : 'auto';
}

export type CaptchaEvent =
  /** A fresh token (single use, valid for 5 minutes). */
  | { type: 'token'; token: string }
  /** The last token expired; a new one follows by itself. */
  | { type: 'expired' }
  /** Turnstile failed (script blocked, network, challenge failed). The app reloads the page. */
  | { type: 'error' }
  /** The widget's height in CSS pixels: 0 while invisible, about 65 when it asks for a click. */
  | { type: 'size'; height: number };

interface Envelope {
  source: 'bairmair-captcha';
  version: 1;
}

/** The string the captcha page posts. */
export function captchaMessage(event: CaptchaEvent): string {
  const envelope: Envelope = { source: 'bairmair-captcha', version: 1 };
  return JSON.stringify({ ...envelope, ...event });
}

/** Reads a posted string; null for anything that is not a captcha message. */
export function parseCaptchaMessage(data: string): CaptchaEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { source, version, type, token, height } = value as Record<string, unknown>;
  if (source !== 'bairmair-captcha' || version !== 1) return null;
  switch (type) {
    case 'token':
      return typeof token === 'string' && token !== '' && token.length <= 4096
        ? { type, token }
        : null;
    case 'expired':
    case 'error':
      return { type };
    case 'size':
      return typeof height === 'number' && Number.isFinite(height)
        ? { type, height: Math.min(Math.max(Math.ceil(height), 0), 400) }
        : null;
    default:
      return null;
  }
}

/**
 * Whether the WebView may load `url`. The page itself (top frame, without query or fragment) is
 * the only top-level address; Turnstile's own frames (from challenges.cloudflare.com) load
 * inside it. Links Turnstile shows (privacy, help) would replace the page, so they are refused.
 */
export function isCaptchaNavigation(url: string, pageUrl: string, isTopFrame: boolean): boolean {
  if (!isTopFrame) return true;
  return url.split(/[?#]/, 1)[0] === pageUrl;
}
