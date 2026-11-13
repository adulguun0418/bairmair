import { coverUrl, listingSummary, type ListingCardData } from '@bairmair/browse';
import { formatListingPrice, formatPricePerArea } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { useColors } from '@/ui/theme';
import { FavoriteButton } from './favorite-button';

/**
 * One listing in a list or on the map: cover photo with badges and a heart, price, rooms, area,
 * district and title. Same content as the web card.
 */
export function ListingCard({
  card,
  onPress,
  compact = false,
  note,
}: {
  card: ListingCardData;
  onPress: () => void;
  /** A short horizontal card (map, agent lists). */
  compact?: boolean;
  /** An extra line, e.g. "sold" on the Saved tab. */
  note?: string | null;
}) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const cover = coverUrl(env.supabaseUrl, card);
  const perArea =
    card.area_official_m2 && card.price > 0
      ? formatPricePerArea(card.price / card.area_official_m2, card.currency, locale)
      : null;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.compact,
        { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[compact ? styles.thumb : styles.cover, { backgroundColor: colors.border }]}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={card.id}
            transition={150}
          />
        ) : (
          <Text style={[styles.noPhoto, { color: colors.textMuted }]}>
            {t('listingCard.noPhoto')}
          </Text>
        )}
        <View style={styles.badges}>
          {card.has_3d && (
            <Text style={[styles.badge, styles.badge3d]}>{t('listingCard.has3d')}</Text>
          )}
          {card.scan_verified && !compact && (
            <Text style={[styles.badge, styles.badgePlain]}>{t('listingCard.scanVerified')}</Text>
          )}
        </View>
        {!compact && (
          <View style={styles.heart}>
            <FavoriteButton listingId={card.id} onImage />
          </View>
        )}
      </View>
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <Text style={[styles.price, { color: colors.text }]}>
          {formatListingPrice(card.price, card.currency, card.type, locale)}
        </Text>
        {perArea && !compact && (
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {t('listingCard.perArea', { price: perArea })}
          </Text>
        )}
        <Text style={[styles.summary, { color: colors.text }]} numberOfLines={compact ? 2 : 1}>
          {listingSummary(card, locale, t, { complex: false })}
        </Text>
        <Text style={[styles.small, { color: colors.textMuted }]} numberOfLines={2}>
          {card.title}
        </Text>
        {note ? <Text style={[styles.small, { color: colors.warning }]}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, overflow: 'hidden' },
  compact: { flexDirection: 'row' },
  cover: { aspectRatio: 4 / 3, width: '100%', justifyContent: 'center' },
  thumb: { width: 112, minHeight: 112, justifyContent: 'center' },
  noPhoto: { textAlign: 'center', fontSize: 14 },
  badges: { position: 'absolute', left: 8, top: 8, flexDirection: 'row', gap: 6 },
  badge: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  badge3d: { backgroundColor: '#fcd34d', color: '#451a03' },
  badgePlain: { backgroundColor: 'rgba(255,255,255,0.92)', color: '#1c1917' },
  heart: { position: 'absolute', right: 6, top: 6 },
  body: { padding: 12, gap: 3 },
  bodyCompact: { flex: 1, padding: 10 },
  price: { fontSize: 18, fontWeight: '700' },
  summary: { fontSize: 15 },
  small: { fontSize: 13, lineHeight: 18 },
});
