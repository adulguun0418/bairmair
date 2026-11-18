'use client';

import { captchaMessage, parseCaptchaTheme, type CaptchaEvent } from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Turnstile } from '@/components/auth/Turnstile';

type ReactNativeWindow = Window & {
  ReactNativeWebView?: { postMessage(message: string): void };
};

/** The query string does not change while the page is open. */
const noSubscription = () => () => {};

function post(event: CaptchaEvent): void {
  (window as ReactNativeWindow).ReactNativeWebView?.postMessage(captchaMessage(event));
}

/**
 * Turnstile alone, for the app's sign-in screens (see `@bairmair/browse` `captcha.ts`). Tokens,
 * expiry, failures and the widget's height go to the app; the app reloads the page for a new
 * token after each use.
 */
export function CaptchaEmbed({ siteKey, locale }: { siteKey: string; locale: Locale }) {
  const box = useRef<HTMLDivElement>(null);
  // The app's colour scheme, from `?theme=`. Null on the server (the page is static), so the
  // widget renders only in the browser.
  const theme = useSyncExternalStore(
    noSubscription,
    () => parseCaptchaTheme(new URLSearchParams(window.location.search).get('theme')),
    () => null,
  );

  // React is running: the app knows the page itself loaded.
  useEffect(() => post({ type: 'status', status: 'hydrated' }), []);

  // Turnstile shows a checkbox only when it is unsure; the app sizes the WebView to it.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    let last = -1;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height !== last) post({ type: 'size', height: (last = height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box}>
      {theme && (
        <Turnstile
          siteKey={siteKey}
          language={locale}
          theme={theme}
          resetKey={0}
          onToken={(token) => post(token ? { type: 'token', token } : { type: 'expired' })}
          onError={(code) => post(code ? { type: 'error', code } : { type: 'error' })}
          onStatus={(status) => post({ type: 'status', status })}
        />
      )}
    </div>
  );
}
