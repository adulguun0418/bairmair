'use client';

import { isInMongolia, ULAANBAATAR_CENTER } from '@bairmair/db';
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

export interface Pin {
  lat: number;
  lng: number;
}

type LocateError = 'denied' | 'outside' | 'unavailable' | null;

/** Six decimals ≈ 0.1 m: plenty, and keeps the saved numbers short. */
const round = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * The listing's exact location: the seller clicks the building on the map or drags the pin
 * (the website's stand-in for the app's GPS). Points outside Mongolia are refused, matching the
 * database check. "Use my location" asks the browser, for sellers who are at the apartment.
 */
export default function PinPicker({
  pin,
  locale,
  onChange,
}: {
  pin: Pin | null;
  locale: Locale;
  onChange: (pin: Pin) => void;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const change = useRef(onChange);
  const [supported] = useState(canShowMap);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<LocateError>(null);

  useEffect(() => {
    change.current = onChange;
  });

  // The map, once.
  useEffect(() => {
    const element = container.current;
    if (!supported || !element) return;
    const start = pin ?? ULAANBAATAR_CENTER;
    const instance = new MapLibreMap({
      container: element,
      style: MAP_STYLE_URL,
      center: [start.lng, start.lat],
      zoom: pin ? 16 : 11.5,
      minZoom: 5,
      maxZoom: 19,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
      transformRequest: skipTraditionalScript,
    });
    instance.touchZoomRotate.disableRotation();
    instance.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    instance.on('load', () => localizeLabels(instance, locale));
    instance.on('click', (event) => {
      const next = { lat: round(event.lngLat.lat), lng: round(event.lngLat.lng) };
      if (isInMongolia(next.lat, next.lng)) change.current(next);
    });
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // The start position only matters once; later pins move the marker below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported, locale]);

  // The marker follows `pin`.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !pin) return;
    if (!marker.current) {
      const created = new Marker({ color: '#1c1917', draggable: true });
      created.on('dragend', () => {
        const at = created.getLngLat();
        const next = { lat: round(at.lat), lng: round(at.lng) };
        if (isInMongolia(next.lat, next.lng)) change.current(next);
        else created.setLngLat(at); // left where dropped; the saved pin stays as it was
      });
      marker.current = created.setLngLat([pin.lng, pin.lat]).addTo(instance);
    } else {
      marker.current.setLngLat([pin.lng, pin.lat]);
    }
  }, [pin]);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setError('unavailable');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = {
          lat: round(position.coords.latitude),
          lng: round(position.coords.longitude),
        };
        if (!isInMongolia(next.lat, next.lng)) {
          setError('outside');
          return;
        }
        change.current(next);
        map.current?.flyTo({ center: [next.lng, next.lat], zoom: 17 });
      },
      (failure) => {
        setLocating(false);
        setError(failure.code === failure.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  return (
    <div className="space-y-2">
      {supported ? (
        <div ref={container} className="h-72 w-full overflow-hidden rounded-xl bg-surface-3" />
      ) : (
        <p className="text-sm text-fg-muted">{t('map.unsupported')}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="rounded-full border border-line-2 px-3 py-1.5 hover:bg-surface-2 disabled:opacity-50"
        >
          {locating ? t('listingForm.locating') : t('listingForm.useCurrentLocation')}
        </button>
        {error && <span className="text-danger">{t(`listingForm.locationErrors.${error}`)}</span>}
      </div>
    </div>
  );
}
