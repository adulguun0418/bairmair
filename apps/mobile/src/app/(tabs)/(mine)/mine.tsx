import { parseNumberInput, placeName } from '@bairmair/browse';
import { daysLeftInSearch, districtById } from '@bairmair/db';
import { formatArea, formatListingPrice } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useI18n } from '@bairmair/native-ui/i18n';
import { editorProgress, editorSteps } from '@/listings/editor-steps';
import {
  createDraft,
  downloadToPhone,
  isKnownLocally,
  photoUri,
  refreshFromServer,
  retrySyncNow,
  useLocalListings,
} from '@/listings/listings';
import { isLive, type LocalListing } from '@/listings/model';
import { fetchMyListings, type ServerListingSummary } from '@/listings/server-listings';
import { StatusPill } from '@/listings/status-pill';
import { SyncStatusLine } from '@/listings/sync-status-line';
import { supabase } from '@/lib/supabase';
import { BlueprintGrid } from '@bairmair/native-ui/blueprint';
import { BlueprintPanel } from '@bairmair/native-ui/blueprint-panel';
import { Button } from '@bairmair/native-ui/button';
import { Icon, type IconName } from '@bairmair/native-ui/icon';
import { ProgressBar } from '@/ui/progress-bar';
import { Text } from '@bairmair/native-ui/text';
import { PAPER, PAPER_GRID, radius, useColors } from '@bairmair/native-ui/theme';

/** The seller's listings, on this phone and on the server, as project cards. */
export default function MyListingsScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const user = useAuth().session?.user ?? null;
  const local = useLocalListings();
  const [server, setServer] = useState<ServerListingSummary[]>([]);
  /** When `server` was fetched: the clock for "days left in search". */
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const userId = user?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setServer([]);
        return;
      }
      let active = true;
      // Edits made on the website or another phone reach this phone's copies.
      void refreshFromServer();
      fetchMyListings(supabase, userId)
        .then((rows) => {
          if (!active) return;
          setServer(rows);
          setFetchedAt(new Date());
        })
        .catch(() => {
          // Offline: the phone's own listings are still shown.
        });
      return () => {
        active = false;
      };
    }, [userId]),
  );

  const mine = local.filter((listing) => listing.ownerId === userId);
  // Reads `local` so the React Compiler recomputes this whenever the phone's listings change
  // (a deletion hides the listing from `local` and records it for isKnownLocally).
  const localIds = new Set(local.map((listing) => listing.id));
  const serverOnly = server.filter((row) => !localIds.has(row.id) && !isKnownLocally(row.id));
  /** Days each published listing has left in search (null: already out). */
  const daysLeft = new Map(
    fetchedAt
      ? server
          .filter((row) => row.status === 'published')
          .map((row) => [row.id, daysLeftInSearch(row.last_confirmed_at, fetchedAt)] as const)
      : [],
  );

  /** Pull to refresh: edits made on the website (or another phone) reach this phone now. */
  const refresh = async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        refreshFromServer({ maxAgeMs: 0 }),
        fetchMyListings(supabase, userId)
          .then((rows) => {
            setServer(rows);
            setFetchedAt(new Date());
          })
          .catch(() => {
            // Offline: the phone's own listings stay as they are.
          }),
      ]);
      // Anything waiting to be sent tries again too.
      retrySyncNow();
    } finally {
      setRefreshing(false);
    }
  };

  const openNew = () => {
    if (!userId) return;
    const id = createDraft(userId);
    router.push({ pathname: '/listings/[id]', params: { id } });
  };

  const download = async (id: string) => {
    if (!userId) return;
    setDownloading(id);
    setError(null);
    try {
      await downloadToPhone(id, userId);
      router.push({ pathname: '/listings/[id]', params: { id } });
    } catch {
      setError(t('listings.downloadFailed'));
    } finally {
      setDownloading(null);
    }
  };

  const content = (() => {
    if (!user) {
      return (
        <BlueprintPanel
          icon="building"
          title={t('seller.mine.signedOutTitle')}
          body={t('seller.mine.signedOutBody')}
        >
          <Button title={t('account.signIn')} paper onPress={() => router.push('/sign-in')} />
        </BlueprintPanel>
      );
    }
    if (mine.length === 0 && serverOnly.length === 0) {
      return (
        <BlueprintPanel
          icon="building"
          title={t('seller.mine.emptyTitle')}
          body={t('seller.mine.emptyBody')}
        >
          <Button title={t('listings.new')} icon="plus" paper onPress={openNew} />
        </BlueprintPanel>
      );
    }
    const live = mine.filter((listing) => isLive(listing.serverStatus)).length;
    const drafts = mine.filter((listing) => listing.serverStatus === 'draft').length;
    const scanned = mine.filter((listing) => listing.scan?.processing === 'ready').length;
    return (
      <>
        <View style={styles.summary}>
          <Text style={[styles.summaryCount, { color: colors.text }]}>
            {t('seller.mine.summary', { count: mine.length + serverOnly.length })}
          </Text>
          <View style={styles.counts}>
            {live > 0 && <Count text={t('seller.mine.live', { count: live })} />}
            {drafts > 0 && <Count text={t('seller.mine.drafts', { count: drafts })} />}
            {scanned > 0 && <Count text={t('seller.mine.scanned', { count: scanned })} brand />}
          </View>
        </View>
        <Button title={t('listings.new')} icon="plus" onPress={openNew} />
        {mine.map((listing) => (
          <ProjectCard
            key={listing.id}
            listing={listing}
            daysLeftInSearch={daysLeft.get(listing.id)}
            onPress={() => router.push({ pathname: '/listings/[id]', params: { id: listing.id } })}
          />
        ))}
        {serverOnly.map((row) => (
          <ElsewhereCard
            key={row.id}
            row={row}
            busy={downloading !== null}
            onDownload={() => void download(row.id)}
          />
        ))}
      </>
    );
  })();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        user ? (
          <RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />
        ) : undefined
      }
    >
      {content}
      {error && <Text style={[styles.body, { color: colors.danger }]}>{error}</Text>}
    </ScrollView>
  );
}

function Count({ text, brand }: { text: string; brand?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.count, { backgroundColor: brand ? colors.accentSoft : colors.surface2 }]}>
      <Text
        style={[styles.countText, { color: brand ? colors.onAccentSoft : colors.textSecondary }]}
      >
        {text}
      </Text>
    </View>
  );
}

/** Within this many days of leaving search, the card reminds the seller to confirm. */
const REMIND_DAYS = 3;

/**
 * One listing as a project: cover photo with its status and 3D badge, the price and facts as
 * dimensions, then what it needs next (steps left before publishing, or leaving search soon) and
 * whether the phone's copy has reached the server.
 */
function ProjectCard({
  listing,
  daysLeftInSearch: left,
  onPress,
}: {
  listing: LocalListing;
  /** Published on the server: days left in search, null when out; undefined otherwise. */
  daysLeftInSearch: number | null | undefined;
  onPress: () => void;
}) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const form = listing.form;
  const cover = listing.photos[0];
  const price = parseNumberInput(form.price);
  const currency = form.type === 'sale' ? 'MNT' : form.currency;
  const priceText =
    price !== null && !Number.isNaN(price)
      ? formatListingPrice(price, currency, form.type, locale)
      : null;
  const rooms = parseNumberInput(form.rooms);
  const officialArea = parseNumberInput(form.areaOfficial);
  const area =
    officialArea !== null && !Number.isNaN(officialArea)
      ? { value: officialArea, scanned: false }
      : listing.scan?.totalAreaM2
        ? { value: listing.scan.totalAreaM2, scanned: true }
        : null;
  const district = districtById(form.districtId);
  const has3d = listing.scan?.processing === 'ready';
  const live = isLive(listing.serverStatus);
  const progress = editorProgress(editorSteps(listing));
  const stepsLeft = progress.total - progress.done;

  const facts: { icon: IconName; text: string; brand?: boolean }[] = [];
  if (rooms !== null && !Number.isNaN(rooms)) {
    facts.push({ icon: 'rooms', text: t('listingPage.roomsCount', { count: rooms }) });
  }
  if (area) {
    facts.push({
      icon: 'area',
      text: `${area.scanned ? '≈ ' : ''}${formatArea(area.value, locale)}`,
      brand: area.scanned,
    });
  }
  if (district) facts.push({ icon: 'pin', text: placeName(district, locale) });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface,
          boxShadow: `0 6px 18px ${colors.shadow}`,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View style={[styles.media, { backgroundColor: colors.surface2 }]}>
        {cover ? (
          <Image
            source={{ uri: photoUri(listing.id, cover) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
            <BlueprintGrid color={PAPER_GRID} />
            <Icon name="camera" size={26} color="#199ed6" />
            <Text style={styles.noPhotoText}>{t('seller.mine.noPhoto')}</Text>
          </View>
        )}
        <View style={styles.mediaTop}>
          <StatusPill status={listing.serverStatus} />
          {has3d && (
            <View style={styles.badge3d}>
              <Icon name="cube" size={12} color="#ffffff" weight="semibold" />
              <Text style={styles.badge3dText}>{t('listings.badge3d')}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.cardBody}>
        {priceText && (
          <Text style={[styles.price, { color: colors.text }]} numberOfLines={1}>
            {priceText}
          </Text>
        )}
        <Text style={[styles.title, { color: colors.textSecondary }]} numberOfLines={2}>
          {form.title.trim() || t('listings.untitled')}
        </Text>
        {facts.length > 0 && (
          <View style={styles.facts}>
            {facts.map((fact, index) => (
              <View
                key={fact.icon}
                style={[
                  styles.fact,
                  index === 0
                    ? { paddingLeft: 0 }
                    : { borderLeftWidth: 1, borderLeftColor: colors.border },
                ]}
              >
                <Icon name={fact.icon} size={14} color={colors.brand} />
                <Text
                  style={[
                    styles.factText,
                    { color: fact.brand ? colors.brand : colors.textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {fact.text}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          {!live && (
            <View style={styles.progress}>
              <View style={styles.progressHead}>
                <Text
                  style={[
                    styles.small,
                    styles.strong,
                    { color: stepsLeft === 0 ? colors.success : colors.text },
                  ]}
                >
                  {stepsLeft === 0
                    ? t('seller.mine.ready')
                    : t('seller.mine.stepsLeft', { count: stepsLeft })}
                </Text>
                <Text style={[styles.small, { color: colors.textMuted }]}>
                  {progress.done}/{progress.total}
                </Text>
              </View>
              <ProgressBar
                value={progress.done / progress.total}
                color={stepsLeft === 0 ? colors.success : undefined}
              />
            </View>
          )}
          {left === null && (
            <Notice icon="warning" color={colors.danger} text={t('listings.notInSearch')} />
          )}
          {left !== null && left !== undefined && left <= REMIND_DAYS && (
            <Notice
              icon="clock"
              color={colors.warning}
              text={t('listings.leavingSearch', { count: left })}
            />
          )}
          <SyncStatusLine listing={listing} />
        </View>
      </View>
    </Pressable>
  );
}

function Notice({ icon, color, text }: { icon: IconName; color: string; text: string }) {
  return (
    <View style={styles.notice}>
      <Icon name={icon} size={14} color={color} style={styles.noticeIcon} />
      <Text style={[styles.small, styles.grow, { color }]}>{text}</Text>
    </View>
  );
}

/** A listing posted from another phone or the website before this phone downloaded it. */
function ElsewhereCard({
  row,
  busy,
  onDownload,
}: {
  row: ServerListingSummary;
  busy: boolean;
  onDownload: () => void;
}) {
  const { t } = useI18n();
  const colors = useColors();
  return (
    <View
      style={[styles.elsewhere, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={styles.elsewhereHead}>
        <View style={[styles.cloud, { backgroundColor: colors.accentSoft }]}>
          <Icon name="cloud" size={18} color={colors.brand} />
        </View>
        <View style={styles.grow}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {row.title}
          </Text>
          <Text style={[styles.small, { color: colors.textMuted }]}>
            {t(`listings.statuses.${row.status}`)} · {t('seller.mine.elsewhere')}
          </Text>
        </View>
      </View>
      <Text style={[styles.small, { color: colors.textMuted }]}>{t('listings.onServerHint')}</Text>
      <Button
        title={t('listings.download')}
        icon="cloud"
        variant="secondary"
        size="small"
        disabled={busy}
        onPress={onDownload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  summary: { gap: 8 },
  summaryCount: { fontSize: 15, fontWeight: '600' },
  counts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  count: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  countText: { fontSize: 13, fontWeight: '600' },
  card: { borderRadius: radius.xl, padding: 8 },
  media: { aspectRatio: 16 / 9, borderRadius: radius.lg, overflow: 'hidden' },
  noPhoto: { backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center', gap: 6 },
  noPhotoText: { color: '#525d78', fontSize: 13, fontWeight: '600' },
  mediaTop: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge3d: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: '#1a2b60',
  },
  badge3dText: { color: '#ffffff', fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  cardBody: { paddingHorizontal: 8, paddingTop: 12, paddingBottom: 6, gap: 6 },
  price: { fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.6 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  facts: { flexDirection: 'row', marginTop: 2 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    flexShrink: 1,
  },
  factText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },
  footer: { borderTopWidth: 1, marginTop: 8, paddingTop: 10, gap: 8 },
  progress: { gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  notice: { flexDirection: 'row', gap: 6 },
  noticeIcon: { marginTop: 3 },
  elsewhere: { borderRadius: radius.xl, padding: 16, gap: 10, borderWidth: 1 },
  elsewhereHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cloud: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  strong: { fontWeight: '600' },
  grow: { flex: 1 },
});
