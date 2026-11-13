import { Pressable, StyleSheet, View } from 'react-native';
import type { Choice } from './choice-chips';
import { useColors } from './theme';
import { Text } from './text';

/** Several choices from a few options, as wrapping chips (none selected = no filter). */
export function MultiChips<T extends string | number>({
  label,
  choices,
  values,
  onChange,
}: {
  label?: string;
  choices: readonly Choice<T>[];
  values: readonly T[];
  onChange: (values: T[]) => void;
}) {
  const colors = useColors();
  const toggle = (value: T) =>
    onChange(
      values.includes(value)
        ? values.filter((item) => item !== value)
        : // Keep the order of `choices`.
          choices.map((choice) => choice.value).filter((v) => v === value || values.includes(v)),
    );
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <View style={styles.chips} accessibilityLabel={label}>
        {choices.map((choice) => {
          const selected = values.includes(choice.value);
          return (
            <Pressable
              key={String(choice.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              onPress={() => toggle(choice.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.75 : 1,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', letterSpacing: 0.1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontSize: 15, fontWeight: '500' },
});
