import type { Locale } from '@bairmair/i18n';

// The base map, shared by the web maps (maplibre-gl) and the app (MapLibre Native).

/**
 * OpenFreeMap's "liberty" style: free, commercial use, no key (decision in step 6). Tiles follow
 * the OpenMapTiles schema, which has no `name:mn`.
 */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Fonts served by OpenFreeMap's glyph endpoint (they cover Cyrillic). */
export const MAP_FONTS = {
  regular: ['Noto Sans Regular'],
  bold: ['Noto Sans Bold'],
} as const;

/** Where maps zoom to around a listing. */
export const LOCATION_ZOOM = { exact: 15.5, approximate: 14.5 } as const;

/** The glyph range holding the traditional Mongolian script (U+1800–U+18FF). */
export const TRADITIONAL_SCRIPT_GLYPHS = '/6144-6399.pbf';
/** Loaded in its place: Basic Latin, which every font has. */
export const BASIC_LATIN_GLYPHS = '/0-255.pbf';

/**
 * A few OSM names in Ulaanbaatar carry the traditional script after the Cyrillic ("Улаанбаатар
 * ᠤᠯᠠᠭᠠᠨ ᠪᠠᠭᠠᠲᠤᠷ"). MapLibre cannot lay out that script (vertical, joined letters), so it would
 * show loose letters, and style expressions cannot cut it out of a name. Loading the Basic Latin
 * range in place of that range leaves its characters without glyphs, and MapLibre skips
 * characters it has no glyph for. Our own tiles with `name:mn` would make this unnecessary (see
 * PROGRESS). The web passes this as `transformRequest`; the app registers the same rewrite with
 * MapLibre Native's TransformRequestManager.
 */
export function skipTraditionalScript(
  url: string,
  resourceType?: string,
): { url: string } | undefined {
  if (resourceType === 'Glyphs' && url.endsWith(TRADITIONAL_SCRIPT_GLYPHS)) {
    return { url: url.replace(TRADITIONAL_SCRIPT_GLYPHS, BASIC_LATIN_GLYPHS) };
  }
  return undefined;
}

/**
 * The `text-field` for street and place labels. The style shows "Latin\nlocal" for every name;
 * in Mongolian we show the Cyrillic name only, in English the English or transliterated one.
 */
export function nameLabel(locale: Locale): unknown[] {
  return locale === 'mn'
    ? ['coalesce', ['get', 'name:nonlatin'], ['get', 'name'], ['get', 'name:latin']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']];
}

/** Whether a symbol layer's `text-field` shows a feature name (not a house number or a ref). */
export function showsName(textField: unknown): boolean {
  return textField !== undefined && JSON.stringify(textField).includes('"name');
}

interface StyleLayerLike {
  type: string;
  layout?: Record<string, unknown>;
}

/**
 * A copy of a style JSON with name labels in the UI language (see `nameLabel`). For maps that
 * take the style as an object (the app); the web changes the loaded map instead.
 */
export function localizeStyle<T extends { layers: readonly StyleLayerLike[] }>(
  style: T,
  locale: Locale,
): T {
  const label = nameLabel(locale);
  return {
    ...style,
    layers: style.layers.map((layer) =>
      layer.type === 'symbol' && layer.layout && showsName(layer.layout['text-field'])
        ? { ...layer, layout: { ...layer.layout, 'text-field': label } }
        : layer,
    ),
  };
}

/** Radius of the "approximate location" circle: the public pin is a 0.0025° cell centre. */
export const APPROXIMATE_RADIUS_M = 200;

/** Pixels per metre at a zoom level and latitude (Web Mercator, 512 px tiles). */
export function pixelsPerMeter(zoom: number, lat: number): number {
  const metersPerPixel = (40_075_016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
  return 1 / metersPerPixel;
}

/**
 * `circle-radius` for a circle of `meters` at every zoom between 10 and 18 (pixels double per
 * zoom level).
 */
export function metersCircleRadius(meters: number, lat: number): unknown[] {
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    10,
    meters * pixelsPerMeter(10, lat),
    18,
    meters * pixelsPerMeter(18, lat),
  ];
}
