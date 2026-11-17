import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlueprintGrid } from './blueprint';
import { Icon, type IconName } from './icon';
import { Text } from './text';
import { PAPER, PAPER_GRID, radius } from './theme';

/** Ink on the plan paper, which stays light in dark mode (like floor plans). */
export const PAPER_INK = '#0e1733';
export const PAPER_INK_MUTED = '#525d78';
export const PAPER_BRAND = '#199ed6';

/**
 * A sheet of blueprint paper with an icon, a heading and a line of text: empty states and
 * invitations ("post your first listing", "scan in 3D"). Actions go in `children`.
 */
export function BlueprintPanel({
  icon,
  eyebrow,
  title,
  body,
  children,
  style,
}: {
  icon: IconName;
  eyebrow?: string;
  title: string;
  body?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.panel, style]}>
      <BlueprintGrid color={PAPER_GRID} />
      <View style={styles.badge}>
        <Icon name={icon} size={26} color={PAPER_BRAND} weight="semibold" />
      </View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.xl,
    backgroundColor: PAPER,
    overflow: 'hidden',
    padding: 22,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(25, 158, 214, 0.22)',
  },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    boxShadow: '0 4px 14px rgba(25, 158, 214, 0.18)',
  },
  eyebrow: {
    color: PAPER_BRAND,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  title: {
    color: PAPER_INK,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  body: { color: PAPER_INK_MUTED, fontSize: 15, lineHeight: 22 },
  actions: { gap: 10, marginTop: 10 },
});
