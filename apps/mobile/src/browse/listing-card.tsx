import { coverUrl, placeName, type ListingCardData } from '@bairmair/browse';
import { districtById } from '@bairmair/db';
import { formatArea, formatListingPrice, formatPinPricePerArea } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { BlueprintGrid } from '@/ui/blueprint';
import { Icon, type IconName } from '@/ui/icon';
import { Text } from '@/ui/text';
import { PAPER, PAPER_GRID, radius, useColors } from '@/ui/theme';
import { FavoriteButton } from './favorite-button';
import { LabelledPlan, listingPlanUrl } from './plan-image';

/**
 * One listing in a list or on the map. Not a classified ad: the photo sits on a sheet of paper,
 * the facts read like dimensions (rooms, measured m², district), and a scanned listing carries
 * its floor plan in the corner. Tapping the plan turns the photo over to the labelled plan.
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
  const price = formatListingPrice(card.price, card.currency, card.type, locale);
  const perArea =
    card.area_official_m2 && card.price > 0
      ? formatPinPricePerArea(card.price / card.area_official_m2, card.currency, locale)
      : null;
  const area = card.area_official_m2 ?? card.area_scanned_m2;
  const district = districtById(card.district_id);
  const rooms: Spec = { icon: 'rooms', text: t('listingPage.roomsCount', { count: card.rooms }) };

  if (compact) {
    return (
      <Pressable
        accessibilityRole="link"
        onPress={onPress}
        style={({ pressed }) => [
          styles.compact,
          { backgroundColor: colors.surface, boxShadow: `0 4px 14px ${colors.shadow}` },
          { transform: [{ scale: pressed ? 0.98 : 1 }] },
        ]}
      >
        <View style={[styles.thumb, { backgroundColor: colors.surface2 }]}>
          <Cover uri={cover} id={card.id} noPhoto={t('listingCard.noPhoto')} />
          {card.has_3d && (
            <View style={styles.badgeCorner}>
              <Badge3d label={t('listingCard.has3d')} />
            </View>
          )}
        </View>
        <View style={styles.compactBody}>
          <Text
            style={[styles.price, styles.priceCompact, { color: colors.text }]}
            numberOfLines={1}
          >
            {price}
          </Text>
          <Specs
            items={[rooms, area !== null ? { icon: 'area', text: formatArea(area, locale) } : null]}
          />
          {district && (
            <Text style={[styles.small, { color: colors.textMuted }]} numberOfLines={1}>
              {placeName(district, locale)}
            </Text>
          )}
          {note ? <Text style={[styles.small, { color: colors.warning }]}>{note}</Text> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.surface, boxShadow: `0 6px 20px ${colors.shadow}` },
        { transform: [{ scale: pressed ? 0.985 : 1 }] },
      ]}
    >
      <FlipMedia card={card} cover={cover} />
      <View style={styles.body}>
        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>
            {price}
          </Text>
          {perArea && (
            <Text style={[styles.perArea, { color: colors.textMuted }]} numberOfLines={1}>
              {perArea}
            </Text>
          )}
        </View>
        <Specs
          items={[
            rooms,
            area !== null
              ? {
                  icon: 'area',
                  text: formatArea(area, locale),
                  // Measured by the scan when there is no official area.
                  measured: card.area_official_m2 === null && card.area_scanned_m2 !== null,
                }
              : null,
            district ? { icon: 'pin', text: placeName(district, locale) } : null,
          ]}
        />
        <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1}>
          {card.title}
        </Text>
        {note ? <Text style={[styles.small, { color: colors.warning }]}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

/** The photo, turning over to the floor plan on scanned listings. */
function FlipMedia({ card, cover }: { card: ListingCardData; cover: string | null }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const turn = useSharedValue(0);
  const [showPlan, setShowPlan] = useState(false);
  /** The labelled plan loads on the first turn only. */
  const [planMounted, setPlanMounted] = useState(false);

  const flip = () => {
    const next = !showPlan;
    setShowPlan(next);
    if (next) setPlanMounted(true);
    turn.value = withTiming(next ? 1 : 0, { duration: 420 });
  };

  return (
    <View style={styles.media}>
      <Face turn={turn} side="front">
        <View style={[styles.fill, { backgroundColor: colors.surface2 }]}>
          <Cover uri={cover} id={card.id} noPhoto={t('listingCard.noPhoto')} />
        </View>
      </Face>
      {card.has_3d && (
        <Face turn={turn} side="back">
          <View style={[styles.fill, { backgroundColor: PAPER }]}>
            <BlueprintGrid color={PAPER_GRID} />
            {planMounted && <LabelledPlan listingId={card.id} locale={locale} />}
          </View>
        </Face>
      )}

      <View style={styles.badges} pointerEvents="none">
        {card.has_3d && <Badge3d label={t('listingCard.has3d')} />}
        {card.scan_verified && (
          <View style={[styles.chip, styles.chipLight]}>
            <Icon name="verified" size={12} color="#047857" />
            <Text style={[styles.chipText, styles.chipLightText]}>
              {t('listingCard.scanVerified')}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.heart}>
        <FavoriteButton listingId={card.id} onImage />
      </View>

      {card.has_3d && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPlan ? t('listingCard.showPhoto') : t('listingCard.showPlan')}
          hitSlop={8}
          onPress={flip}
          style={({ pressed }) => [
            styles.planTile,
            showPlan && styles.planTileBack,
            { transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          {showPlan ? (
            cover ? (
              <Image source={{ uri: cover }} style={styles.fill} contentFit="cover" />
            ) : (
              <Icon name="photos" size={22} color="#1a2b60" />
            )
          ) : (
            <Image
              source={{ uri: listingPlanUrl(card.id, locale, { thumb: true }) }}
              style={styles.planThumb}
              contentFit="contain"
              recyclingKey={`${card.id}-plan`}
            />
          )}
          <View style={styles.planTileLabel}>
            <Text style={styles.planTileText} numberOfLines={1}>
              {showPlan ? t('listingCard.showPhoto') : t('listingCard.showPlan')}
            </Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** One side of the turning media. */
function Face({
  turn,
  side,
  children,
}: {
  turn: SharedValue<number>;
  side: 'front' | 'back';
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    const degrees = interpolate(turn.value, [0, 1], side === 'front' ? [0, 180] : [-180, 0]);
    const front = turn.value < 0.5;
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${degrees}deg` }],
      // Backface culling is unreliable on Android views: hide the far side halfway through.
      opacity: (side === 'front') === front ? 1 : 0,
    };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.face, style]}>{children}</Animated.View>
  );
}

function Cover({ uri, id, noPhoto }: { uri: string | null; id: string; noPhoto: string }) {
  const colors = useColors();
  return uri ? (
    <Image
      source={{ uri }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      recyclingKey={id}
      transition={200}
    />
  ) : (
    <View style={[styles.fill, styles.center]}>
      <Icon name="building" size={28} color={colors.textSubtle} />
      <Text style={[styles.small, { color: colors.textSubtle }]}>{noPhoto}</Text>
    </View>
  );
}

/** The navy "3D" mark with a cube. */
export function Badge3d({ label }: { label: string }) {
  return (
    <View style={[styles.chip, styles.chip3d]}>
      <Icon name="cube" size={12} color="#7fd3f7" weight="semibold" />
      <Text style={[styles.chipText, styles.chip3dText]}>{label}</Text>
    </View>
  );
}

type Spec = { icon: IconName; text: string; measured?: boolean };

/** Facts set like dimensions: icon, value, thin dividers. */
function Specs({ items }: { items: (Spec | null)[] }) {
  const colors = useColors();
  const shown = items.filter((item): item is Spec => item !== null);
  return (
    <View style={styles.specs}>
      {shown.map((item, index) => (
        <View key={item.icon} style={styles.specItem}>
          {index > 0 && <View style={[styles.specDivider, { backgroundColor: colors.border }]} />}
          <Icon
            name={item.icon}
            size={14}
            color={item.measured ? colors.brand : colors.textSubtle}
          />
          <Text
            style={[styles.spec, { color: item.measured ? colors.accent : colors.textSecondary }]}
            numberOfLines={1}
          >
            {item.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  card: { borderRadius: radius.xl, padding: 8 },
  media: {
    aspectRatio: 4 / 3,
    width: '100%',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  face: { backfaceVisibility: 'hidden', borderRadius: radius.lg, overflow: 'hidden' },
  badges: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chip3d: { backgroundColor: '#1a2b60' },
  chip3dText: { color: '#ffffff', fontWeight: '700', letterSpacing: 0.3 },
  chipLight: { backgroundColor: 'rgba(255,255,255,0.94)' },
  chipLightText: { color: '#0e1733' },
  heart: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(14, 23, 51, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTile: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 84,
    height: 72,
    borderRadius: 14,
    backgroundColor: PAPER,
    borderWidth: 2,
    borderColor: '#ffffff',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(14, 23, 51, 0.25)',
  },
  planTileBack: { borderColor: '#1a2b60' },
  planThumb: { position: 'absolute', left: 6, right: 6, top: 4, bottom: 18 },
  planTileLabel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingVertical: 2,
    backgroundColor: 'rgba(26, 43, 96, 0.88)',
  },
  planTileText: { color: '#ffffff', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  body: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 8, gap: 6 },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  price: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, flexShrink: 1 },
  priceCompact: { fontSize: 17, letterSpacing: -0.3 },
  perArea: { fontSize: 13, fontWeight: '500' },
  specs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', rowGap: 4 },
  specItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  specDivider: { width: 1, height: 14, marginHorizontal: 9 },
  spec: { fontSize: 14, fontWeight: '500' },
  title: { fontSize: 14, lineHeight: 19 },
  small: { fontSize: 13, lineHeight: 18 },
  compact: { flexDirection: 'row', borderRadius: radius.lg, padding: 6, gap: 10 },
  thumb: { width: 108, minHeight: 100, borderRadius: radius.md, overflow: 'hidden' },
  badgeCorner: { position: 'absolute', left: 6, top: 6 },
  compactBody: { flex: 1, paddingVertical: 4, paddingRight: 6, gap: 4, justifyContent: 'center' },
});
