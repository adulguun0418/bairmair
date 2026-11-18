'use client';

import { useEffect, useRef } from 'react';

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      /** Receives Turnstile's error code (e.g. 110200: hostname not allowed). */
      'error-callback': (code?: string) => void;
      /** The browser cannot run Turnstile. No other callback follows. */
      'unsupported-callback': () => void;
      /** An interactive challenge was not completed in time. */
      'timeout-callback': () => void;
      'before-interactive-callback': () => void;
      'after-interactive-callback': () => void;
      appearance: 'always' | 'execute' | 'interaction-only';
      size: 'normal' | 'flexible' | 'compact';
      language: string;
      theme: 'auto' | 'light' | 'dark';
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoad ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing'));
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error('turnstile script failed'));
    };
    document.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * Cloudflare Turnstile. Usually invisible ("interaction-only"): it shows a checkbox only when
 * Cloudflare is unsure. Reports a token (single use) or null when it expires or fails; bump
 * `resetKey` after each use to get a fresh token.
 */
export function Turnstile({
  siteKey,
  language,
  resetKey,
  onToken,
  theme = 'auto',
  onError,
  onStatus,
}: {
  siteKey: string;
  language: string;
  resetKey: number;
  onToken: (token: string | null) => void;
  theme?: 'auto' | 'light' | 'dark';
  /** Turnstile failed (script blocked, a failed challenge, unsupported browser), with its error
   * code or our reason (`script`, `unsupported`, `timeout`); `onToken(null)` follows too. */
  onError?: (code: string | undefined) => void;
  /** Progress, for diagnosis: `script`, `rendered`, `interactive`, `interacted`. */
  onStatus?: (status: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  const errorCallback = useRef(onError);
  const statusCallback = useRef(onStatus);
  useEffect(() => {
    callback.current = onToken;
    errorCallback.current = onError;
    statusCallback.current = onStatus;
  });

  useEffect(() => {
    let cancelled = false;
    const failed = (code?: string) => {
      callback.current(null);
      errorCallback.current?.(code);
    };
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        statusCallback.current?.('script');
        widget.current = api.render(container.current, {
          sitekey: siteKey,
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': (code) => failed(code ? String(code) : undefined),
          'unsupported-callback': () => failed('unsupported'),
          'timeout-callback': () => failed('timeout'),
          'before-interactive-callback': () => statusCallback.current?.('interactive'),
          'after-interactive-callback': () => statusCallback.current?.('interacted'),
          appearance: 'interaction-only',
          size: 'flexible',
          language,
          theme,
        });
        statusCallback.current?.('rendered');
      })
      .catch(() => failed('script'));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, language, theme]);

  useEffect(() => {
    if (resetKey > 0 && widget.current) {
      callback.current(null);
      window.turnstile?.reset(widget.current);
    }
  }, [resetKey]);

  return <div ref={container} />;
}
