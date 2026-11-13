import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import {
  fetchFavoriteCards,
  reloadFavorites,
  toggleFavorite,
  useFavorites,
  type FavoriteCard,
} from '@/browse/favorites';
import { ListingCard } from '@/browse/listing-card';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';

type State = { kind: 'loading' } | { kind: 'ready'; items: FavoriteCard[] } | { kind: 'error' };

/**
 * Saved listings. Reloaded each time the tab opens, so a heart tapped elsewhere shows up; a
 * listing unsaved here stays in the list, with an empty heart, until the next visit (so a
 * mistaken tap is easy to undo).
 */
export default function FavoritesScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const favorites = useFavorites();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const signedIn = favorites.userId !== null;

  const load = useCallback(async () => {
    try {
      setState({ kind: 'ready', items: await fetchFavoriteCards() });
    } catch {
      setState((current) => (current.kind === 'ready' ? current : { kind: 'error' }));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (signedIn) void load();
    }, [signedIn, load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), reloadFavorites()]);
    setRefreshing(false);
  };

  if (!signedIn) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.body, { color: colors.text }]}>{t('favorites.signIn')}</Text>
        <Button title={t('account.signIn')} onPress={() => router.push('/sign-in')} />
      </View>
    );
  }
  if (state.kind !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        {state.kind === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={[styles.body, { color: colors.text }]}>{t('browse.loadFailed')}</Text>
            <Button title={t('browse.retry')} variant="secondary" onPress={() => void load()} />
          </>
        )}
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      data={state.items}
      keyExtractor={(item) => item.listingId}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      ListEmptyComponent={
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('favorites.empty')}</Text>
      }
      renderItem={({ item }) =>
        item.card ? (
          <ListingCard
            card={item.card}
            note={
              item.status === 'sold_or_rented'
                ? item.card.type === 'sale'
                  ? t('listingPage.sold')
                  : t('listingPage.rented')
                : null
            }
            onPress={() =>
              router.push({ pathname: '/listing/[id]', params: { id: item.listingId } })
            }
          />
        ) : (
          // Hidden or deleted by its seller: it can only be removed.
          <View style={[styles.gone, { backgroundColor: colors.surface }]}>
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {t('favorites.unavailable')}
            </Text>
            <Button
              title={t('favorites.remove')}
              variant="secondary"
              onPress={() => {
                toggleFavorite(item.listingId)
                  .then(() => load())
                  .catch(() => undefined);
              }}
            />
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  list: { padding: 16, gap: 14 },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  gone: { borderRadius: 14, padding: 14, gap: 10 },
});
