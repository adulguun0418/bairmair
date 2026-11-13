import {
  countInViewport,
  covers,
  fetchListingCards,
  MAP_FONTS,
  paddedViewport,
  pinCollection,
  type ListingCardData,
  type PinCollection,
  type SearchFilters,
  type Viewport,
} from '@bairmair/browse';
import { SEARCH_LIMITS, ULAANBAATAR_CENTER, type MapPinRow } from '@bairmair/db';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
  type GeoJSONSourceRef,
  type LngLat,
  type LngLatBounds,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/i18n/i18n';
import { supabase } from '@/lib/supabase';
import { Button } from '@/ui/button';
import { useColors } from '@/ui/theme';
import { ListingCard } from './listing-card';
import { PIN_IMAGES, useMapStyle } from './map-style';
import { searchPins } from './search';

/** Above this zoom, points stay clustered only when they share a spot (an approximate cell). */
const CLUSTER_MAX_ZOOM = 16;
const EMPTY: PinCollection = { type: 'FeatureCollection', features: [] };

/** Where the map was, so it reopens there within the same app run. */
let lastCamera: { center: LngLat; zoom: number } | null = null;

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; visible: number; truncated: boolean } | { kind: 'error' };

type LabelMode = 'price' | 'perArea';

function toViewport([west, south, east, north]: LngLatBounds): Viewport {
  return { west, south, east, north };
}

/**
 * Listings on a map, like the web's: price pins (3D listings amber), clustered when zoomed out,
 * loaded for the visible area with the search filters. Tapping a pin, or a cluster of listings
 * at one spot, shows their cards. Pins show the price or the price per m².
 */
export function SearchMap({ filters }: { filters: SearchFilters }) {
  const { t, locale } = useI18n();
  const colors = useColors();
  const router = useRouter();
  const style = useMapStyle(locale);

  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const sourceRef = useRef<GeoJSONSourceRef>(null);
  const loaded = useRef<{ area: Viewport; rows: MapPinRow[] } | null>(null);
  const request = useRef<AbortController | null>(null);

  const [pins, setPins] = useState<PinCollection>(EMPTY);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [mode, setMode] = useState<LabelMode>('price');
  const [selection, setSelection] = useState<string[] | null>(null);
  /** Cards of the selection they were loaded for. */
  const [loadedCards, setLoadedCards] = useState<{
    selection: string[];
    cards: ListingCardData[];
  } | null>(null);
  const cards = loadedCards && loadedCards.selection === selection ? loadedCards.cards : null;
  const [mapReady, setMapReady] = useState(false);

  const filtersKey = JSON.stringify(filters);

  /** Loads pins for the visible area unless the loaded ones still cover it. */
  const update = async (bounds: LngLatBounds, force = false) => {
    const visible = toViewport(bounds);
    const current = loaded.current;
    if (!force && current && covers(current.area, visible)) {
      setLoad({ kind: 'ready', visible: countInViewport(current.rows, visible), truncated: false });
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const area = paddedViewport(visible);
    setLoad({ kind: 'loading' });
    try {
      const rows = await searchPins(
        JSON.parse(filtersKey) as SearchFilters,
        area,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const truncated = rows.length >= SEARCH_LIMITS.mapPins;
      setPins(pinCollection(rows, locale));
      // A truncated area is never "covered": moving or zooming loads a fresh set.
      loaded.current = truncated ? null : { area, rows };
      setLoad({ kind: 'ready', visible: countInViewport(rows, visible), truncated });
    } catch {
      if (!controller.signal.aborted) setLoad({ kind: 'error' });
    }
  };

  const reload = () => {
    mapRef.current
      ?.getBounds()
      .then((bounds) => update(bounds, true))
      .catch(() => setLoad({ kind: 'error' }));
  };

  // New filters or language: load again for the current view.
  useEffect(() => {
    if (!mapReady) return;
    loaded.current = null;
    reload();
    // `reload` reads the latest filters through `filtersKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, filtersKey, locale]);

  useEffect(() => () => request.current?.abort(), []);

  // Cards of the picked listings.
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    fetchListingCards(supabase, selection, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setLoadedCards({ selection, cards: result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadedCards({ selection, cards: [] });
      });
    return () => controller.abort();
  }, [selection]);

  if (style.kind !== 'ready') {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        {style.kind === 'loading' ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text style={[styles.message, { color: colors.text }]}>{t('browse.loadFailed')}</Text>
            <Button title={t('browse.retry')} variant="secondary" onPress={style.retry} />
          </>
        )}
      </View>
    );
  }

  const pressPins = async (feature: GeoJSON.Feature | undefined) => {
    if (!feature || feature.geometry.type !== 'Point') return;
    const properties = feature.properties ?? {};
    const clusterId: unknown = properties.cluster_id;
    if (typeof clusterId !== 'number') {
      const id: unknown = properties.id;
      if (typeof id === 'string') setSelection([id]);
      return;
    }
    const source = sourceRef.current;
    if (!source) return;
    const center = feature.geometry.coordinates as LngLat;
    const zoom = await source.getClusterExpansionZoom(clusterId);
    if (zoom <= CLUSTER_MAX_ZOOM) {
      cameraRef.current?.easeTo({ center, zoom });
      return;
    }
    // Listings at one spot (approximate pins share a cell centre): list them.
    const leaves = await source.getClusterLeaves(clusterId, 50, 0);
    setSelection(
      leaves.flatMap((leaf) => {
        const id: unknown = leaf.properties?.id;
        return typeof id === 'string' ? [id] : [];
      }),
    );
  };

  const center: LngLat = lastCamera?.center ?? [ULAANBAATAR_CENTER.lng, ULAANBAATAR_CENTER.lat];

  return (
    <View style={styles.fill}>
      <Map
        ref={mapRef}
        style={styles.fill}
        mapStyle={style.style}
        touchRotate={false}
        touchPitch={false}
        compass={false}
        accessibilityLabel={t('map.label')}
        onDidFinishLoadingMap={() => setMapReady(true)}
        onRegionDidChange={(event) => {
          const { bounds, center: newCenter, zoom } = event.nativeEvent;
          lastCamera = { center: newCenter, zoom };
          void update(bounds);
        }}
        onPress={() => setSelection(null)}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center, zoom: lastCamera?.zoom ?? 11.5 }}
          minZoom={5}
          maxZoom={18}
        />
        <Images images={PIN_IMAGES} />
        <GeoJSONSource
          ref={sourceRef}
          id="listings"
          data={pins}
          cluster
          clusterMaxZoom={CLUSTER_MAX_ZOOM}
          clusterRadius={44}
          onPress={(event) => {
            event.stopPropagation();
            void pressPins(event.nativeEvent.features[0]);
          }}
        >
          <Layer
            id="listing-clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': '#1c1917',
              'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff',
            }}
          />
          <Layer
            id="listing-cluster-counts"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': [...MAP_FONTS.bold],
              'text-size': 13,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': '#ffffff' }}
          />
          <Layer
            id="listing-pins"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'icon-image': ['case', ['get', 'has3d'], 'pin-3d', 'pin'],
              'icon-text-fit': 'both',
              'icon-text-fit-padding': [2, 6, 2, 6],
              'icon-allow-overlap': true,
              'text-field':
                mode === 'price'
                  ? ['get', 'label']
                  : ['coalesce', ['get', 'labelPerArea'], ['get', 'label']],
              'text-font': [...MAP_FONTS.bold],
              'text-size': 12,
              'text-allow-overlap': true,
            }}
            paint={{ 'text-color': ['case', ['get', 'has3d'], '#451a03', '#1c1917'] }}
          />
        </GeoJSONSource>
      </Map>

      <View style={styles.top} pointerEvents="box-none">
        <View
          style={[styles.segments, { backgroundColor: colors.background }]}
          accessibilityRole="radiogroup"
          accessibilityLabel={t('map.labelMode')}
        >
          {(['price', 'perArea'] as const).map((value) => {
            const selected = mode === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setMode(value)}
                style={[styles.segment, selected && { backgroundColor: colors.text }]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: selected ? colors.background : colors.text },
                  ]}
                >
                  {value === 'price' ? t('map.showPrice') : t('map.showPerArea')}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <StatusPill load={load} onRetry={reload} />
      </View>

      {selection && (
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.small, { color: colors.textMuted }]}>
              {selection.length > 1 ? t('map.listingsHere', { count: selection.length }) : ''}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setSelection(null)} hitSlop={10}>
              <Text style={[styles.close, { color: colors.accent }]}>{t('map.close')}</Text>
            </Pressable>
          </View>
          {cards === null ? (
            <ActivityIndicator style={styles.sheetLoading} />
          ) : (
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetContent}>
              {cards.map((card) => (
                <ListingCard
                  key={card.id}
                  card={card}
                  compact
                  onPress={() =>
                    router.push({ pathname: '/listing/[id]', params: { id: card.id } })
                  }
                />
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

function StatusPill({ load, onRetry }: { load: LoadState; onRetry: () => void }) {
  const { t } = useI18n();
  const colors = useColors();
  const pill = [styles.pill, { backgroundColor: colors.background }];
  if (load.kind === 'loading') {
    return <Text style={[pill, styles.small, { color: colors.text }]}>{t('map.loading')}</Text>;
  }
  if (load.kind === 'error') {
    return (
      <Pressable accessibilityRole="button" onPress={onRetry} style={pill}>
        <Text style={[styles.small, { color: colors.danger }]}>
          {t('map.error')} {t('map.retry')}
        </Text>
      </Pressable>
    );
  }
  return (
    <Text style={[pill, styles.small, { color: colors.text }]}>
      {load.truncated ? t('map.truncated') : t('map.count', { count: load.visible })}
    </Text>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  message: { fontSize: 16, textAlign: 'center' },
  top: { position: 'absolute', top: 10, left: 10, right: 10, alignItems: 'center', gap: 8 },
  segments: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 3,
    alignSelf: 'flex-start',
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segment: { borderRadius: 15, paddingHorizontal: 12, paddingVertical: 6 },
  segmentText: { fontSize: 14, fontWeight: '600' },
  pill: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  small: { fontSize: 13 },
  sheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 16,
    padding: 10,
    gap: 6,
    maxHeight: '50%',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { fontSize: 15, fontWeight: '600' },
  sheetLoading: { padding: 24 },
  sheetList: { flexGrow: 0 },
  sheetContent: { gap: 8 },
});
