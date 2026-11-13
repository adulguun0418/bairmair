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
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SearchIcon } from '@/components/icons';
import { ListingCard } from '@/components/listing/ListingCard';
import { LISTING_HOVER_EVENT } from '@/components/search/search-navigation';
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
/** The pin of the card under the pointer, drawn above everything (even inside a cluster). */
const HIGHLIGHT = 'listing-highlight';
/** The map area the list is limited to ("search this area"). */
const AREA = 'search-area';

/** Brand colours (maps keep their own light palette whatever the site theme). */
const NAVY = '#1a2b60';
const SKY = '#199ed6';
const INK = '#0e1733';
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
      'circle-color': NAVY,
      'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 24],
      'circle-stroke-width': 3,
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
    paint: { 'text-color': ['case', ['get', 'has3d'], '#ffffff', INK] },
  },
  {
    id: HIGHLIGHT,
    type: 'symbol',
    source: HIGHLIGHT,
    layout: {
      'icon-image': 'pin-active',
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [3, 8, 3, 8],
      'icon-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': [...MAP_FONTS.bold],
      'text-size': 13,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  },
];

/** The filters without a map area: the map loads pins for its own viewport. */
function withoutArea(args: SearchListingsArgs): SearchListingsArgs {
  const rest = { ...args };
  delete rest.p_west;
  delete rest.p_south;
  delete rest.p_east;
  delete rest.p_north;
  return rest;
}

interface AreaFeature {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}

const EMPTY_AREA = { type: 'FeatureCollection' as const, features: [] as AreaFeature[] };

function areaFeature(area: Viewport): AreaFeature {
  const { west, south, east, north } = area;
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

/**
 * Listings on a map: price pins (3D listings in navy), clustered when zoomed out. Pins load for
 * the visible area with the page's filters; a pin or a cluster of listings at one spot opens
 * their cards. Pins can show the price or the price per m².
 *
 * Beside the results list (`split`), the pin of the card under the pointer lights up, and after
 * the visitor moves the map, "Search this area" limits the list to the visible area.
 */
export default function SearchMap({
  locale,
  args,
  supabaseUrl,
  bounds = null,
  onSearchArea,
}: {
  locale: Locale;
  /** The page's filters (no paging; the map's own viewport replaces any map area). */
  args: SearchListingsArgs;
  supabaseUrl: string;
  /** The map area the results are limited to: the map opens on it and outlines it. */
  bounds?: Viewport | null;
  /** Shows "Search this area" after the map is moved, and reports the visible area. */
  onSearchArea?: (area: Viewport) => void;
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
  const [moved, setMoved] = useState(false);
  /** Loaded pins by listing id, for highlighting the hovered card's pin. */
  const pinsById = useRef(new Map<string, PinCollection['features'][number]>());
  const argsKey = JSON.stringify(withoutArea(args));
  const boundsKey = bounds ? JSON.stringify(bounds) : '';
  // Read once, when the map is created.
  const initialBounds = useRef(bounds);

  // The map itself: created once.
  useEffect(() => {
    const element = container.current;
    if (!supported || !element) return;
    const start = initialBounds.current;
    const map = new MapLibreMap({
      container: element,
      style: MAP_STYLE_URL,
      ...(start
        ? {
            bounds: [
              [start.west, start.south],
              [start.east, start.north],
            ] as [[number, number], [number, number]],
            fitBoundsOptions: { padding: 24 },
          }
        : {
            center: lastCamera?.center ?? [ULAANBAATAR_CENTER.lng, ULAANBAATAR_CENTER.lat],
            zoom: lastCamera?.zoom ?? 11.5,
          }),
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
      addPinImage(map, 'pin', '#ffffff', '#cfd6e3');
      addPinImage(map, 'pin-3d', NAVY, NAVY);
      addPinImage(map, 'pin-active', SKY, '#0e7cb0');
      map.addSource(AREA, { type: 'geojson', data: EMPTY_AREA });
      map.addLayer({
        id: `${AREA}-fill`,
        type: 'fill',
        source: AREA,
        paint: { 'fill-color': SKY, 'fill-opacity': 0.06 },
      });
      map.addLayer({
        id: `${AREA}-line`,
        type: 'line',
        source: AREA,
        paint: { 'line-color': NAVY, 'line-width': 2, 'line-dasharray': [2, 2] },
      });
      map.addSource(SOURCE, {
        type: 'geojson',
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 44,
      });
      map.addSource(HIGHLIGHT, { type: 'geojson', data: EMPTY });
      for (const layer of LAYERS) map.addLayer(layer);
      setReady(true);
    });

    map.on('moveend', (event) => {
      const center = map.getCenter();
      lastCamera = { center: [center.lng, center.lat], zoom: map.getZoom() };
      // Moved by the visitor (not by fitting the map area): offer "Search this area".
      if ('originalEvent' in event && event.originalEvent) setMoved(true);
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
      const pins = pinCollection(rows, locale);
      pinsById.current = new Map(pins.features.map((pin) => [pin.properties.id, pin]));
      map.getSource<GeoJSONSource>(SOURCE)?.setData(pins);
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
    const label: ExpressionSpecification =
      mode === 'price' ? ['get', 'label'] : ['coalesce', ['get', 'labelPerArea'], ['get', 'label']];
    map.setLayoutProperty(PINS, 'text-field', label);
    map.setLayoutProperty(HIGHLIGHT, 'text-field', label);
  }, [mode, ready]);

  // The map area the list is limited to, outlined.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const area = boundsKey ? (JSON.parse(boundsKey) as Viewport) : null;
    map
      .getSource<GeoJSONSource>(AREA)
      ?.setData(area ? { type: 'FeatureCollection', features: [areaFeature(area)] } : EMPTY_AREA);
  }, [boundsKey, ready]);

  // The pin of the card under the pointer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const onHover = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail;
      const pin = id ? pinsById.current.get(id) : undefined;
      map
        .getSource<GeoJSONSource>(HIGHLIGHT)
        ?.setData(pin ? { type: 'FeatureCollection', features: [pin] } : EMPTY);
    };
    window.addEventListener(LISTING_HOVER_EVENT, onHover);
    return () => window.removeEventListener(LISTING_HOVER_EVENT, onHover);
  }, [ready]);

  const searchArea = () => {
    const map = mapRef.current;
    if (!map || !onSearchArea) return;
    const visible = map.getBounds();
    setMoved(false);
    onSearchArea({
      west: visible.getWest(),
      south: visible.getSouth(),
      east: visible.getEast(),
      north: visible.getNorth(),
    });
  };

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
      <div className="flex h-full items-center justify-center bg-surface-2 p-6 text-center text-fg-muted">
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
        mode === value ? 'bg-primary text-on-primary' : 'text-fg-2'
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
        className="absolute left-3 top-3 inline-flex rounded-full bg-surface p-1 shadow"
      >
        {modeButton('price', t('map.showPrice'))}
        {modeButton('perArea', t('map.showPerArea'))}
      </div>

      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-14 flex justify-center px-3"
      >
        {onSearchArea && moved ? (
          <button
            type="button"
            onClick={searchArea}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#1a2b60] px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-[#26397a]"
          >
            <SearchIcon className="size-4" />
            {t('search.searchArea')}
          </button>
        ) : load.kind === 'loading' ? (
          <Pill>{t('map.loading')}</Pill>
        ) : load.kind === 'error' ? (
          <span className="pointer-events-auto flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-sm text-danger shadow">
            {t('map.error')}
            <button
              type="button"
              onClick={() => setAttempt((count) => count + 1)}
              className="font-medium underline"
            >
              {t('map.retry')}
            </button>
          </span>
        ) : load.truncated ? (
          <Pill>{t('map.truncated')}</Pill>
        ) : (
          <Pill>{t('map.count', { count: load.visible })}</Pill>
        )}
      </div>

      {selection && (
        <div className="absolute inset-x-3 bottom-8 z-10 mx-auto max-w-md rounded-2xl bg-surface/95 p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm text-fg-muted">
              {selection.length > 1 ? t('map.listingsHere', { count: selection.length }) : ''}
            </span>
            <button
              type="button"
              onClick={close}
              className="rounded-full px-3 py-1 text-sm font-medium hover:bg-surface-2"
            >
              {t('map.close')}
            </button>
          </div>
          {cards === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-surface-3" />
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
  return <span className="rounded-full bg-surface px-3 py-1 text-sm shadow">{children}</span>;
}
