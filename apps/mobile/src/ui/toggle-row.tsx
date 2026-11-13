import { StyleSheet, Switch, Text, View } from 'react-native';
import { useColors } from './theme';

interface ToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}

export function ToggleRow({ label, hint, value, onValueChange }: ToggleRowProps) {
  const colors = useColors();
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.accent }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  text: { flex: 1, gap: 2 },
  label: { fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 18 },
});
