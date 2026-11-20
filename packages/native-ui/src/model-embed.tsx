import { isEmbedNavigation, parseEmbedMessage, type EmbedEvent } from '@bairmair/browse';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button } from './button';
import { useI18n } from './i18n';
import { Text } from './text';
import { useColors } from './theme';

type State = { kind: 'loading' } | { kind: EmbedEvent } | { kind: 'failed' };

/** Matches the embed page's background, so nothing flashes while it loads. */
const EMBED_BACKGROUND = '#f5f5f4';

/**
 * A 3D model full screen: one of the website's embed pages (`/embed/listings/<id>`,
 * `/embed/s/<slug>`) in a WebView, so the 3D view is the same one the website shows.
 *
 * The page reports `ready`, `missing` or `no-model` with `id`; a failed load offers a retry and,
 * with `webUrl`, the browser. Any navigation away from the embed page opens in the browser.
 */
export function ModelEmbed({
  embedUrl,
  id,
  webUrl,
  missingText,
}: {
  embedUrl: string;
  /** What the page sends as its id (listing id, or a shared scan's slug). */
  id: string;
  /** The same model's normal web page, offered when the embed fails. */
  webUrl?: string;
  /** Shown when the page reports `missing`. */
  missingText: string;
}) {
  const { t } = useI18n();
  const colors = useColors();
  const [state, setState] = useState<State>({ kind: 'loading' });
  /** Bumped to load the page again (retry, or iOS ended the WebView's process). */
  const [attempt, setAttempt] = useState(0);

  const reload = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  const message =
    state.kind === 'missing'
      ? missingText
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
          {state.kind !== 'missing' && webUrl && (
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
