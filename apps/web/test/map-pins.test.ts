import type { MapPinRow } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import { skipTraditionalScript } from '@/components/map/map-style';
import { covers, paddedViewport, pinCollection } from '@/lib/map-pins';

/** The no-break space the formatters put between a number and its unit. */
const NB = ' ';

const sale: MapPinRow = {
  id: 'a',
  lat: 47.88,
  lng: 106.9,
  type: 'sale',
  price: 250_000_000,
  currency: 'MNT',
  area_official_m2: 65,
  has_3d: true,
};

describe('pinCollection', () => {
  it('makes GeoJSON points (lng, lat) with both labels', () => {
    const rent: MapPinRow = {
      ...sale,
      id: 'b',
      type: 'rent',
      price: 1200,
      currency: 'USD',
      area_official_m2: null,
      has_3d: false,
    };
    expect(pinCollection([sale, rent], 'mn')).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [106.9, 47.88] },
          properties: {
            id: 'a',
            label: `250${NB}сая`,
            labelPerArea: `3.8${NB}сая/м²`,
            has3d: true,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [106.9, 47.88] },
          properties: { id: 'b', label: '$1,200/сар', labelPerArea: null, has3d: false },
        },
      ],
    });
  });
});

describe('skipTraditionalScript', () => {
  const base = 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Bold';

  it('loads Basic Latin in place of the traditional Mongolian glyph range', () => {
    expect(skipTraditionalScript(`${base}/6144-6399.pbf`, 'Glyphs')).toEqual({
      url: `${base}/0-255.pbf`,
    });
  });

  it('leaves every other request alone', () => {
    expect(skipTraditionalScript(`${base}/1024-1279.pbf`, 'Glyphs')).toBeUndefined();
    expect(skipTraditionalScript('https://example.com/6144-6399.pbf', 'Tile')).toBeUndefined();
  });
});

describe('viewports', () => {
  const view = { west: 106.8, south: 47.8, east: 107.0, north: 48.0 };

  it('pads the loaded area by a quarter on each side', () => {
    const padded = paddedViewport(view);
    expect(padded.west).toBeCloseTo(106.75);
    expect(padded.east).toBeCloseTo(107.05);
    expect(padded.south).toBeCloseTo(47.75);
    expect(padded.north).toBeCloseTo(48.05);
    expect(paddedViewport({ west: -179, south: -89, east: 179, north: 89 })).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    });
  });

  it('knows when the loaded area still covers the view', () => {
    const loaded = paddedViewport(view);
    expect(covers(loaded, view)).toBe(true);
    expect(covers(loaded, { ...view, east: 107.1 })).toBe(false);
  });
});
