import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { radius, useColors } from './theme';

export interface Segment<T> {
  value: T;
  label: string;
  icon?: IconName;
}

/** One choice out of two to four, as a track with the selected segment raised on it. */
export function Segmented<T extends string>({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.surface2 }]}
    >
      {segments.map((segment) => {
        const selected = segment.value === value;
        const color = selected ? colors.text : colors.textMuted;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && {
                backgroundColor: colors.surface,
                boxShadow: `0 1px 4px ${colors.shadow}`,
              },
              { opacity: pressed && !selected ? 0.6 : 1 },
            ]}
          >
            {segment.icon && <Icon name={segment.icon} size={15} color={color} />}
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.pill, padding: 3 },
  segment: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  label: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
});
