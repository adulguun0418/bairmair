import type { Locale } from '@bairmair/i18n';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { env } from '@/lib/env';

/**
 * A listing's floor plan as an SVG image from the website (`/api/plan/listings/[id]`, cached by
 * the CDN): navy walls and white rooms on a transparent background. `thumb` leaves the room
 * labels out, for small insets.
 */
export function listingPlanUrl(
  listingId: string,
  locale: Locale,
  { thumb = false }: { thumb?: boolean } = {},
): string {
  const query = thumb ? '?thumb=1' : locale === 'mn' ? '' : `?lang=${locale}`;
  return `${env.apiUrl}/api/plan/listings/${encodeURIComponent(listingId)}${query}`;
}

/**
 * The labelled plan, drawn by a WebView so its text renders exactly as on the website (native
 * SVG decoders skip text). Touches pass through to whatever is underneath.
 */
export function LabelledPlan({ listingId, locale }: { listingId: string; locale: Locale }) {
  const [loading, setLoading] = useState(true);
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html,body{margin:0;height:100%;background:transparent}' +
    'img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body>' +
    `<img alt="" src="${listingPlanUrl(listingId, locale)}"></body></html>`;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <WebView
        source={{ html }}
        originWhitelist={['about:*']}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('about:')}
        javaScriptEnabled={false}
        scrollEnabled={false}
        onLoadEnd={() => setLoading(false)}
        style={styles.webview}
        containerStyle={styles.webview}
      />
      {loading && <ActivityIndicator style={StyleSheet.absoluteFill} />}
    </View>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: 'transparent' },
});
