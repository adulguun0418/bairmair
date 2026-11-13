import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from './theme';

export interface Choice<T> {
  value: T;
  label: string;
}

interface ChoiceChipsProps<T> {
  label?: string;
  hint?: string;
  choices: readonly Choice<T>[];
  value: T | null;
  /** With `allowClear`, tapping the selected chip again clears the choice (null). */
  onChange: (value: T | null) => void;
  allowClear?: boolean;
}

/** A single choice from a few options, as wrapping chips. */
export function ChoiceChips<T extends string | number | boolean>({
  label,
  hint,
  choices,
  value,
  onChange,
  allowClear = true,
}: ChoiceChipsProps<T>) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      {label ? <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text> : null}
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <Pressable
              key={String(choice.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(selected && allowClear ? null : choice.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.accent : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: selected ? colors.onAccent : colors.text }]}>
                {choice.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  chipText: { fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 13, lineHeight: 18 },
});
