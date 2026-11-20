import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * Shows a floor plan SVG from `renderFloorPlanSvg` (shared with the web app). A WebView renders
 * the SVG exactly as browsers do, with no extra native SVG library. JavaScript is off and the
 * page cannot navigate anywhere.
 */
export function FloorPlanView({ svg, height = 320 }: { svg: string; height?: number }) {
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<style>html,body{margin:0;height:100%;background:#fff}svg{display:block;width:100%;height:100%}</style>' +
    `</head><body>${svg}</body></html>`;
  return (
    <View style={[styles.frame, { height }]}>
      <WebView
        source={{ html }}
        originWhitelist={['about:*']}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('about:')}
        javaScriptEnabled={false}
        scrollEnabled={false}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#ffffff' },
  webview: { flex: 1, backgroundColor: '#ffffff' },
});
