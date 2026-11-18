'use client';

import {
  captchaMessage,
  captchaReturnUrl,
  isCaptchaReturnMode,
  parseCaptchaTheme,
  type CaptchaEvent,
} from '@bairmair/browse';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Turnstile } from '@/components/auth/Turnstile';

type ReactNativeWindow = Window & {
  ReactNativeWebView?: { postMessage(message: string): void };
};

/** The query string does not change while the page is open. */
const noSubscription = () => () => {};

function post(event: CaptchaEvent): void {
  (window as ReactNativeWindow).ReactNativeWebView?.postMessage(captchaMessage(event));
}

/** `?theme=` and `?return=`, read in the browser only (the page is static). */
function readQuery(): string {
  return window.location.search;
}

/**
 * Turnstile alone, for the app's sign-in screens (see `@bairmair/browse` `captcha.ts`), in two
 * modes:
 * - In the Android app's WebView: tokens, expiry, failures, steps and the widget's height go to
 *   the app through `postMessage`; the app reloads the page for a new token after each use.
 * - `?return=app`, in the iPhone app's system browser sheet: a page of its own; on success it
 *   navigates to `bairmair://captcha#token=…`, which closes the sheet and hands the token over.
 */
export function CaptchaEmbed({ siteKey, locale }: { siteKey: string; locale: Locale }) {
  const box = useRef<HTMLDivElement>(null);
  const query = useSyncExternalStore(noSubscription, readQuery, () => null);
  const params = query === null ? null : new URLSearchParams(query);
  const theme = params ? parseCaptchaTheme(params.get('theme')) : null;
  const returnMode = params ? isCaptchaReturnMode(params.get('return')) : false;

  // React is running: the app knows the page itself loaded. Whether the browser counts the page
  // as visible matters: Turnstile may not finish on a page it considers hidden.
  useEffect(() => {
    post({ type: 'status', status: 'hydrated' });
    const visibility = () => post({ type: 'status', status: `page-${document.visibilityState}` });
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);

  // The app sizes the WebView to the widget.
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

  if (theme && returnMode) {
    return <ReturnPage siteKey={siteKey} locale={locale} theme={theme} />;
  }

  return (
    <div ref={box}>
      {theme && (
        <Turnstile
          siteKey={siteKey}
          language={locale}
          theme={theme}
          // Always on screen: in an iOS WebView an invisible widget never finished (300031).
          appearance="always"
          resetKey={0}
          onToken={(token) => post(token ? { type: 'token', token } : { type: 'expired' })}
          onError={(code) => post(code ? { type: 'error', code } : { type: 'error' })}
          onStatus={(status) => post({ type: 'status', status })}
        />
      )}
    </div>
  );
}

/** The page the iPhone app opens in the system browser sheet. */
function ReturnPage({
  siteKey,
  locale,
  theme,
}: {
  siteKey: string;
  locale: Locale;
  theme: 'auto' | 'light' | 'dark';
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [state, setState] = useState<'checking' | 'returning' | 'failed'>('checking');

  return (
    <main className="fixed inset-0 overflow-auto bg-page px-6 py-12 text-fg">
      <div className="mx-auto flex max-w-sm flex-col gap-6">
        <h1 className="text-xl font-semibold">{t('auth.captchaPageTitle')}</h1>
        <Turnstile
          siteKey={siteKey}
          language={locale}
          theme={theme}
          appearance="always"
          resetKey={0}
          onToken={(token) => {
            if (!token) return;
            setState('returning');
            window.location.replace(captchaReturnUrl(token));
          }}
          onError={() => setState('failed')}
        />
        {state === 'returning' && <p className="text-fg-muted">{t('auth.captchaReturning')}</p>}
        {state === 'failed' && (
          <div className="space-y-3">
            <p className="text-danger">{t('auth.captchaPageFailed')}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full border border-line-2 px-4 py-2 font-medium"
            >
              {t('auth.captchaRetry')}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
