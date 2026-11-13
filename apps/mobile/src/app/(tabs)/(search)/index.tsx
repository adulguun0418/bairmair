import { activeFilterCount, type SearchFilters } from '@bairmair/browse';
import { LISTING_FRESHNESS, SEARCH_LIMITS, type SearchListingRow } from '@bairmair/db';
import { Stack, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { ListingCard } from '@/browse/listing-card';
import { hasMorePages, searchPage } from '@/browse/search';
import { setSearchFilters, useSearchFilters } from '@/browse/search-store';
import { useI18n } from '@/i18n/i18n';
import { BlueprintGrid } from '@/ui/blueprint';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { radius, useColors } from '@/ui/theme';
import { Text } from '@/ui/text';

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
  const filters = useSearchFilters();
  // With a search bar (and on iOS 26 always) the iOS header is translucent and the screen starts
  // under it. The list insets itself; this fixed toolbar has to start below the header itself.
  const headerHeight = useHeaderHeight();
  const map = filters.view === 'map';

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
          { paddingTop: (Platform.OS === 'ios' ? headerHeight : 0) + TOOLBAR_PADDING },
        ]}
      >
        <View style={styles.toolbarRow}>
          <Segments
            value={filters.type ?? 'all'}
            options={(['all', 'sale', 'rent'] as const).map((type) => ({
              value: type,
              label: t(`search.types.${type}`),
            }))}
            onChange={(type) => setSearchFilters({ type: type === 'all' ? null : type })}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={map ? t('search.views.list') : t('search.views.map')}
            onPress={() => setSearchFilters({ view: map ? 'list' : 'map' })}
            style={({ pressed }) => [
              styles.viewButton,
              { backgroundColor: colors.primary, transform: [{ scale: pressed ? 0.94 : 1 }] },
            ]}
          >
            <Icon name={map ? 'list' : 'map'} size={19} color={colors.onPrimary} />
          </Pressable>
        </View>
        <QuickFilters filters={filters} />
      </View>
      {map ? (
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

/**
 * One swipeable row of the filters people change most: the full sheet, 3D only, and room
 * counts. Each chip applies at once.
 */
function QuickFilters({ filters }: { filters: SearchFilters }) {
  const { t } = useI18n();
  const router = useRouter();
  const filterCount = activeFilterCount(filters);
  const toggleRooms = (count: number) =>
    setSearchFilters({
      rooms: filters.rooms.includes(count)
        ? filters.rooms.filter((value) => value !== count)
        : [...filters.rooms, count].sort((a, b) => a - b),
    });
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.quick}
      style={styles.quickScroll}
    >
      <QuickChip
        icon="filter"
        label={
          filterCount > 0 ? t('browse.filtersCount', { count: filterCount }) : t('search.filters')
        }
        selected={filterCount > 0}
        onPress={() => router.push('/search-filters')}
      />
      <QuickChip
        icon="cube"
        label={t('listingCard.has3d')}
        selected={filters.has3d}
        onPress={() => setSearchFilters({ has3d: !filters.has3d })}
      />
      {Array.from({ length: SEARCH_LIMITS.roomsPlus }, (_, index) => {
        const count = index + 1;
        return (
          <QuickChip
            key={count}
            label={
              count === SEARCH_LIMITS.roomsPlus
                ? t('home.roomsPlusOption', { count })
                : t('home.roomsOption', { count })
            }
            selected={filters.rooms.includes(count)}
            onPress={() => toggleRooms(count)}
          />
        );
      })}
    </ScrollView>
  );
}

function QuickChip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  const foreground = selected ? colors.onPrimary : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickChip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          transform: [{ scale: pressed ? 0.95 : 1 }],
        },
      ]}
    >
      {icon && <Icon name={icon} size={15} color={selected ? colors.onPrimary : colors.brand} />}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={[styles.quickText, { color: foreground }]}
      >
        {label}
      </Text>
    </Pressable>
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
        <View style={styles.listHeader}>
          <Text style={[styles.count, { color: colors.text }]}>
            {t('search.results', { count: state.total })}
          </Text>
          <Text style={[styles.small, { color: colors.textMuted }]} numberOfLines={1}>
            {t(`search.sorts.${filters.sort}`)}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <View
          style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <BlueprintGrid />
          <Icon name="search" size={28} color={colors.brand} />
          <Text style={[styles.body, { color: colors.textMuted }]}>{t('search.noResults')}</Text>
        </View>
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

/** The sale/rent switch: a pill track with the selected type in navy. */
function Segments<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const colors = useColors();
  return (
    <View
      style={[styles.segments, { backgroundColor: colors.surface2 }]}
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
            style={[styles.segment, selected && { backgroundColor: colors.primary }]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={[
                styles.segmentText,
                { color: selected ? colors.onPrimary : colors.textMuted },
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
  toolbar: { paddingBottom: TOOLBAR_PADDING, gap: 10 },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  viewButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickScroll: { flexGrow: 0 },
  quick: { paddingHorizontal: 16, gap: 8 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  quickText: { fontSize: 14, fontWeight: '600' },
  segments: { flex: 1, flexDirection: 'row', borderRadius: radius.pill, padding: 3, height: 44 },
  segment: { flex: 1, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 6 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 18 },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 4,
  },
  count: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  empty: {
    alignItems: 'center',
    gap: 12,
    padding: 32,
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  body: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
  small: { fontSize: 14, lineHeight: 20 },
  footer: { paddingVertical: 16, textAlign: 'center' },
});
