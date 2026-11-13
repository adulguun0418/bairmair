import {
  cityName,
  listingFacts,
  loadListingPage,
  locationLine,
  placeName,
  updatedText,
  type ListingPageData,
  type ListingPhoto,
} from '@bairmair/browse';
import { districtById, LISTING_FRESHNESS } from '@bairmair/db';
import {
  formatArea,
  formatListingPost,
  formatListingPrice,
  formatMoney,
  formatPricePerArea,
  localePath,
  roomDisplayName,
} from '@bairmair/i18n';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/auth-provider';
import { ContactButtons } from '@/browse/contact-buttons';
import { FavoriteButton } from '@/browse/favorite-button';
import { Badge3d } from '@/browse/listing-card';
import { PhotoCarousel } from '@/browse/photo-carousel';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useLocalListings } from '@/listings/listings';
import { BlueprintGrid } from '@/ui/blueprint';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { ScanFloorPlan } from '@/ui/scan-floor-plan';
import { Text } from '@/ui/text';
import { PAPER, PAPER_GRID, radius, useColors } from '@/ui/theme';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; page: ListingPageData }
  | { kind: 'missing' }
  | { kind: 'error' };

/** Loaded on first use (MapLibre's native module is only in development build 3 and later). */
const LocationMap = lazy(() =>
  import('@/browse/location-map').then((module) => ({ default: module.LocationMap })),
);

/** Views are counted once per listing per app run (the RPC skips the owner's own views). */
const counted = new Set<string>();

/** iOS 26 and later draw header buttons on Liquid Glass, readable over a photo. */
const LIQUID_GLASS = Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

/** How far the sheet slides up over the photos. */
const SHEET_OVERLAP = 28;

/**
 * A listing's public page in the app: the same content as the web page (shared loader and
 * texts), laid out as a measured space rather than an ad. Photos and the floor plan share the
 * top of the screen; the sheet below leads with price and dimensions, then the rooms as the scan
 * measured them; contact stays at the bottom. The 3D view opens full screen (`./model`, the
 * web's embed page in a WebView).
 */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const colors = useColors();
  /** The page for one id; another id is still loading. */
  const [loaded, setLoaded] = useState<{ id: string; state: State }>();
  const state: State = loaded?.id === id ? loaded.state : { kind: 'loading' };

  /** Loads the page again; resolves when it is shown. */
  const load = useCallback(
    () =>
      loadListingPage(supabase, env.supabaseUrl, id)
        .then((page): State => (page ? { kind: 'ready', page } : { kind: 'missing' }))
        .catch((): State => ({ kind: 'error' }))
        .then((result) =>
          setLoaded((current) =>
            // A failed refresh keeps the page that is showing.
            result.kind === 'error' && current?.id === id && current.state.kind === 'ready'
              ? current
              : { id, state: result },
          ),
        ),
    [id],
  );

  useEffect(() => {
    void load();
    if (!counted.has(id)) {
      counted.add(id);
      void supabase.rpc('record_listing_view', { p_listing_id: id });
    }
  }, [id, load]);

  if (state.kind !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ headerTransparent: false }} />
        {state.kind === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={[styles.body, { color: colors.text }]}>
              {state.kind === 'missing' ? t('browse.notFound') : t('browse.loadFailed')}
            </Text>
            {state.kind === 'error' && (
              <Button title={t('browse.retry')} variant="secondary" onPress={() => void load()} />
            )}
          </>
        )}
      </View>
    );
  }

  return <ListingView page={state.page} reload={load} />;
}

function ListingView({ page, reload }: { page: ListingPageData; reload: () => Promise<void> }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const userId = useAuth().session?.user.id ?? null;
  const localListings = useLocalListings();
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scroll = useScrollOffset(scrollRef);

  const { listing, photos, model, seller } = page;
  const live = listing.status === 'published';
  const own = userId === listing.owner_id;
  const editable = own && localListings.some((local) => local.id === listing.id);
  const showBar = live && !own;
  const district = districtById(listing.district_id);
  const webUrl = `${env.siteUrl}${localePath(locale, `/listings/${listing.id}`)}`;
  const roomNames = new Map(model?.rooms.map((room) => [room.id, roomDisplayName(t, room)]));
  const heroHeight = Math.round(width * 1.02);
  const area = listing.area_official_m2 ?? listing.area_scanned_m2;

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  };

  const share = () => {
    const post = formatListingPost(
      {
        type: listing.type,
        price: listing.price,
        currency: listing.currency,
        rooms: listing.rooms,
        areaM2: area,
        pricePerM2: page.pricePerM2,
        districtName: district ? placeName(district, locale) : null,
        cityName: cityName(listing.city_id, locale),
        complexName: listing.complex_name,
        has3d: model !== null,
        url: webUrl,
      },
      locale,
    );
    void Share.share({ message: post });
  };

  const report = () => {
    if (userId) {
      router.push({ pathname: '/listing/[id]/report', params: { id: listing.id } });
      return;
    }
    Alert.alert(t('report.signIn'), undefined, [
      { text: t('account.cancel'), style: 'cancel' },
      { text: t('account.signIn'), onPress: () => router.push('/sign-in') },
    ]);
  };

  const text = { color: colors.text };
  const muted = { color: colors.textMuted };

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: '',
          // The photos run up under the header on iOS (its buttons sit on glass there). Android's
          // header has no glass, so it keeps its own background; before iOS 26 the bar is blurred.
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: LIQUID_GLASS ? undefined : 'systemChromeMaterial',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('listingPage.share.button')}
                hitSlop={10}
                onPress={share}
                style={styles.headerButton}
              >
                <Icon name="share" size={20} color={colors.text} />
              </Pressable>
              <FavoriteButton listingId={listing.id} size={21} />
            </View>
          ),
        }}
      />
      <Animated.ScrollView
        ref={scrollRef}
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            progressViewOffset={insets.top + 44}
          />
        }
        contentContainerStyle={{ paddingBottom: showBar ? 140 + insets.bottom : 40 }}
      >
        <Hero
          photos={photos}
          roomNames={roomNames}
          model={model}
          height={heroHeight}
          scroll={scroll}
          onOpen3d={() =>
            router.push({ pathname: '/listing/[id]/model', params: { id: listing.id } })
          }
        />

        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={[styles.grabber, { backgroundColor: colors.borderStrong }]} />

          {!live && (
            <View style={[styles.banner, { backgroundColor: colors.ink }]}>
              <Text style={[styles.bannerText, { color: colors.onInk }]}>
                {listing.type === 'sale' ? t('listingPage.sold') : t('listingPage.rented')}
              </Text>
            </View>
          )}
          {live && !page.freshness.fresh && (
            <View style={[styles.banner, { backgroundColor: colors.warningSoft }]}>
              <Text style={[styles.bannerText, { color: colors.onWarningSoft }]}>
                {t('listingPage.stale', { days: LISTING_FRESHNESS.confirmEveryDays })}
              </Text>
            </View>
          )}

          <View style={styles.badges}>
            <View style={[styles.typeChip, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.typeChipText, { color: colors.onAccentSoft }]}>
                {t(`listingPage.types.${listing.type}`)}
              </Text>
            </View>
            {model && <Badge3d label={t('listingCard.has3d')} />}
            {listing.scan_verified && (
              <View style={[styles.typeChip, { backgroundColor: colors.successSoft }]}>
                <Icon name="verified" size={12} color={colors.success} />
                <Text style={[styles.typeChipText, { color: colors.onSuccessSoft }]}>
                  {t('listingPage.scanVerified')}
                </Text>
              </View>
            )}
          </View>

          {listing.price !== null && (
            <View style={styles.priceBlock}>
              <Text style={[styles.price, text]}>
                {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
              </Text>
              <Text style={[styles.small, muted]}>
                {formatMoney(listing.price, listing.currency)}
                {listing.negotiable ? ` · ${t('listingPage.negotiable')}` : ''}
              </Text>
            </View>
          )}

          <Text style={[styles.title, text]} accessibilityRole="header">
            {listing.title}
          </Text>
          <View style={styles.metaRow}>
            <Icon name="pin" size={15} color={colors.brand} />
            <Text style={[styles.small, styles.grow, { color: colors.textSecondary }]}>
              {[
                district && t('listingPage.district', { district: placeName(district, locale) }),
                listing.complex_name,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {page.freshness.daysAgo !== null && (
            <View style={styles.metaRow}>
              <Icon name="calendar" size={15} color={colors.textSubtle} />
              <Text style={[styles.small, muted]}>{updatedText(page.freshness.daysAgo, t)}</Text>
            </View>
          )}

          <KeyFacts
            items={[
              listing.rooms !== null && {
                icon: 'rooms' as const,
                label: t('listingSheet.key.rooms'),
                value: String(listing.rooms),
              },
              area !== null && {
                icon: 'area' as const,
                label: t('listingSheet.key.area'),
                value: formatArea(area, locale),
              },
              listing.floor !== null && {
                icon: 'floor' as const,
                label: t('listingSheet.key.floor'),
                value:
                  listing.total_floors === null
                    ? String(listing.floor)
                    : `${listing.floor}/${listing.total_floors}`,
              },
              listing.building_year !== null && {
                icon: 'calendar' as const,
                label: t('listingSheet.key.year'),
                value: String(listing.building_year),
              },
            ]}
          />

          {page.pricePerM2 !== null && (
            <PriceGauge
              pricePerM2={page.pricePerM2}
              currency={listing.currency}
              median={page.districtMedian}
              districtName={district ? placeName(district, locale) : null}
            />
          )}

          {model && (
            <SpaceSection
              model={model}
              onOpen3d={() =>
                router.push({ pathname: '/listing/[id]/model', params: { id: listing.id } })
              }
            />
          )}

          {listing.description ? (
            <Section title={t('listingPage.sections.description')}>
              <Text style={[styles.body, { color: colors.textSecondary }]} selectable>
                {listing.description}
              </Text>
            </Section>
          ) : null}

          <Section title={t('listingPage.sections.location')}>
            <Text style={[styles.body, text]}>{locationLine(listing, locale, t)}</Text>
            {listing.complex_name ? (
              <Text style={[styles.body, styles.strong, text]}>{listing.complex_name}</Text>
            ) : null}
            {listing.address_text ? (
              <Text style={[styles.body, { color: colors.textSecondary }]}>
                {listing.address_text}
              </Text>
            ) : null}
            {listing.public_lat !== null && listing.public_lng !== null && (
              <View style={styles.mapFrame}>
                <Suspense fallback={<ActivityIndicator />}>
                  <LocationMap
                    lat={listing.public_lat}
                    lng={listing.public_lng}
                    exact={listing.show_exact_location}
                  />
                </Suspense>
              </View>
            )}
            {!listing.show_exact_location && (
              <Text style={[styles.small, muted]}>{t('listingPage.approximateLocation')}</Text>
            )}
          </Section>

          <Section title={t('listingSheet.details')}>
            <View style={[styles.table, { backgroundColor: colors.surface }]}>
              {listingFacts(listing, locale, t).map(({ label, value }, index) => (
                <View
                  key={label}
                  style={[
                    styles.fact,
                    index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 },
                  ]}
                >
                  <Text style={[styles.small, styles.grow, muted]}>{label}</Text>
                  <Text style={[styles.small, styles.strong, styles.factValue, text]}>{value}</Text>
                </View>
              ))}
            </View>
          </Section>

          <Section title={t('listingPage.sections.seller')}>
            <SellerCard
              name={seller.agencyName ?? seller.displayName ?? t('listingPage.seller.unnamed')}
              role={
                seller.isAgent
                  ? seller.verifiedAgent
                    ? t('listingPage.seller.verifiedAgent')
                    : t('listingPage.seller.agent')
                  : t('listingPage.seller.owner')
              }
              person={seller.isAgent ? seller.displayName : null}
              verified={seller.isAgent && seller.verifiedAgent}
              onPress={
                seller.isAgent
                  ? () => router.push({ pathname: '/agent/[id]', params: { id: listing.owner_id } })
                  : undefined
              }
            />
          </Section>

          {own ? (
            <View style={[styles.ownCard, { backgroundColor: colors.accentSoft }]}>
              <Text style={[styles.body, { color: colors.onAccentSoft }]}>
                {t('browse.yourListing')}
              </Text>
              {editable && (
                <Button
                  title={t('browse.edit')}
                  onPress={() =>
                    router.push({ pathname: '/listings/[id]', params: { id: listing.id } })
                  }
                />
              )}
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={report}
              hitSlop={8}
              style={({ pressed }) => [styles.report, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="flag" size={14} color={colors.textSubtle} />
              <Text style={[styles.small, { color: colors.textSubtle }]}>{t('report.button')}</Text>
            </Pressable>
          )}
        </View>
      </Animated.ScrollView>

      {showBar && (
        <View
          style={[
            styles.bar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 12),
              boxShadow: `0 -8px 24px ${colors.shadow}`,
            },
          ]}
        >
          {listing.price !== null && (
            <View style={styles.barPrice}>
              <Text style={[styles.barPriceText, text]} numberOfLines={1}>
                {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
              </Text>
              {page.pricePerM2 !== null && (
                <Text style={[styles.tiny, muted]} numberOfLines={1}>
                  {t('listingCard.perArea', {
                    price: formatPricePerArea(page.pricePerM2, listing.currency, locale),
                  })}
                </Text>
              )}
            </View>
          )}
          <View style={styles.grow}>
            <ContactButtons listingId={listing.id} />
          </View>
        </View>
      )}
    </View>
  );
}

/**
 * The top of the screen: the photos, or the floor plan on blueprint paper, with a switch over
 * them (3D opens full screen). Drifts up slower than the page and stretches when pulled down.
 */
function Hero({
  photos,
  roomNames,
  model,
  height,
  scroll,
  onOpen3d,
}: {
  photos: readonly ListingPhoto[];
  roomNames: ReadonlyMap<string, string>;
  model: RoomModelV1 | null;
  height: number;
  scroll: SharedValue<number>;
  onOpen3d: () => void;
}) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<'photos' | 'plan'>('photos');
  // The plan sits between the (iOS, transparent) header and the switch.
  const planTop = (Platform.OS === 'ios' ? insets.top + 44 : 0) + 12;
  const planBottom = SHEET_OVERLAP + 68;
  const parallax = useAnimatedStyle(() => {
    const offset = scroll.value;
    return {
      transform: [
        { translateY: offset > 0 ? offset * 0.45 : offset / 2 },
        { scale: offset < 0 ? 1 + -offset / height : 1 },
      ],
    };
  });
  const switchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scroll.value, [0, height * 0.35], [1, 0], 'clamp'),
  }));

  return (
    <View style={[styles.hero, { height }]}>
      <Animated.View style={[StyleSheet.absoluteFill, parallax]}>
        {view === 'photos' || !model ? (
          <PhotoCarousel
            photos={photos}
            roomNames={roomNames}
            height={height}
            overlayBottom={SHEET_OVERLAP + (model ? 64 : 12)}
          />
        ) : (
          <View style={[styles.fill, styles.planPaper]}>
            <BlueprintGrid color={PAPER_GRID} />
            <View style={[styles.planInset, { top: planTop, bottom: planBottom }]}>
              <ScanFloorPlan model={model} height={height - planTop - planBottom} />
            </View>
          </View>
        )}
      </Animated.View>
      {model && (
        <Animated.View style={[styles.viewSwitch, { bottom: SHEET_OVERLAP + 14 }, switchStyle]}>
          <ViewTab
            icon="photos"
            label={t('listingSheet.views.photos')}
            selected={view === 'photos'}
            onPress={() => setView('photos')}
          />
          <ViewTab
            icon="plan"
            label={t('listingSheet.views.plan')}
            selected={view === 'plan'}
            onPress={() => setView('plan')}
          />
          <ViewTab
            icon="view3d"
            label={t('listingSheet.views.model')}
            selected={false}
            onPress={onOpen3d}
          />
        </Animated.View>
      )}
    </View>
  );
}

function ViewTab({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: IconName;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.viewTab,
        selected && styles.viewTabSelected,
        { transform: [{ scale: pressed ? 0.95 : 1 }] },
      ]}
    >
      <Icon name={icon} size={15} color={selected ? '#1a2b60' : '#ffffff'} />
      <Text style={[styles.viewTabText, { color: selected ? '#1a2b60' : '#ffffff' }]}>{label}</Text>
    </Pressable>
  );
}

type KeyFact = { icon: IconName; label: string; value: string };

/** The four numbers people compare first, set large like dimensions on a drawing. */
function KeyFacts({ items }: { items: (KeyFact | false)[] }) {
  const colors = useColors();
  const shown = items.filter((item): item is KeyFact => item !== false);
  if (shown.length === 0) return null;
  return (
    <View style={[styles.keyFacts, { backgroundColor: colors.surface }]}>
      {shown.map((item, index) => (
        <View
          key={item.label}
          style={[
            styles.keyFact,
            index > 0 && { borderLeftColor: colors.border, borderLeftWidth: 1 },
          ]}
        >
          <Icon name={item.icon} size={16} color={colors.brand} />
          <Text style={[styles.keyValue, { color: colors.text }]} numberOfLines={1}>
            {item.value}
          </Text>
          <Text style={[styles.tiny, { color: colors.textMuted }]} numberOfLines={1}>
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Price per m² against the district median, as a scale: the median in the middle, this listing
 * as a marker (clamped to ±50%).
 */
function PriceGauge({
  pricePerM2,
  currency,
  median,
  districtName,
}: {
  pricePerM2: number;
  currency: ListingPageData['listing']['currency'];
  median: ListingPageData['districtMedian'];
  districtName: string | null;
}) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const own = formatPricePerArea(pricePerM2, currency, locale);

  if (!median || !districtName) {
    return (
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          {t('listingPage.pricePerArea').toUpperCase()}
        </Text>
        <Text style={[styles.gaugeValue, { color: colors.text }]}>{own}</Text>
      </View>
    );
  }

  const ratio = pricePerM2 / median.pricePerM2;
  const percent = Math.round(Math.abs(ratio - 1) * 100);
  const verdict =
    percent < 3
      ? t('listingSheet.median.same')
      : ratio < 1
        ? t('listingSheet.median.below', { percent })
        : t('listingSheet.median.above', { percent });
  const tone = percent < 3 ? colors.textSecondary : ratio < 1 ? colors.success : colors.warning;
  /** 0 = 50% below the median, 1 = 50% above. */
  const position = Math.min(1, Math.max(0, (ratio - 0.5) / 1));

  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
        {t('listingSheet.median.title').toUpperCase()}
      </Text>
      <View style={styles.gaugeHead}>
        <Text style={[styles.gaugeValue, { color: colors.text }]}>{own}</Text>
        <Text style={[styles.gaugeVerdict, { color: tone }]}>{verdict}</Text>
      </View>
      <View style={styles.gauge}>
        <View style={[styles.gaugeTrack, { backgroundColor: colors.surface2 }]} />
        <View style={[styles.gaugeMedian, { backgroundColor: colors.textSubtle }]} />
        <View
          style={[
            styles.gaugeMarker,
            {
              left: `${position * 100}%`,
              backgroundColor: colors.brand,
              borderColor: colors.surface,
            },
          ]}
        />
      </View>
      <View style={styles.gaugeLegend}>
        <Text style={[styles.tiny, { color: colors.textMuted }]}>−50%</Text>
        <Text style={[styles.tiny, { color: colors.textMuted }]}>
          {t('listingSheet.median.median')}{' '}
          {formatPricePerArea(median.pricePerM2, currency, locale)}
        </Text>
        <Text style={[styles.tiny, { color: colors.textMuted }]}>+50%</Text>
      </View>
      <Text style={[styles.tiny, { color: colors.textSubtle }]}>
        {t('listingSheet.median.basis', { district: districtName, count: median.listingCount })}
      </Text>
    </View>
  );
}

/**
 * The rooms as the scan measured them: total area, one bar per room (longest = largest room),
 * and the floor plan with the way into 3D.
 */
function SpaceSection({ model, onOpen3d }: { model: RoomModelV1; onOpen3d: () => void }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const metrics = computeMetrics(model);
  const names = new Map(model.rooms.map((room) => [room.id, roomDisplayName(t, room)]));
  const rooms = [...metrics.rooms].sort((a, b) => b.areaM2 - a.areaM2);
  const largest = rooms[0]?.areaM2 ?? 1;

  return (
    <Section title={t('listingSheet.space')}>
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.eyebrow, { color: colors.textMuted }]}>
          {t('listingSheet.spaceTotal').toUpperCase()}
        </Text>
        <View style={styles.spaceTotal}>
          <Icon name="ruler" size={20} color={colors.brand} />
          <Text style={[styles.gaugeValue, { color: colors.text }]}>
            ≈ {formatArea(metrics.totalAreaM2, locale)}
          </Text>
        </View>
        <View style={styles.roomList}>
          {rooms.map((room) => (
            <View key={room.id} style={styles.roomRow}>
              <View style={styles.roomLabels}>
                <Text style={[styles.small, styles.grow, { color: colors.textSecondary }]}>
                  {names.get(room.id)}
                </Text>
                <Text style={[styles.small, styles.strong, { color: colors.text }]}>
                  {formatArea(room.areaM2, locale)}
                </Text>
              </View>
              <View style={[styles.roomTrack, { backgroundColor: colors.surface2 }]}>
                <View
                  style={[
                    styles.roomBar,
                    { width: `${(room.areaM2 / largest) * 100}%`, backgroundColor: colors.brand },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
        <Text style={[styles.tiny, { color: colors.textSubtle }]}>
          {t('listingSheet.spaceNote')}
        </Text>
      </View>
      <View style={styles.planCard}>
        <BlueprintGrid color={PAPER_GRID} />
        <View style={styles.planCardInner}>
          <ScanFloorPlan model={model} height={280} />
        </View>
        <Button title={t('browse.view3d')} icon="view3d" onPress={onOpen3d} />
      </View>
    </Section>
  );
}

function SellerCard({
  name,
  role,
  person,
  verified,
  onPress,
}: {
  name: string;
  role: string;
  person: string | null;
  verified: boolean;
  onPress?: () => void;
}) {
  const colors = useColors();
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');
  return (
    <Pressable
      accessibilityRole={onPress ? 'link' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.seller,
        { backgroundColor: colors.surface, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.ink }]}>
        <Text style={styles.avatarText}>{initials || '·'}</Text>
      </View>
      <View style={styles.grow}>
        <View style={styles.metaRow}>
          <Text style={[styles.sellerName, { color: colors.text }]} numberOfLines={1}>
            {name}
          </Text>
          {verified && <Icon name="verified" size={15} color={colors.brand} />}
        </View>
        <Text style={[styles.small, { color: colors.textMuted }]} numberOfLines={1}>
          {person ? `${role} · ${person}` : role}
        </Text>
      </View>
      {onPress && <Icon name="chevron" size={15} color={colors.textSubtle} />}
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 4 },
  headerButton: { padding: 4 },
  hero: { overflow: 'hidden' },
  planPaper: { backgroundColor: PAPER },
  planInset: { position: 'absolute', left: 16, right: 16, justifyContent: 'center' },
  viewSwitch: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    padding: 4,
    gap: 2,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14, 23, 51, 0.62)',
  },
  viewTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
  },
  viewTabSelected: { backgroundColor: '#ffffff' },
  viewTabText: { fontSize: 14, fontWeight: '600' },
  sheet: {
    marginTop: -SHEET_OVERLAP,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  banner: { borderRadius: radius.md, padding: 14 },
  bannerText: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  typeChipText: { fontSize: 12, fontWeight: '700' },
  priceBlock: { gap: 2 },
  price: { fontSize: 34, lineHeight: 38, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyFacts: { flexDirection: 'row', borderRadius: radius.lg, paddingVertical: 14 },
  keyFact: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  keyValue: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4 },
  card: { borderRadius: radius.lg, padding: 16, gap: 10 },
  eyebrow: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1 },
  gaugeHead: { gap: 2 },
  gaugeValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  gaugeVerdict: { fontSize: 14, fontWeight: '600' },
  gauge: { height: 22, justifyContent: 'center', marginHorizontal: 9 },
  gaugeTrack: { height: 6, borderRadius: 3 },
  gaugeMedian: { position: 'absolute', left: '50%', width: 2, height: 16, marginLeft: -1 },
  gaugeMarker: {
    position: 'absolute',
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    borderWidth: 3,
  },
  gaugeLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  spaceTotal: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomList: { gap: 10 },
  roomRow: { gap: 5 },
  roomLabels: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  roomTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  roomBar: { height: 8, borderRadius: 4 },
  planCard: {
    borderRadius: radius.lg,
    backgroundColor: PAPER,
    padding: 12,
    gap: 12,
    overflow: 'hidden',
  },
  planCardInner: { borderRadius: radius.lg, overflow: 'hidden' },
  section: { gap: 10, marginTop: 8 },
  sectionTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.4 },
  mapFrame: { borderRadius: radius.lg, overflow: 'hidden' },
  table: { borderRadius: radius.lg, paddingHorizontal: 14 },
  fact: { flexDirection: 'row', gap: 16, paddingVertical: 11 },
  factValue: { flexShrink: 1, textAlign: 'right' },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.lg,
    padding: 14,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  sellerName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  ownCard: { borderRadius: radius.lg, padding: 16, gap: 12 },
  report: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingVertical: 12,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  barPrice: { maxWidth: '38%', paddingBottom: 8 },
  barPriceText: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  body: { fontSize: 16, lineHeight: 23 },
  strong: { fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
  tiny: { fontSize: 12, lineHeight: 16 },
});
