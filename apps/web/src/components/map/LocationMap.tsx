'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
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

/** Radius of the "approximate location" circle: the public pin is a 0.0025° cell centre. */
const APPROXIMATE_RADIUS_M = 200;

/** Pixels per metre at a zoom level and latitude (Web Mercator, 512 px tiles). */
function pixelsPerMeter(zoom: number, lat: number): number {
  const metersPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  return 1 / metersPerPixel;
}

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
      zoom: exact ? 15.5 : 14.5,
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
          // A circle of APPROXIMATE_RADIUS_M at every zoom (pixels double per zoom level).
          'circle-radius': [
            'interpolate',
            ['exponential', 2],
            ['zoom'],
            10,
            APPROXIMATE_RADIUS_M * pixelsPerMeter(10, lat),
            18,
            APPROXIMATE_RADIUS_M * pixelsPerMeter(18, lat),
          ],
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
