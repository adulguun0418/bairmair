import type { ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useI18n } from '@bairmair/native-ui/i18n';
import { Icon } from '@bairmair/native-ui/icon';
import { Text } from '@bairmair/native-ui/text';
import { radius, useColors } from '@bairmair/native-ui/theme';
import type { EditorStep, StepState } from './editor-steps';

/** A step's number in a circle: outlined while to do, green with a tick when done, amber "!" to fix. */
export function StepMarker({
  number,
  state,
  size = 30,
}: {
  number: number;
  state: StepState;
  size?: number;
}) {
  const colors = useColors();
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (state === 'done') {
    return (
      <View style={[styles.marker, box, { backgroundColor: colors.success }]}>
        <Icon name="done" size={size * 0.5} color="#ffffff" weight="bold" />
      </View>
    );
  }
  if (state === 'error') {
    return (
      <View style={[styles.marker, box, { backgroundColor: colors.warning }]}>
        <Text style={[styles.markerText, { fontSize: size * 0.5, color: '#ffffff' }]}>!</Text>
      </View>
    );
  }
  return (
    <View style={[styles.marker, box, { borderWidth: 1.5, borderColor: colors.borderStrong }]}>
      <Text style={[styles.markerText, { fontSize: size * 0.45, color: colors.textSecondary }]}>
        {number}
      </Text>
    </View>
  );
}

/**
 * One step of the listing editor: marker, title and what it holds, then its fields on a white
 * card. `onLayout` reports where the step sits, so the header can scroll to it.
 */
export function StepCard({
  number,
  step,
  children,
  onLayout,
}: {
  number: number;
  step: EditorStep;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useI18n();
  const colors = useColors();
  return (
    <View style={styles.step} onLayout={onLayout}>
      <View style={styles.head}>
        <StepMarker number={number} state={step.state} />
        <View style={styles.headText}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">
              {t(`seller.editor.steps.${step.id}`)}
            </Text>
            {step.optional && (
              <View style={[styles.tag, { backgroundColor: colors.surface2 }]}>
                <Text style={[styles.tagText, { color: colors.textMuted }]}>
                  {t('seller.editor.optional')}
                </Text>
              </View>
            )}
            {step.state === 'error' && (
              <View style={[styles.tag, { backgroundColor: colors.warningSoft }]}>
                <Text style={[styles.tagText, { color: colors.onWarningSoft }]}>
                  {t('seller.editor.needsFix')}
                </Text>
              </View>
            )}
          </View>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            {t(`seller.editor.hints.${step.id}`)}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.body,
          { backgroundColor: colors.surface, boxShadow: `0 2px 10px ${colors.shadow}` },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center', justifyContent: 'center' },
  markerText: { fontWeight: '800' },
  step: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, gap: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.4 },
  hint: { fontSize: 13, lineHeight: 18 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  tagText: { fontSize: 12, fontWeight: '700' },
  body: { borderRadius: radius.lg, padding: 16, gap: 16 },
});
