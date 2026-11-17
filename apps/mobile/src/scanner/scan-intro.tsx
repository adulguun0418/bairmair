import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n/i18n';
import { BlueprintGrid } from '@/ui/blueprint';
import { PAPER_BRAND, PAPER_INK, PAPER_INK_MUTED } from '@/ui/blueprint-panel';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { Text } from '@/ui/text';
import { PAPER, PAPER_GRID, radius } from '@/ui/theme';

const NAVY = '#1a2b60';

/**
 * A full screen of blueprint paper over the (not yet running) camera view: the scanner's intro
 * and its error page. Always light, like floor plans. `footer` stays at the bottom.
 */
function PaperScreen({
  onClose,
  closeLabel,
  children,
  footer,
}: {
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <BlueprintGrid color={PAPER_GRID} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 8 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.close, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon name="dismiss" size={16} color={PAPER_INK} weight="semibold" />
          </Pressable>
        </View>
        {children}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>{footer}</View>
    </View>
  );
}

/** Before the capture starts: what the scan does and how to walk through the apartment. */
export function ScanIntro({ onStart, onCancel }: { onStart: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const steps: { icon: IconName; text: string }[] = [
    { icon: 'walk', text: t('scan.step1') },
    { icon: 'doorOpen', text: t('scan.step2') },
    { icon: 'check', text: t('scan.step3') },
  ];
  return (
    <PaperScreen
      onClose={onCancel}
      closeLabel={t('scan.cancel')}
      footer={<Button title={t('scan.start')} icon="view3d" paper onPress={onStart} />}
    >
      <PlanSketch />
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{t('seller.scanIntro.eyebrow').toUpperCase()}</Text>
        <Text style={styles.title} accessibilityRole="header">
          {t('scan.introTitle')}
        </Text>
        <Text style={styles.lead}>{t('seller.scanIntro.lead')}</Text>
        <View style={styles.duration}>
          <Icon name="clock" size={14} color={PAPER_INK_MUTED} />
          <Text style={styles.durationText}>{t('seller.scanIntro.duration')}</Text>
        </View>
      </View>
      {steps.map((step, index) => (
        <View key={step.icon} style={styles.step}>
          <View style={styles.stepNumber}>
            <Text style={styles.stepNumberText}>{index + 1}</Text>
          </View>
          <Text style={styles.stepText}>{step.text}</Text>
          <Icon name={step.icon} size={20} color={PAPER_BRAND} style={styles.stepIcon} />
        </View>
      ))}
      <View style={styles.warning}>
        <Icon name="warning" size={16} color="#b45309" style={styles.warningIcon} />
        <Text style={styles.warningText}>{t('scan.unsavedWarning')}</Text>
      </View>
    </PaperScreen>
  );
}

/** The capture stopped or could not be saved: why, the native detail, and what to do. */
export function ScanFailure({
  message,
  detail,
  onClose,
  onOpenSettings,
}: {
  message: string;
  detail: string | null;
  onClose: () => void;
  /** Shown when the camera permission is missing. */
  onOpenSettings?: () => void;
}) {
  const { t } = useI18n();
  return (
    <PaperScreen
      onClose={onClose}
      closeLabel={t('scan.close')}
      footer={
        <>
          {onOpenSettings && (
            <Button title={t('scan.openSettings')} paper onPress={onOpenSettings} />
          )}
          <Button
            title={t('scan.close')}
            variant={onOpenSettings ? 'secondary' : 'primary'}
            paper
            onPress={onClose}
          />
        </>
      }
    >
      <View style={styles.heading}>
        <View style={styles.errorBadge}>
          <Icon name="warning" size={26} color="#b45309" />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t('scan.errorTitle')}
        </Text>
        <Text style={styles.lead}>{message}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
    </PaperScreen>
  );
}

/** Points along the walk drawn in the sketch, in % of its width and height. */
const WALK = [
  [18, 72],
  [25, 66],
  [32, 61],
  [39, 57],
  [46, 55],
  [53, 55],
  [60, 55],
  [67, 52],
  [73, 47],
];

/**
 * A two-room plan drawn with views: walls in navy, a doorway in the middle wall, the walk
 * through it as sky-blue dots and the phone at its end, with measured areas.
 */
function PlanSketch() {
  return (
    <View style={styles.sketch} accessibilityElementsHidden importantForAccessibility="no">
      <View style={styles.sketchRoom}>
        <View style={[styles.wallV, { left: '58%', top: 0, height: '38%' }]} />
        <View style={[styles.wallV, { left: '58%', top: '66%', bottom: 0 }]} />
        <View style={[styles.wallH, { left: '58%', right: 0, top: '62%' }]} />
        {WALK.map(([x, y]) => (
          <View key={`${x}-${y}`} style={[styles.dot, { left: `${x}%`, top: `${y}%` }]} />
        ))}
        <View style={[styles.phone, { left: '76%', top: '36%' }]}>
          <Icon name="view3d" size={14} color="#ffffff" weight="semibold" />
        </View>
        <Text style={[styles.area, { left: '8%', top: '12%' }]}>17.5 м²</Text>
        <Text style={[styles.area, { left: '64%', top: '74%' }]}>5.7 м²</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { ...StyleSheet.absoluteFill, backgroundColor: PAPER },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(14, 23, 51, 0.12)',
  },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 10, backgroundColor: PAPER },
  heading: { gap: 8, marginBottom: 4 },
  eyebrow: {
    color: PAPER_BRAND,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  title: {
    color: PAPER_INK,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  lead: { color: PAPER_INK_MUTED, fontSize: 16, lineHeight: 23 },
  duration: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: '#ffffff',
  },
  durationText: { color: PAPER_INK_MUTED, fontSize: 13, fontWeight: '600' },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: '#ffffff',
    boxShadow: '0 2px 10px rgba(14, 23, 51, 0.06)',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: NAVY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  stepText: { flex: 1, color: PAPER_INK, fontSize: 15, lineHeight: 22 },
  stepIcon: { marginTop: 2 },
  warning: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: '#fef3c7',
  },
  warningIcon: { marginTop: 2 },
  warningText: { flex: 1, color: '#451a03', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  errorBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  detail: {
    color: PAPER_INK_MUTED,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Menlo',
  },
  sketch: {
    height: 150,
    borderRadius: radius.lg,
    backgroundColor: '#ffffff',
    padding: 16,
    boxShadow: '0 4px 16px rgba(25, 158, 214, 0.14)',
  },
  sketchRoom: { flex: 1, borderWidth: 3, borderColor: NAVY, borderRadius: 3 },
  wallV: { position: 'absolute', width: 3, marginLeft: -1.5, backgroundColor: NAVY },
  wallH: { position: 'absolute', height: 3, marginTop: -1.5, backgroundColor: NAVY },
  dot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: -2.5,
    marginTop: -2.5,
    backgroundColor: PAPER_BRAND,
  },
  phone: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: -13,
    marginTop: -13,
    backgroundColor: PAPER_BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 0 6px rgba(25, 158, 214, 0.18)',
  },
  area: { position: 'absolute', color: PAPER_BRAND, fontSize: 12, fontWeight: '700' },
});
