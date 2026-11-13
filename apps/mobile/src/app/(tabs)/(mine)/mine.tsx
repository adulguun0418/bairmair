import { daysLeftInSearch } from '@bairmair/db';
import { formatMoneyCompact } from '@bairmair/i18n';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-provider';
import { useI18n } from '@/i18n/i18n';
import { parseNumberInput } from '@bairmair/browse';
import {
  createDraft,
  downloadToPhone,
  isKnownLocally,
  photoUri,
  refreshFromServer,
  useLocalListings,
} from '@/listings/listings';
import type { LocalListing } from '@/listings/model';
import { fetchMyListings, type ServerListingSummary } from '@/listings/server-listings';
import { SyncStatusLine } from '@/listings/sync-status-line';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

/** The seller's listings, on this phone and on the server. */
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

  const text = { color: colors.text };
  const muted = { color: colors.textMuted };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      {user ? (
        <Button title={t('listings.new')} onPress={openNew} />
      ) : (
        <>
          <Text style={[styles.body, muted]}>{t('listings.signInFirst')}</Text>
          <Button title={t('account.signIn')} onPress={() => router.push('/sign-in')} />
        </>
      )}

      {user && mine.length === 0 && serverOnly.length === 0 && (
        <Text style={[styles.body, muted]}>{t('listings.empty')}</Text>
      )}

      {mine.map((listing) => (
        <ListingRow
          key={listing.id}
          listing={listing}
          daysLeftInSearch={daysLeft.get(listing.id)}
          onPress={() => router.push({ pathname: '/listings/[id]', params: { id: listing.id } })}
        />
      ))}

      {serverOnly.map((row) => (
        <View key={row.id} style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, text]} numberOfLines={2}>
            {row.title}
          </Text>
          <Text style={[styles.muted, muted]}>
            {t(`listings.statuses.${row.status}`)} · {t('listings.onServer')}
          </Text>
          <Text style={[styles.small, muted]}>{t('listings.onServerHint')}</Text>
          <Button
            title={t('listings.download')}
            variant="secondary"
            disabled={downloading !== null}
            onPress={() => void download(row.id)}
          />
        </View>
      ))}
      {error && <Text style={[styles.body, { color: colors.danger }]}>{error}</Text>}
    </ScrollView>
  );
}

/** Within this many days of leaving search, the list reminds the seller to confirm. */
const REMIND_DAYS = 3;

function ListingRow({
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
  const cover = listing.photos[0];
  const price = parseNumberInput(listing.form.price);
  const currency = listing.form.type === 'sale' ? 'MNT' : listing.form.currency;
  const details = [
    t(`listings.statuses.${listing.serverStatus}`),
    listing.scan?.processing === 'ready' ? t('listings.badge3d') : null,
    t(`listingForm.types.${listing.form.type}`),
    price !== null && !Number.isNaN(price) ? formatMoneyCompact(price, currency, locale) : null,
    listing.photos.length > 0 ? t('listings.photoCount', { count: listing.photos.length }) : null,
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.listing,
        { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      {cover ? (
        <Image
          source={{ uri: photoUri(listing.id, cover) }}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, { backgroundColor: colors.border }]} />
      )}
      <View style={styles.grow}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {listing.form.title.trim() || t('listings.untitled')}
        </Text>
        <Text style={[styles.small, { color: colors.textMuted }]}>{details.join(' · ')}</Text>
        {left === null && (
          <Text style={[styles.small, { color: colors.danger }]}>{t('listings.notInSearch')}</Text>
        )}
        {left !== null && left !== undefined && left <= REMIND_DAYS && (
          <Text style={[styles.small, { color: colors.warning }]}>
            {t('listings.leavingSearch', { count: left })}
          </Text>
        )}
        <SyncStatusLine listing={listing} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 12, padding: 14, gap: 8 },
  listing: { flexDirection: 'row', gap: 12 },
  cover: { width: 72, height: 72, borderRadius: 8 },
  title: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  muted: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 14, lineHeight: 20 },
  grow: { flex: 1, gap: 4 },
});
