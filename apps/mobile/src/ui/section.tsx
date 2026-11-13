import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useColors } from './theme';
import { Text } from './text';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { gap: 14 },
});
