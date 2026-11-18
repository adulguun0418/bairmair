import { captchaPath, isCaptchaNavigation, parseCaptchaMessage } from '@bairmair/browse';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, useColorScheme, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

type Status = 'checking' | 'ready' | 'failed';

/**
 * Cloudflare Turnstile for phone sign-in: the website's `/embed/captcha` page in a WebView (see
 * `@bairmair/browse` `captcha.ts`). Supabase Auth refuses to text a code without a token.
 *
 * Usually invisible: it reports a token within a second or two. When Cloudflare wants a click,
 * the page grows and the WebView follows its height. A token is single use: remount this
 * component (change its `key`) after each attempt to get a new one.
 */
export function CaptchaView({ onToken }: { onToken: (token: string | null) => void }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const pageUrl = `${env.siteUrl}${captchaPath(locale)}`;
  const [status, setStatus] = useState<Status>('checking');
  const [height, setHeight] = useState(0);
  /** Bumped to load the page again (retry, or iOS ended the WebView's process). */
  const [attempt, setAttempt] = useState(0);

  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });
  // A token from a page that is gone (unmounted, reloaded) must not linger in the screen.
  useEffect(() => () => callback.current(null), []);

  const reload = () => {
    callback.current(null);
    setStatus('checking');
    setHeight(0);
    setAttempt((n) => n + 1);
  };
  const fail = () => {
    callback.current(null);
    setStatus('failed');
  };

  return (
    <View style={styles.box}>
      <View style={{ height: status === 'failed' ? 0 : Math.max(height, 1) }}>
        <WebView
          key={attempt}
          source={{ uri: `${pageUrl}?theme=${scheme}` }}
          style={styles.webview}
          containerStyle={styles.webview}
          onMessage={(event) => {
            // Only the captcha page speaks; Turnstile's frames post nothing we read.
            if (!isCaptchaNavigation(event.nativeEvent.url, pageUrl, true)) return;
            const message = parseCaptchaMessage(event.nativeEvent.data);
            if (!message) return;
            switch (message.type) {
              case 'token':
                setStatus('ready');
                callback.current(message.token);
                break;
              case 'expired':
                // Turnstile fetches a new token by itself.
                setStatus('checking');
                callback.current(null);
                break;
              case 'error':
                fail();
                break;
              case 'size':
                setHeight(message.height);
                break;
            }
          }}
          onError={fail}
          onHttpError={fail}
          onContentProcessDidTerminate={reload}
          onShouldStartLoadWithRequest={(request) => {
            if (isCaptchaNavigation(request.url, pageUrl, request.isTopFrame)) return true;
            // A link in the widget (Cloudflare's privacy or help page) goes to the browser.
            if (request.url.startsWith('https://')) void Linking.openURL(request.url);
            return false;
          }}
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
          <Text style={[styles.note, { color: colors.danger }]}>{t('auth.captchaFailed')}</Text>
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
  failed: { gap: 8, alignItems: 'flex-start' },
});
