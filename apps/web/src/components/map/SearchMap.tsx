'use client';

import {
  MAP_PIN_COLUMNS,
  SEARCH_LIMITS,
  ULAANBAATAR_CENTER,
  type MapPinRow,
  type SearchListingsArgs,
} from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import {
  Map as MapLibreMap,
  NavigationControl,
  type AddLayerObject,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ListingCard } from '@/components/listing/ListingCard';
import { fetchListingCards, type ListingCardData } from '@bairmair/browse';
import {
  covers,
  paddedViewport,
  pinCollection,
  type PinCollection,
  type Viewport,
} from '@bairmair/browse';
import { publicClient } from '@/lib/supabase-public';
import {
  addPinImage,
  canShowMap,
  localizeLabels,
  MAP_FONTS,
  MAP_STYLE_URL,
  setUpWorker,
  skipTraditionalScript,
} from './map-style';

// This module loads in the browser only (see maps.tsx).
setUpWorker();

const SOURCE = 'listings';
const PINS = 'listing-pins';
const CLUSTERS = 'listing-clusters';
const CLUSTER_COUNTS = 'listing-cluster-counts';
/** Above this zoom, points stay clustered only when they share a spot (an approximate cell). */
const CLUSTER_MAX_ZOOM = 16;

const EMPTY: PinCollection = { type: 'FeatureCollection', features: [] };

/** Where the map was, so it reopens there after a filter change within the same visit. */
let lastCamera: { center: [number, number]; zoom: number } | null = null;

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; visible: number; truncated: boolean } | { kind: 'error' };

type LabelMode = 'price' | 'perArea';

const LAYERS: AddLayerObject[] = [
  {
    id: CLUSTERS,
    type: 'circle',
    source: SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#1c1917',
      'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  },
  {
    id: CLUSTER_COUNTS,
    type: 'symbol',
    source: SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': [...MAP_FONTS.bold],
      'text-size': 13,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  },
  {
    id: PINS,
    type: 'symbol',
    source: SOURCE,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['case', ['get', 'has3d'], 'pin-3d', 'pin'],
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [2, 6, 2, 6],
      'icon-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': [...MAP_FONTS.bold],
      'text-size': 12,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': ['case', ['get', 'has3d'], '#451a03', '#1c1917'] },
  },
];

/**
 * Listings on a map: price pins (3D listings highlighted), clustered when zoomed out. Pins load
 * for the visible area with the page's filters; a pin or a cluster of listings at one spot opens
 * their cards. Pins can show the price or the price per m².
 */
export default function SearchMap({
  locale,
  args,
  supabaseUrl,
}: {
  locale: Locale;
  /** The page's filters (no paging, no viewport). */
  args: SearchListingsArgs;
  supabaseUrl: string;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [supported] = useState(canShowMap);
  const [ready, setReady] = useState(false);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [mode, setMode] = useState<LabelMode>('price');
  const [selection, setSelection] = useState<string[] | null>(null);
  const [cards, setCards] = useState<ListingCardData[] | null>(null);
  const [attempt, setAttempt] = useState(0);
  const argsKey = JSON.stringify(args);

  // The map itself: created once.
  useEffect(() => {
    const element = container.current;
    if (!supported || !element) return;
    const map = new MapLibreMap({
      container: element,
      style: MAP_STYLE_URL,
      center: lastCamera?.center ?? [ULAANBAATAR_CENTER.lng, ULAANBAATAR_CENTER.lat],
      zoom: lastCamera?.zoom ?? 11.5,
      minZoom: 5,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      transformRequest: skipTraditionalScript,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    const pick = (ids: string[] | null) => {
      setSelection(ids);
      setCards(null);
    };

    map.on('load', () => {
      localizeLabels(map, locale);
      addPinImage(map, 'pin', '#ffffff', '#a8a29e');
      addPinImage(map, 'pin-3d', '#fcd34d', '#b45309');
      map.addSource(SOURCE, {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 44,
      });
      for (const layer of LAYERS) map.addLayer(layer);
      setReady(true);
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      lastCamera = { center: [center.lng, center.lat], zoom: map.getZoom() };
    });

    map.on('click', PINS, (event: MapLayerMouseEvent) => {
      const id: unknown = event.features?.[0]?.properties.id;
      if (typeof id === 'string') pick([id]);
    });
    map.on('click', CLUSTERS, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const clusterId: unknown = feature?.properties.cluster_id;
      if (!feature || typeof clusterId !== 'number' || feature.geometry.type !== 'Point') return;
      const center = feature.geometry.coordinates as [number, number];
      const source = map.getSource<GeoJSONSource>(SOURCE);
      if (!source) return;
      void (async () => {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (zoom <= CLUSTER_MAX_ZOOM) {
          map.easeTo({ center, zoom });
          return;
        }
        // Listings at one spot (approximate pins share a cell centre): list them.
        const leaves = await source.getClusterLeaves(clusterId, 50, 0);
        pick(
          leaves.flatMap((leaf) => {
            const id: unknown = leaf.properties?.id;
            return typeof id === 'string' ? [id] : [];
          }),
        );
      })();
    });
    map.on('click', (event) => {
      const hits = map.queryRenderedFeatures(event.point, { layers: [PINS, CLUSTERS] });
      if (hits.length === 0) pick(null);
    });
    for (const layer of [PINS, CLUSTERS]) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    return () => {
      mapRef.current = null;
      map.remove();
    };
  }, [supported, locale]);

  // Pins for the visible area, again whenever the filters change or the map moves out of the
  // loaded area.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const filters = JSON.parse(argsKey) as SearchListingsArgs;
    let controller: AbortController | null = null;
    let loaded: { area: Viewport; rows: MapPinRow[] } | null = null;

    const view = (): Viewport => {
      const bounds = map.getBounds();
      return {
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      };
    };
    const countVisible = (rows: readonly MapPinRow[], visible: Viewport) =>
      rows.filter(
        (row) =>
          row.lng >= visible.west &&
          row.lng <= visible.east &&
          row.lat >= visible.south &&
          row.lat <= visible.north,
      ).length;

    const update = async () => {
      const visible = view();
      if (loaded && covers(loaded.area, visible)) {
        const { rows } = loaded;
        setLoad({ kind: 'ready', visible: countVisible(rows, visible), truncated: false });
        return;
      }
      controller?.abort();
      const current = new AbortController();
      controller = current;
      const area = paddedViewport(visible);
      setLoad({ kind: 'loading' });
      const { data, error } = await publicClient()
        .rpc('search_listings', {
          ...filters,
          p_west: area.west,
          p_south: area.south,
          p_east: area.east,
          p_north: area.north,
          p_limit: SEARCH_LIMITS.mapPins,
          p_offset: 0,
        })
        .select(MAP_PIN_COLUMNS)
        .abortSignal(current.signal);
      if (current.signal.aborted) return;
      if (error) {
        setLoad({ kind: 'error' });
        return;
      }
      const rows = data as unknown as MapPinRow[];
      const truncated = rows.length >= SEARCH_LIMITS.mapPins;
      map.getSource<GeoJSONSource>(SOURCE)?.setData(pinCollection(rows, locale));
      // A truncated area is never "covered": moving or zooming loads a fresh set.
      loaded = truncated ? null : { area, rows };
      setLoad({ kind: 'ready', visible: countVisible(rows, view()), truncated });
    };

    void update();
    const onMoveEnd = () => void update();
    map.on('moveend', onMoveEnd);
    return () => {
      map.off('moveend', onMoveEnd);
      controller?.abort();
    };
  }, [ready, argsKey, locale, attempt]);

  // Price or price per m² on the pins.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty(
      PINS,
      'text-field',
      mode === 'price' ? ['get', 'label'] : ['coalesce', ['get', 'labelPerArea'], ['get', 'label']],
    );
  }, [mode, ready]);

  // Cards of the picked listings.
  useEffect(() => {
    if (!selection) return;
    const controller = new AbortController();
    fetchListingCards(publicClient(), selection, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setCards(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCards([]);
      });
    return () => controller.abort();
  }, [selection]);

  if (!supported) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-100 p-6 text-center text-stone-600">
        {t('map.unsupported')}
      </div>
    );
  }

  const modeButton = (value: LabelMode, label: string) => (
    <button
      type="button"
      aria-pressed={mode === value}
      onClick={() => setMode(value)}
      className={`rounded-full px-3 py-1 text-sm ${
        mode === value ? 'bg-stone-900 text-white' : 'text-stone-700'
      }`}
    >
      {label}
    </button>
  );

  const close = () => {
    setSelection(null);
    setCards(null);
  };

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="h-full w-full" aria-label={t('map.label')} />

      <div
        role="group"
        aria-label={t('map.labelMode')}
        className="absolute left-3 top-3 inline-flex rounded-full bg-white p-1 shadow"
      >
        {modeButton('price', t('map.showPrice'))}
        {modeButton('perArea', t('map.showPerArea'))}
      </div>

      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-3"
      >
        {load.kind === 'loading' && <Pill>{t('map.loading')}</Pill>}
        {load.kind === 'error' && (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-red-700 shadow">
            {t('map.error')}
            <button
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
              className="font-medium underline"
            >
              {t('map.retry')}
            </button>
          </span>
        )}
        {load.kind === 'ready' &&
          (load.truncated ? (
            <Pill>{t('map.truncated')}</Pill>
          ) : (
            <Pill>{t('map.count', { count: load.visible })}</Pill>
          ))}
      </div>

      {selection && (
        <div className="absolute inset-x-3 bottom-8 z-10 mx-auto max-w-md rounded-2xl bg-white/95 p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm text-stone-600">
              {selection.length > 1 ? t('map.listingsHere', { count: selection.length }) : ''}
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded-full px-3 py-1 text-sm font-medium hover:bg-stone-100"
            >
              {t('map.close')}
            </button>
          </div>
          {cards === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-stone-200" />
          ) : (
            <ul className="max-h-[45vh] space-y-2 overflow-y-auto">
              {cards.map((card) => (
                <li key={card.id} className="flex">
                  <ListingCard card={card} locale={locale} supabaseUrl={supabaseUrl} compact />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return <span className="rounded-full bg-white px-3 py-1 text-sm shadow">{children}</span>;
}
