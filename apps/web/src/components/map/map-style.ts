import { nameLabel, showsName } from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import {
  getWorkerUrl,
  setWorkerUrl,
  type AddLayerObject,
  type Map as MapLibreMap,
} from 'maplibre-gl';

// Style constants and pure helpers are shared with the app (@bairmair/browse); this file keeps
// what needs the browser and maplibre-gl.
export { MAP_FONTS, MAP_STYLE_URL, skipTraditionalScript } from '@bairmair/browse';

/**
 * MapLibre 6 starts its web worker from `maplibre-gl-worker.mjs` next to its own module file.
 * Once bundled, its module lives in a Next.js chunk, where that file does not exist ("Worker
 * failed to load") and maps never finish loading. The bundler emits the worker file as a static
 * asset through this `new URL(..., import.meta.url)` reference; point MapLibre at it. Call before
 * the first map is created.
 */
export function setUpWorker(): void {
  const url = new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href;
  if (getWorkerUrl() !== url) setWorkerUrl(url);
}

/** A symbol layer's `text-field` value (MapLibre does not export the type itself). */
type TextField = NonNullable<
  NonNullable<Extract<AddLayerObject, { type: 'symbol' }>['layout']>['text-field']
>;

/** Street and place labels in the page language (see `nameLabel`). */
export function localizeLabels(map: MapLibreMap, locale: Locale): void {
  const label = nameLabel(locale) as TextField;
  for (const layer of map.getStyle().layers) {
    if (layer.type !== 'symbol') continue;
    if (showsName(map.getLayoutProperty(layer.id, 'text-field') as unknown)) {
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
