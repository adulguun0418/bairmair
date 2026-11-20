import { StyleSheet, View } from 'react-native';
import { useColors } from '@bairmair/native-ui/theme';

/** A thin measured bar: `value` from 0 to 1, in sky blue unless `color` says otherwise. */
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const colors = useColors();
  const share = Math.min(1, Math.max(0, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
      style={[styles.track, { backgroundColor: colors.surface2 }]}
    >
      <View
        style={[styles.fill, { width: `${share * 100}%`, backgroundColor: color ?? colors.brand }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
