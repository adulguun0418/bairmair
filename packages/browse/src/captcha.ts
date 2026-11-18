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

/**
 * iOS: Turnstile never finishes inside a WKWebView (stuck on "Verifying…"), so the iPhone app
 * opens the captcha page in the system browser sheet instead (`?return=app`, through
 * ASWebAuthenticationSession), and the page hands the token back by navigating to this address.
 * The session catches the navigation and closes; the address never reaches another app.
 */
export const CAPTCHA_RETURN_URL = 'bairmair://captcha';

/** `?return=app`: the page was opened by the app in the system browser. */
export function isCaptchaReturnMode(value: string | null | undefined): boolean {
  return value === 'app';
}

/** Where the page sends a token in return mode. */
export function captchaReturnUrl(token: string): string {
  return `${CAPTCHA_RETURN_URL}#token=${encodeURIComponent(token)}`;
}

/** The token from the address the browser session ended on, or null. */
export function parseCaptchaReturn(url: string): string | null {
  if (!url.startsWith(`${CAPTCHA_RETURN_URL}#`) && !url.startsWith(`${CAPTCHA_RETURN_URL}?`)) {
    return null;
  }
  const token = new URLSearchParams(url.slice(CAPTCHA_RETURN_URL.length + 1)).get('token');
  return token && token.length <= 4096 ? token : null;
}

export type CaptchaEvent =
  /** A fresh token (single use, valid for 5 minutes). */
  | { type: 'token'; token: string }
  /** The last token expired; a new one follows by itself. */
  | { type: 'expired' }
  /** Turnstile failed (script blocked, network, challenge failed, browser unsupported), with
   * Turnstile's error code or our own reason when there is one. */
  | { type: 'error'; code?: string }
  /** The widget's height in CSS pixels: 0 while invisible, about 65 when it asks for a click. */
  | { type: 'size'; height: number }
  /** How far the page got (`hydrated`, `script`, `rendered`, `interactive`, ...), for diagnosing a
   * check that never finishes. */
  | { type: 'status'; status: string };

/** Error codes and statuses: short words, digits and dashes only. */
const SHORT_WORD = /^[a-z0-9-]{1,40}$/i;

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
  const { source, version, type, token, height, code, status } = value as Record<string, unknown>;
  if (source !== 'bairmair-captcha' || version !== 1) return null;
  switch (type) {
    case 'token':
      return typeof token === 'string' && token !== '' && token.length <= 4096
        ? { type, token }
        : null;
    case 'expired':
      return { type };
    case 'error':
      return typeof code === 'string' && SHORT_WORD.test(code) ? { type, code } : { type };
    case 'status':
      return typeof status === 'string' && SHORT_WORD.test(status) ? { type, status } : null;
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
