import { CAPTCHA_RETURN_URL, captchaPath, parseCaptchaReturn } from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { env } from '@/lib/env';

/**
 * iOS gets its captcha token from the system browser: Turnstile stays on "Verifying…" inside a
 * WKWebView (tested on the iPhone with 0.1.21), but runs in Safari. Android keeps the inline
 * WebView (`CaptchaView`), where Turnstile passes.
 */
export const CAPTCHA_IN_BROWSER = Platform.OS === 'ios';

/**
 * Opens the website's captcha page (`?return=app`) in the system browser sheet
 * (ASWebAuthenticationSession). The page navigates to `bairmair://captcha#token=…` on success,
 * which closes the sheet. Resolves to the token, or null when the person closed the sheet.
 *
 * A private session: no cookies shared with Safari, and iOS skips its "wants to use … to sign
 * in" prompt for it.
 */
export async function captchaTokenFromBrowser(
  locale: Locale,
  scheme: 'light' | 'dark',
): Promise<string | null> {
  const url = `${env.siteUrl}${captchaPath(locale)}?return=app&theme=${scheme}`;
  const result = await WebBrowser.openAuthSessionAsync(url, CAPTCHA_RETURN_URL, {
    preferEphemeralSession: true,
  });
  if (result.type !== 'success') return null;
  const token = parseCaptchaReturn(result.url);
  if (!token) {
    // Mapped by `authErrorKey` to the "confirm you are not a robot" message.
    throw Object.assign(new Error('captcha: no token in the return address'), {
      code: 'captcha_failed',
    });
  }
  return token;
}
