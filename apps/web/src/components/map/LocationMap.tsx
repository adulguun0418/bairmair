'use client';

import { APPROXIMATE_RADIUS_M, LOCATION_ZOOM, metersCircleRadius } from '@bairmair/browse';
import { createTranslator, type Locale } from '@bairmair/i18n';
import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl';
import { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  canShowMap,
  localizeLabels,
  MAP_STYLE_URL,
  setUpWorker,
  skipTraditionalScript,
} from './map-style';

// This module loads in the browser only (see maps.tsx).
setUpWorker();

/**
 * A listing's public location: a marker when the owner shows the exact spot, otherwise a shaded
 * circle around the approximate pin. Scroll zoom is off so the page scrolls past it.
 */
export default function LocationMap({
  lat,
  lng,
  exact,
  locale,
}: {
  lat: number;
  lng: number;
  exact: boolean;
  locale: Locale;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const container = useRef<HTMLDivElement>(null);
  const [supported] = useState(canShowMap);

  useEffect(() => {
    const element = container.current;
    if (!supported || !element) return;
    const map = new MapLibreMap({
      container: element,
      style: MAP_STYLE_URL,
      center: [lng, lat],
      zoom: exact ? LOCATION_ZOOM.exact : LOCATION_ZOOM.approximate,
      minZoom: 10,
      maxZoom: exact ? 18 : 16,
      scrollZoom: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      transformRequest: skipTraditionalScript,
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      localizeLabels(map, locale);
      if (exact) {
        new Marker({ color: '#1c1917' }).setLngLat([lng, lat]).addTo(map);
        return;
      }
      map.addSource('approximate', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lng, lat] },
          properties: {},
        },
      });
      map.addLayer({
        id: 'approximate',
        type: 'circle',
        source: 'approximate',
        paint: {
          'circle-radius': metersCircleRadius(
            APPROXIMATE_RADIUS_M,
            lat,
          ) as DataDrivenPropertyValueSpecification<number>,
          'circle-color': '#f59e0b',
          'circle-opacity': 0.25,
          'circle-stroke-color': '#b45309',
          'circle-stroke-width': 2,
        },
      });
    });

    return () => map.remove();
  }, [supported, lat, lng, exact, locale]);

  if (!supported) {
    return (
      <div className="flex h-full items-center justify-center bg-stone-100 p-4 text-center text-sm text-stone-600">
        {t('map.unsupported')}
      </div>
    );
  }
  return <div ref={container} className="h-full w-full" aria-label={t('listingPage.mapLabel')} />;
}
