import type { ListingStatus } from '@bairmair/browse';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { Text } from '@/ui/text';
import { radius, useColors, type Colors } from '@/ui/theme';

function tones(colors: Colors, status: ListingStatus) {
  switch (status) {
    case 'published':
      return { background: colors.successSoft, text: colors.onSuccessSoft, dot: colors.success };
    case 'sold_or_rented':
      return { background: colors.ink, text: colors.onInk, dot: colors.onInk };
    case 'archived':
      return { background: colors.surface2, text: colors.textMuted, dot: colors.textSubtle };
    case 'draft':
      return { background: colors.warningSoft, text: colors.onWarningSoft, dot: colors.warning };
  }
}

/** The listing's status as the server has it: a coloured pill with a dot. */
export function StatusPill({ status }: { status: ListingStatus }) {
  const { t } = useI18n();
  const colors = useColors();
  const tone = tones(colors, status);
  return (
    <View style={[styles.pill, { backgroundColor: tone.background }]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.text, { color: tone.text }]} numberOfLines={1}>
        {t(`listings.statuses.${status}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '700' },
});
