import {
  captchaPath,
  isCaptchaMessageSource,
  isCaptchaNavigation,
  parseCaptchaMessage,
} from '@bairmair/browse';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { captureError } from '@/lib/error-tracking';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

export type CaptchaState =
  /** Waiting for Turnstile (at most `GIVE_UP_MS` while it stays invisible). */
  | { status: 'checking' }
  | { status: 'ready'; token: string }
  /** No token (an error, or no result in time): the screen says so; "Дахин шалгах" retries. */
  | { status: 'failed' };

/** How long the check may take before the screen stops waiting for it (not counting time
 * Cloudflare waits for a click). */
const GIVE_UP_MS = 20_000;
/** Turnstile's widget height, kept free while the page loads so nothing jumps. The widget is
 * always on screen: in an iOS WebView a hidden or tiny one never finished (error 300031). */
const WIDGET_HEIGHT = 72;

class CaptchaError extends Error {
  override name = 'CaptchaError';
}

/**
 * Cloudflare Turnstile for phone sign-in on Android: the website's `/embed/captcha` page in a
 * WebView (see `@bairmair/browse` `captcha.ts`), shown only after Supabase asked for a captcha
 * (`useSendCode`). iOS uses the system browser sheet instead (`captcha-browser.ts`).
 *
 * The widget is on screen ("Verifying…", then "Success!"; a checkbox when Cloudflare wants a
 * click) and the WebView follows its height. A token is single use: remount this component
 * (change its `key`) after each attempt to get a new one.
 *
 * After an error, or `GIVE_UP_MS` without a token, it reports `failed` and shows how far the
 * page got (for diagnosis), with "Дахин шалгах".
 */
export function CaptchaView({ onChange }: { onChange: (state: CaptchaState) => void }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const pageUrl = `${env.siteUrl}${captchaPath(locale)}`;
  const [status, setStatus] = useState<CaptchaState['status']>('checking');
  const [height, setHeight] = useState(0);
  /** Cloudflare is waiting for a click: no time limit meanwhile. */
  const [waitingForPerson, setWaitingForPerson] = useState(false);
  /** How far the page got, e.g. `load › hydrated › script › rendered`; shown when it fails. */
  const [trail, setTrail] = useState<string[]>([]);
  /** Bumped to load the page again (retry, or iOS ended the WebView's process). */
  const [attempt, setAttempt] = useState(0);

  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  });
  // A token from a page that is gone (unmounted, reloaded) must not linger in the screen.
  useEffect(() => () => callback.current({ status: 'checking' }), []);

  const trailRef = useRef<string[]>([]);
  const note = (step: string) => {
    trailRef.current = [...trailRef.current, step].slice(-8);
    setTrail(trailRef.current);
  };

  const fail = (reason: string) => {
    note(reason);
    setStatus('failed');
    callback.current({ status: 'failed' });
    captureError(new CaptchaError(`captcha ${reason}`), { trail: trailRef.current.join(' > ') });
  };

  // Give up on a check that never ends, unless Cloudflare is waiting for the person.
  useEffect(() => {
    if (status !== 'checking' || waitingForPerson) return;
    const timer = setTimeout(() => fail('gave-up'), GIVE_UP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `fail` only sets state
  }, [status, waitingForPerson, attempt]);

  const reload = () => {
    setStatus('checking');
    callback.current({ status: 'checking' });
    setHeight(0);
    setWaitingForPerson(false);
    trailRef.current = [];
    setTrail([]);
    setAttempt((n) => n + 1);
  };

  const shown = status !== 'failed';

  return (
    <View style={styles.box}>
      <View style={{ height: shown ? height || WIDGET_HEIGHT : 0 }}>
        <WebView
          key={attempt}
          source={{ uri: `${pageUrl}?theme=${scheme}` }}
          style={styles.webview}
          containerStyle={styles.webview}
          onLoadEnd={() => note('load')}
          onMessage={(event) => {
            // Only our site speaks (iOS reports the page's address, Android only its origin).
            if (!isCaptchaMessageSource(event.nativeEvent.url ?? '', pageUrl)) return;
            const message = parseCaptchaMessage(event.nativeEvent.data);
            if (!message) return;
            switch (message.type) {
              case 'token':
                setStatus('ready');
                callback.current({ status: 'ready', token: message.token });
                break;
              case 'expired':
                // Turnstile fetches a new token by itself.
                setStatus('checking');
                callback.current({ status: 'checking' });
                break;
              case 'error':
                fail(`error-${message.code ?? 'unknown'}`);
                break;
              case 'size':
                setHeight(message.height);
                break;
              case 'status':
                note(message.status);
                if (message.status === 'interactive') setWaitingForPerson(true);
                if (message.status === 'interacted') setWaitingForPerson(false);
                break;
            }
          }}
          onError={(event) => fail(`load-error-${event.nativeEvent.code}`)}
          onHttpError={(event) => fail(`http-${event.nativeEvent.statusCode}`)}
          onContentProcessDidTerminate={reload}
          onShouldStartLoadWithRequest={(request) => {
            if (isCaptchaNavigation(request.url, pageUrl, request.isTopFrame)) return true;
            // A link in the widget (Cloudflare's privacy or help page) goes to the browser.
            if (request.url.startsWith('https://')) void Linking.openURL(request.url);
            return false;
          }}
          // Cloudflare's React Native example for Turnstile.
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          allowsLinkPreview={false}
          webviewDebuggingEnabled={__DEV__}
        />
      </View>
      {status === 'checking' && height === 0 && (
        <Text style={[styles.note, { color: colors.textMuted }]}>{t('auth.captchaChecking')}</Text>
      )}
      {status === 'failed' && (
        <View style={styles.failed}>
          <Text style={[styles.note, { color: colors.textMuted }]}>{t('auth.captchaFailed')}</Text>
          {trail.length > 0 && (
            <Text style={[styles.trail, { color: colors.textMuted }]}>{trail.join(' › ')}</Text>
          )}
          <Button
            title={t('auth.captchaRetry')}
            variant="secondary"
            size="small"
            onPress={reload}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  webview: { flex: 1, backgroundColor: 'transparent' },
  note: { fontSize: 14, lineHeight: 20 },
  trail: { fontSize: 12, lineHeight: 16 },
  failed: { gap: 8, alignItems: 'flex-start' },
});
