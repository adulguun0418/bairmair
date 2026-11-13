import type { MapPinRow } from '@bairmair/db';
import { formatPinPrice, formatPinPricePerArea, type Locale } from '@bairmair/i18n';

export interface PinProperties {
  id: string;
  /** "250 сая", "1.8 сая/сар" */
  label: string;
  /** "3.8 сая/м²"; null without an official area (the pin then keeps its price). */
  labelPerArea: string | null;
  has3d: boolean;
}

export interface PinFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: PinProperties;
}

export interface PinCollection {
  type: 'FeatureCollection';
  features: PinFeature[];
}

/**
 * Map pins for `search_listings` rows. Labels are formatted here, with the shared formatters,
 * so the map shows the same "250 сая" as cards and pages. Price per m² uses the official area,
 * like listing pages.
 */
export function pinCollection(rows: readonly MapPinRow[], locale: Locale): PinCollection {
  return {
    type: 'FeatureCollection',
    features: rows.map((row) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [row.lng, row.lat] },
      properties: {
        id: row.id,
        label: formatPinPrice(row.price, row.currency, row.type, locale),
        labelPerArea:
          row.area_official_m2 && row.area_official_m2 > 0 && row.price > 0
            ? formatPinPricePerArea(row.price / row.area_official_m2, row.currency, locale)
            : null,
        has3d: row.has_3d,
      },
    })),
  };
}

export interface Viewport {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * The area to load pins for: the visible map plus a margin on each side, so small pans need no
 * new request. Clamped to valid coordinates.
 */
export function paddedViewport(view: Viewport, margin = 0.25): Viewport {
  const width = view.east - view.west;
  const height = view.north - view.south;
  return {
    west: Math.max(-180, view.west - width * margin),
    south: Math.max(-90, view.south - height * margin),
    east: Math.min(180, view.east + width * margin),
    north: Math.min(90, view.north + height * margin),
  };
}

/** Whether `inner` lies entirely inside `outer` (the loaded area still covers the view). */
export function covers(outer: Viewport, inner: Viewport): boolean {
  return (
    inner.west >= outer.west &&
    inner.south >= outer.south &&
    inner.east <= outer.east &&
    inner.north <= outer.north
  );
}
