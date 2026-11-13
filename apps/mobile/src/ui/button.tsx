import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { radius, useColors } from './theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  /**
   * `primary`: navy, the one main action of a screen. `secondary`: a quiet filled button.
   * `outline`: a bordered one on busy backgrounds. `danger`: destructive actions.
   */
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  /** An icon before the title. */
  icon?: IconName;
  size?: 'regular' | 'small';
  disabled?: boolean;
  /** When the title alone does not say what the button does. */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  size = 'regular',
  disabled,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const colors = useColors();
  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'outline'
          ? 'transparent'
          : colors.surface2;
  const foreground =
    variant === 'primary' ? colors.onPrimary : variant === 'danger' ? '#ffffff' : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        size === 'small' && styles.small,
        variant === 'outline' && { borderWidth: 1, borderColor: colors.borderStrong },
        {
          backgroundColor: background,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {icon ? (
          <Icon
            name={icon}
            size={size === 'small' ? 15 : 17}
            color={foreground}
            weight="semibold"
          />
        ) : null}
        <Text
          numberOfLines={2}
          style={[styles.title, size === 'small' && styles.titleSmall, { color: foreground }]}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.pill,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { minHeight: 38, paddingHorizontal: 16, paddingVertical: 8 },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center', flexShrink: 1 },
  titleSmall: { fontSize: 14 },
});
