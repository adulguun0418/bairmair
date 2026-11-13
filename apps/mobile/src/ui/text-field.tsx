import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useColors } from './theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  /** Shown before the input, e.g. a fixed country code. */
  prefix?: ReactNode;
  error?: string | null;
}

export function TextField({ label, prefix, error, style, ...input }: TextFieldProps) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.box,
          { backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
        ]}
      >
        {typeof prefix === 'string' ? (
          <Text style={[styles.input, styles.prefix, { color: colors.textMuted }]}>{prefix}</Text>
        ) : (
          prefix
        )}
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.grow, { color: colors.text }, style]}
          {...input}
        />
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    gap: 8,
  },
  input: { fontSize: 17, paddingVertical: 12 },
  prefix: { fontWeight: '600' },
  grow: { flex: 1 },
  error: { fontSize: 14, lineHeight: 20 },
});
