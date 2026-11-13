import {
  isEmbedNavigation,
  listingEmbedPath,
  parseEmbedMessage,
  type EmbedEvent,
} from '@bairmair/browse';
import { localePath } from '@bairmair/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

type State = { kind: 'loading' } | { kind: EmbedEvent } | { kind: 'failed' };

/** Matches the embed page's background, so nothing flashes while it loads. */
const EMBED_BACKGROUND = '#f5f5f4';

/**
 * A listing's 3D model, full screen: the web's embed page (`/embed/listings/[id]`) in a WebView,
 * so the 3D view is the same one the website shows. Full screen rather than inside the listing
 * page, so dragging the model never fights the page's scrolling.
 *
 * The page reports `ready`, `missing` or `no-model`; a failed load offers a retry and the
 * browser. Any navigation away from the embed page opens in the browser instead.
 */
export default function ListingModelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const colors = useColors();
  const embedUrl = `${env.siteUrl}${listingEmbedPath(locale, id)}`;
  const webUrl = `${env.siteUrl}${localePath(locale, `/listings/${id}`)}`;
  const [state, setState] = useState<State>({ kind: 'loading' });
  /** Bumped to load the page again (retry, or iOS ended the WebView's process). */
  const [attempt, setAttempt] = useState(0);

  const reload = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const message =
    state.kind === 'missing'
      ? t('browse.notFound')
      : state.kind === 'no-model'
        ? t('viewer.noModel')
        : state.kind === 'failed'
          ? t('browse.model3dFailed')
          : null;

  return (
    <View style={[styles.screen, { backgroundColor: EMBED_BACKGROUND }]}>
      <WebView
        key={attempt}
        source={{ uri: embedUrl }}
        style={styles.webview}
        onMessage={(event) => {
          const parsed = parseEmbedMessage(event.nativeEvent.data);
          if (parsed?.listingId === id) setState({ kind: parsed.event });
        }}
        onError={() => setState({ kind: 'failed' })}
        onHttpError={() => setState({ kind: 'failed' })}
        // A WebGL page can be ended by iOS under memory pressure; it would stay blank.
        onContentProcessDidTerminate={reload}
        onShouldStartLoadWithRequest={(request) => {
          if (!request.isTopFrame || isEmbedNavigation(request.url, embedUrl)) return true;
          void Linking.openURL(request.url);
          return false;
        }}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        setSupportMultipleWindows={false}
        webviewDebuggingEnabled={__DEV__}
      />
      {state.kind === 'loading' && (
        <View style={[styles.overlay, { backgroundColor: EMBED_BACKGROUND }]}>
          <ActivityIndicator />
        </View>
      )}
      {message && (
        <View style={[styles.overlay, styles.message, { backgroundColor: colors.background }]}>
          <Text style={[styles.body, { color: colors.text }]}>{message}</Text>
          {state.kind === 'failed' && <Button title={t('browse.retry')} onPress={reload} />}
          {state.kind !== 'missing' && (
            <Button
              title={t('browse.openOnWeb')}
              variant="secondary"
              onPress={() => void Linking.openURL(webUrl)}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  webview: { flex: 1, backgroundColor: EMBED_BACKGROUND },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  message: { gap: 12, padding: 24 },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
