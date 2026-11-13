import {
  BASIC_LATIN_GLYPHS,
  localizeStyle,
  MAP_STYLE_URL,
  TRADITIONAL_SCRIPT_GLYPHS,
} from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import { TransformRequestManager, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';

const SKIP_TRADITIONAL_SCRIPT = 'skip-traditional-script';
let requestsSetUp = false;

/**
 * Registers our request rewrites with MapLibre Native, once: glyph requests for the traditional
 * Mongolian script load Basic Latin instead (see `skipTraditionalScript` in @bairmair/browse).
 * Called by the map components rather than at startup, so the app still starts on a build
 * without the MapLibre module.
 */
function setUpMapRequests(): void {
  if (requestsSetUp) return;
  requestsSetUp = true;
  const range = TRADITIONAL_SCRIPT_GLYPHS.replace(/[.]/g, '\\.');
  TransformRequestManager.addUrlTransform({
    id: SKIP_TRADITIONAL_SCRIPT,
    match: `${range}$`,
    find: `${range}$`,
    replace: BASIC_LATIN_GLYPHS,
  });
}

let styleRequest: Promise<StyleSpecification> | null = null;

/** The base style JSON, fetched once per app run (a failed fetch is retried next time). */
function fetchStyle(): Promise<StyleSpecification> {
  styleRequest ??= fetch(MAP_STYLE_URL)
    .then(async (response) => {
      if (!response.ok) throw new Error(`map style: HTTP ${response.status}`);
      return (await response.json()) as StyleSpecification;
    })
    .catch((error: unknown) => {
      styleRequest = null;
      throw error;
    });
  return styleRequest;
}

export type MapStyleState =
  | { kind: 'loading' }
  | { kind: 'ready'; style: StyleSpecification }
  | { kind: 'error'; retry: () => void };

/**
 * OpenFreeMap's style with labels in the UI language. MapLibre Native takes the style as an
 * object, so the labels are changed before the map loads (the web changes the loaded map).
 */
export function useMapStyle(locale: Locale): MapStyleState {
  const [attempt, setAttempt] = useState(0);
  /** The fetched style or the failure, for one attempt; anything else is still loading. */
  const [result, setResult] = useState<{ attempt: number; style: StyleSpecification | null }>();

  useEffect(() => {
    setUpMapRequests();
    let active = true;
    fetchStyle()
      .then((style) => {
        if (active) setResult({ attempt, style });
      })
      .catch(() => {
        if (active) setResult({ attempt, style: null });
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const style = result?.attempt === attempt ? result.style : undefined;
  const localized = useMemo(() => (style ? localizeStyle(style, locale) : null), [style, locale]);

  if (style === undefined) return { kind: 'loading' };
  if (localized === null) return { kind: 'error', retry: () => setAttempt((n) => n + 1) };
  return { kind: 'ready', style: localized };
}

/** Pin backgrounds for `<Images>`, stretched around the price label (see scripts/pin-images.mjs). */
export const PIN_IMAGES = {
  pin: require('../../assets/map/pin.png') as number,
  'pin-3d': require('../../assets/map/pin-3d.png') as number,
};
