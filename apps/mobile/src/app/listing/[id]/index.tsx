import {
  cityName,
  listingFacts,
  listingSummary,
  loadListingPage,
  locationLine,
  placeName,
  updatedText,
  type ListingPageData,
} from '@bairmair/browse';
import { districtById, LISTING_FRESHNESS } from '@bairmair/db';
import {
  formatListingPost,
  formatListingPrice,
  formatMoney,
  formatPricePerArea,
  localePath,
  roomDisplayName,
} from '@bairmair/i18n';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { ContactButtons } from '@/browse/contact-buttons';
import { FavoriteButton } from '@/browse/favorite-button';
import { PhotoCarousel } from '@/browse/photo-carousel';
import { useI18n } from '@/i18n/i18n';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useLocalListings } from '@/listings/listings';
import { Button } from '@/ui/button';
import { ScanFloorPlan } from '@/ui/scan-floor-plan';
import { useColors } from '@/ui/theme';

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

/**
 * A listing's public page in the app: the same content as the web page (shared loader and
 * texts). The floor plan is drawn here; the 3D view opens full screen (`./model`, the web's
 * embed page in a WebView).
 */
export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const userId = useAuth().session?.user.id ?? null;
  const localListings = useLocalListings();
  /** The page for one id; another id is still loading. */
  const [loaded, setLoaded] = useState<{ id: string; state: State }>();
  const state: State = loaded?.id === id ? loaded.state : { kind: 'loading' };
  const [refreshing, setRefreshing] = useState(false);

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

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (state.kind !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
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

  const { page } = state;
  const { listing, photos, model, seller } = page;
  const live = listing.status === 'published';
  const own = userId === listing.owner_id;
  const editable = own && localListings.some((local) => local.id === listing.id);
  const district = districtById(listing.district_id);
  const webUrl = `${env.siteUrl}${localePath(locale, `/listings/${listing.id}`)}`;
  const roomNames = new Map(model?.rooms.map((room) => [room.id, roomDisplayName(t, room)]));

  const share = () => {
    const post = formatListingPost(
      {
        type: listing.type,
        price: listing.price,
        currency: listing.currency,
        rooms: listing.rooms,
        areaM2: listing.area_official_m2 ?? listing.area_scanned_m2,
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

  const text = { color: colors.text };
  const muted = { color: colors.textMuted };

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('listingPage.share.button')}
                hitSlop={10}
                onPress={share}
              >
                <SymbolView
                  name="square.and.arrow.up"
                  size={22}
                  tintColor={colors.accent}
                  fallback={
                    <Text style={{ color: colors.accent }}>{t('listingPage.share.button')}</Text>
                  }
                />
              </Pressable>
              <FavoriteButton listingId={listing.id} size={22} />
            </View>
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <PhotoCarousel photos={photos} roomNames={roomNames} />

        <View style={styles.content}>
          {!live && (
            <Text style={[styles.banner, styles.bannerDark]}>
              {listing.type === 'sale' ? t('listingPage.sold') : t('listingPage.rented')}
            </Text>
          )}
          {live && !page.freshness.fresh && (
            <Text style={[styles.banner, styles.bannerWarning]}>
              {t('listingPage.stale', { days: LISTING_FRESHNESS.confirmEveryDays })}
            </Text>
          )}

          <View style={styles.badges}>
            <Badge>{t(`listingPage.types.${listing.type}`)}</Badge>
            {model && <Badge accent>{t('listingPage.has3d')}</Badge>}
            {listing.scan_verified && <Badge accent>{t('listingPage.scanVerified')}</Badge>}
          </View>
          <Text style={[styles.title, text]} accessibilityRole="header">
            {listing.title}
          </Text>
          <Text style={[styles.body, text]}>{listingSummary(listing, locale, t)}</Text>

          {listing.price !== null && (
            <View style={styles.block}>
              <Text style={[styles.price, text]}>
                {formatListingPrice(listing.price, listing.currency, listing.type, locale)}
              </Text>
              <Text style={[styles.small, muted]}>
                {formatMoney(listing.price, listing.currency)}
                {listing.negotiable ? ` · ${t('listingPage.negotiable')}` : ''}
              </Text>
              {page.pricePerM2 !== null && (
                <Text style={[styles.small, text]}>
                  {t('listingPage.pricePerArea')}:{' '}
                  {formatPricePerArea(page.pricePerM2, listing.currency, locale)}
                </Text>
              )}
              {page.pricePerM2 !== null && page.districtMedian && district && (
                <Text style={[styles.small, muted]}>
                  {t('listingPage.districtMedian', {
                    district: placeName(district, locale),
                    price: formatPricePerArea(
                      page.districtMedian.pricePerM2,
                      listing.currency,
                      locale,
                    ),
                    count: page.districtMedian.listingCount,
                  })}
                </Text>
              )}
            </View>
          )}
          {page.freshness.daysAgo !== null && (
            <Text style={[styles.small, muted]}>{updatedText(page.freshness.daysAgo, t)}</Text>
          )}

          {own ? (
            <Card>
              <Text style={[styles.body, text]}>{t('browse.yourListing')}</Text>
              {editable && (
                <Button
                  title={t('browse.edit')}
                  variant="secondary"
                  onPress={() =>
                    router.push({ pathname: '/listings/[id]', params: { id: listing.id } })
                  }
                />
              )}
            </Card>
          ) : (
            live && (
              <Card>
                <ContactButtons listingId={listing.id} />
              </Card>
            )
          )}

          <Card>
            <Text style={[styles.small, muted]}>{t('listingPage.sections.seller')}</Text>
            <Text style={[styles.heading, text]}>
              {seller.agencyName ?? seller.displayName ?? t('listingPage.seller.unnamed')}
            </Text>
            <Text style={[styles.small, muted]}>
              {seller.isAgent
                ? seller.verifiedAgent
                  ? t('listingPage.seller.verifiedAgent')
                  : t('listingPage.seller.agent')
                : t('listingPage.seller.owner')}
              {seller.isAgent && seller.displayName ? ` · ${seller.displayName}` : ''}
            </Text>
            {seller.isAgent && (
              <Button
                title={t('listingPage.seller.profile')}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/agent/[id]', params: { id: listing.owner_id } })
                }
              />
            )}
          </Card>

          {model && (
            <Section title={t('listingPage.sections.model')}>
              <ScanFloorPlan model={model} />
              <Button
                title={t('browse.view3d')}
                onPress={() =>
                  router.push({ pathname: '/listing/[id]/model', params: { id: listing.id } })
                }
              />
            </Section>
          )}

          {listing.description ? (
            <Section title={t('listingPage.sections.description')}>
              <Text style={[styles.body, text]} selectable>
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
              <Text style={[styles.body, text]}>{listing.address_text}</Text>
            ) : null}
            {!listing.show_exact_location && (
              <Text style={[styles.small, muted]}>{t('listingPage.approximateLocation')}</Text>
            )}
            {listing.public_lat !== null && listing.public_lng !== null && (
              <Suspense fallback={<ActivityIndicator />}>
                <LocationMap
                  lat={listing.public_lat}
                  lng={listing.public_lng}
                  exact={listing.show_exact_location}
                />
              </Suspense>
            )}
          </Section>

          <Section title={t('listingPage.sections.details')}>
            {listingFacts(listing, locale, t).map(({ label, value }) => (
              <View key={label} style={[styles.fact, { borderBottomColor: colors.border }]}>
                <Text style={[styles.body, muted]}>{label}</Text>
                <Text style={[styles.body, styles.strong, styles.factValue, text]}>{value}</Text>
              </View>
            ))}
          </Section>

          {!own && (
            <Button
              title={t('report.button')}
              variant="secondary"
              onPress={() => {
                if (userId) {
                  router.push({ pathname: '/listing/[id]/report', params: { id: listing.id } });
                  return;
                }
                Alert.alert(t('report.signIn'), undefined, [
                  { text: t('account.cancel'), style: 'cancel' },
                  { text: t('account.signIn'), onPress: () => router.push('/sign-in') },
                ]);
              }}
            />
          )}
        </View>
      </ScrollView>
    </>
  );
}

function Badge({ children, accent = false }: { children: string; accent?: boolean }) {
  const colors = useColors();
  return (
    <Text
      style={[
        styles.badge,
        accent
          ? { backgroundColor: '#fcd34d', color: '#451a03' }
          : { backgroundColor: colors.surface, color: colors.text },
      ]}
    >
      {children}
    </Text>
  );
}

function Card({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <View style={[styles.card, { backgroundColor: colors.surface }]}>{children}</View>;
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  banner: { borderRadius: 12, padding: 14, fontSize: 15, lineHeight: 21, overflow: 'hidden' },
  bannerDark: { backgroundColor: '#1c1917', color: '#ffffff', fontWeight: '600' },
  bannerWarning: { backgroundColor: '#fef3c7', color: '#451a03' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  title: { fontSize: 24, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '600' },
  price: { fontSize: 28, fontWeight: '700' },
  block: { gap: 2 },
  body: { fontSize: 16, lineHeight: 22 },
  strong: { fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20 },
  card: { borderRadius: 14, padding: 14, gap: 8 },
  section: { gap: 10, marginTop: 6 },
  sectionTitle: { fontSize: 20, fontWeight: '700' },
  fact: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  factValue: { flexShrink: 1, textAlign: 'right' },
});
