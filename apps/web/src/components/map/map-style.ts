import type { Locale } from '@bairmair/i18n';
import type { AddLayerObject, Map as MapLibreMap } from 'maplibre-gl';

/** A symbol layer's `text-field` value (MapLibre does not export the type itself). */
type TextField = NonNullable<
  NonNullable<Extract<AddLayerObject, { type: 'symbol' }>['layout']>['text-field']
>;

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

/** The glyph range holding the traditional Mongolian script (U+1800–U+18FF). */
const TRADITIONAL_SCRIPT_GLYPHS = '/6144-6399.pbf';

/**
 * Pass as the map's `transformRequest`. A few OSM names in Ulaanbaatar carry the traditional
 * script after the Cyrillic ("Улаанбаатар ᠤᠯᠠᠭᠠᠨ ᠪᠠᠭᠠᠲᠤᠷ"). MapLibre cannot lay out that
 * script (vertical, joined letters), so it would show loose letters, and style expressions cannot
 * cut it out of a name. Loading the Basic Latin range in place of that range leaves its
 * characters without glyphs, and MapLibre skips characters it has no glyph for. Our own tiles with
 * `name:mn` would make this unnecessary (see PROGRESS).
 */
export function skipTraditionalScript(
  url: string,
  resourceType?: string,
): { url: string } | undefined {
  if (resourceType === 'Glyphs' && url.endsWith(TRADITIONAL_SCRIPT_GLYPHS)) {
    return { url: url.replace(TRADITIONAL_SCRIPT_GLYPHS, '/0-255.pbf') };
  }
  return undefined;
}

/**
 * Street and place labels in the page language. The style shows "Latin\nlocal" for every name;
 * in Mongolian we show the Cyrillic name only, in English the English or transliterated one.
 */
export function localizeLabels(map: MapLibreMap, locale: Locale): void {
  const label: TextField =
    locale === 'mn'
      ? ['coalesce', ['get', 'name:nonlatin'], ['get', 'name'], ['get', 'name:latin']]
      : [
          'coalesce',
          ['get', 'name:en'],
          ['get', 'name_en'],
          ['get', 'name:latin'],
          ['get', 'name'],
        ];
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    const field = map.getLayoutProperty(layer.id, 'text-field') as unknown;
    if (field !== undefined && JSON.stringify(field).includes('"name')) {
      map.setLayoutProperty(layer.id, 'text-field', label);
    }
  }
}

/**
 * A rounded label background for price pins, stretched around the text (`icon-text-fit`).
 * Drawn at 2x for sharp edges.
 */
export function addPinImage(map: MapLibreMap, id: string, fill: string, stroke: string): void {
  if (map.hasImage(id)) return;
  const ratio = 2;
  const width = 24 * ratio;
  const height = 20 * ratio;
  const radius = 8 * ratio;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = fill;
  context.strokeStyle = stroke;
  context.lineWidth = ratio;
  context.beginPath();
  context.roundRect(ratio / 2, ratio / 2, width - ratio, height - ratio, radius);
  context.fill();
  context.stroke();
  map.addImage(id, context.getImageData(0, 0, width, height), {
    pixelRatio: ratio,
    // Only the straight middle parts stretch, so the corners stay round.
    stretchX: [[radius, width - radius]],
    stretchY: [[radius, height - radius]],
    content: [radius / 2, ratio * 2, width - radius / 2, height - ratio * 2],
  });
}

/** Whether the browser has WebGL, which MapLibre needs. Creating the map is also guarded. */
export function canShowMap(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
