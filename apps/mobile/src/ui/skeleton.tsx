import { useEffect } from 'react';
import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { radius, useColors } from './theme';

/**
 * A placeholder block that breathes softly while content loads (still under reduced motion).
 * Shapes come from `style`; the colour follows the theme.
 */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.set(withRepeat(withTiming(1, { duration: 850 }), -1, true));
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + pulse.get() * 0.45 }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.block, { backgroundColor: colors.surface2 }, style, animated]}
    />
  );
}

/** A line of text that has not arrived yet. */
export function SkeletonLine({ width, height = 14 }: { width: DimensionValue; height?: number }) {
  return <Skeleton style={{ width, height, borderRadius: height / 2 }} />;
}

/** The shape of a listing card (photo, price, facts) while search results load. */
export function CardSkeleton() {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Skeleton style={styles.media} />
      <View style={styles.lines}>
        <SkeletonLine width="45%" height={22} />
        <SkeletonLine width="75%" />
        <SkeletonLine width="60%" />
      </View>
    </View>
  );
}

/** A few card placeholders, the list's loading state. */
export function CardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, index) => (
        <CardSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { borderRadius: radius.sm },
  card: { borderRadius: radius.xl, padding: 8 },
  media: { aspectRatio: 4 / 3, width: '100%', borderRadius: radius.lg },
  lines: { gap: 10, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 10 },
  list: { gap: 16, padding: 16 },
});
