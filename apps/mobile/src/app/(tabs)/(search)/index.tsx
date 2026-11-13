import { activeFilterCount, type SearchFilters } from '@bairmair/browse';
import { LISTING_FRESHNESS, type SearchListingRow } from '@bairmair/db';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ListingCard } from '@/browse/listing-card';
import { hasMorePages, searchPage } from '@/browse/search';
import { setSearchFilters, useSearchFilters } from '@/browse/search-store';
import { useI18n } from '@/i18n/i18n';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';

/**
 * Loaded on first use: MapLibre's native module is only in development build 3 and later, so on
 * an older build only the map fails, not the whole app.
 */
const SearchMap = lazy(() =>
  import('@/browse/search-map').then((module) => ({ default: module.SearchMap })),
);

/** The search box sends at most this much text (the web's limit). */
const MAX_QUERY_LENGTH = 100;

const TOOLBAR_PADDING = 8;
/** Large text sizes still grow the toolbar's labels, but not past one row. */
const MAX_FONT_SCALE = 1.4;

/** The buyers' home: search with filters, as a list or on the map. */
export default function SearchScreen() {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const filters = useSearchFilters();
  const filterCount = activeFilterCount(filters);
  // With a search bar (and on iOS 26 always) the iOS header is translucent and the screen starts
  // under it. The list insets itself; this fixed toolbar has to start below the header itself.
  const headerHeight = useHeaderHeight();

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: t('search.queryPlaceholder'),
            hideWhenScrolling: false,
            onSearchButtonPress: (event) =>
              setSearchFilters({ q: event.nativeEvent.text.trim().slice(0, MAX_QUERY_LENGTH) }),
            onCancelButtonPress: () => setSearchFilters({ q: '' }),
          },
        }}
      />
      <View
        style={[
          styles.toolbar,
          {
            borderBottomColor: colors.border,
            paddingTop: (Platform.OS === 'ios' ? headerHeight : 0) + TOOLBAR_PADDING,
          },
        ]}
      >
        <Segments
          stretch
          value={filters.type ?? 'all'}
          options={(['all', 'sale', 'rent'] as const).map((type) => ({
            value: type,
            label: t(`search.types.${type}`),
          }))}
          onChange={(type) => setSearchFilters({ type: type === 'all' ? null : type })}
        />
        <View style={styles.toolbarRow}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/search-filters')}
            style={({ pressed }) => [
              styles.filterButton,
              {
                borderColor: filterCount > 0 ? colors.accent : colors.border,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[styles.filterText, { color: filterCount > 0 ? colors.accent : colors.text }]}
            >
              {filterCount > 0
                ? t('browse.filtersCount', { count: filterCount })
                : t('search.filters')}
            </Text>
          </Pressable>
          <Segments
            value={filters.view}
            options={(['list', 'map'] as const).map((view) => ({
              value: view,
              label: t(`search.views.${view}`),
            }))}
            onChange={(view) => setSearchFilters({ view })}
          />
        </View>
      </View>
      {filters.view === 'map' ? (
        <Suspense
          fallback={
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          }
        >
          <SearchMap filters={filters} />
        </Suspense>
      ) : (
        <ResultList filters={filters} />
      )}
    </View>
  );
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: SearchListingRow[]; total: number; loadingMore: boolean }
  | { kind: 'error' };

/** Search results, 24 at a time, loading more near the end of the list. */
function ResultList({ filters }: { filters: SearchFilters }) {
  const { t } = useI18n();
  const colors = useColors();
  const router = useRouter();
  // The list depends on the filters, not on the list/map switch.
  const key = JSON.stringify({ ...filters, view: 'list', page: 1 });
  /** Results of the filters in `key`; other filters are still loading. */
  const [loaded, setLoaded] = useState<{ key: string; state: ListState }>();
  const state: ListState = loaded?.key === key ? loaded.state : { kind: 'loading' };
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef<AbortController | null>(null);

  const update = (change: (current: ListState) => ListState) =>
    setLoaded((current) =>
      current?.key === key ? { key, state: change(current.state) } : current,
    );

  /** Loads the first page again; resolves when it is shown. */
  const loadFirst = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    return searchPage(JSON.parse(key) as SearchFilters, 0, controller.signal)
      .then((page): ListState => ({ kind: 'ready', ...page, loadingMore: false }))
      .catch((): ListState => ({ kind: 'error' }))
      .then((result) => {
        if (!controller.signal.aborted) setLoaded({ key, state: result });
      });
  }, [key]);

  useEffect(() => {
    void loadFirst();
    return () => request.current?.abort();
  }, [loadFirst]);

  const loadMore = async () => {
    if (state.kind !== 'ready' || state.loadingMore) return;
    if (!hasMorePages(state.rows.length, state.total)) return;
    const controller = new AbortController();
    request.current = controller;
    update((current) => (current.kind === 'ready' ? { ...current, loadingMore: true } : current));
    try {
      const page = await searchPage(filters, state.rows.length, controller.signal);
      if (controller.signal.aborted) return;
      update((current) => {
        if (current.kind !== 'ready') return current;
        // A listing can move between pages while scrolling; show it once.
        const seen = new Set(current.rows.map((row) => row.id));
        return {
          kind: 'ready',
          rows: [...current.rows, ...page.rows.filter((row) => !seen.has(row.id))],
          // An empty page means the end, whatever the count said.
          total: page.rows.length === 0 ? current.rows.length : page.total,
          loadingMore: false,
        };
      });
    } catch {
      if (!controller.signal.aborted) {
        update((current) =>
          current.kind === 'ready' ? { ...current, loadingMore: false } : current,
        );
      }
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadFirst();
    setRefreshing(false);
  };

  if (state.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state.kind === 'error') {
    return (
      <View style={styles.center}>
        <Text style={[styles.body, { color: colors.text }]}>{t('browse.loadFailed')}</Text>
        <Button title={t('browse.retry')} variant="secondary" onPress={() => void refresh()} />
      </View>
    );
  }

  return (
    <FlatList
      data={state.rows}
      keyExtractor={(row) => row.id}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.6}
      ListHeaderComponent={
        <Text style={[styles.small, { color: colors.textMuted }]}>
          {t('search.results', { count: state.total })}
        </Text>
      }
      ListEmptyComponent={
        <Text style={[styles.body, { color: colors.textMuted }]}>{t('search.noResults')}</Text>
      }
      ListFooterComponent={
        state.loadingMore ? (
          <ActivityIndicator style={styles.footer} />
        ) : state.rows.length > 0 && !hasMorePages(state.rows.length, state.total) ? (
          <Text style={[styles.small, styles.footer, { color: colors.textMuted }]}>
            {t('search.freshNote', { days: LISTING_FRESHNESS.confirmEveryDays })}
          </Text>
        ) : undefined
      }
      renderItem={({ item }) => (
        <ListingCard
          card={item}
          onPress={() => router.push({ pathname: '/listing/[id]', params: { id: item.id } })}
        />
      )}
    />
  );
}

/**
 * A segmented control. `stretch` fills the width with equal segments; otherwise each segment is
 * as wide as its label. (A growing segment inside an unsized row would take the whole row.)
 */
function Segments<T extends string>({
  value,
  options,
  onChange,
  stretch = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  stretch?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[styles.segments, { backgroundColor: colors.surface }]}
      accessibilityRole="radiogroup"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              stretch && styles.segmentStretch,
              selected && { backgroundColor: colors.background },
            ]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[
                styles.segmentText,
                { color: selected ? colors.text : colors.textMuted },
                selected && styles.segmentSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  toolbar: {
    paddingHorizontal: 16,
    paddingBottom: TOOLBAR_PADDING,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  filterButton: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexShrink: 1,
  },
  filterText: { fontSize: 15, fontWeight: '600' },
  segments: { flexDirection: 'row', borderRadius: 10, padding: 2 },
  segment: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  segmentStretch: { flex: 1 },
  segmentText: { fontSize: 14, textAlign: 'center' },
  segmentSelected: { fontWeight: '600' },
  list: { padding: 16, gap: 14 },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  small: { fontSize: 14, lineHeight: 20 },
  footer: { paddingVertical: 16, textAlign: 'center' },
});
