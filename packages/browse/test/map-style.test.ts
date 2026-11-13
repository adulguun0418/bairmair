import { describe, expect, it } from 'vitest';
import { localizeStyle, metersCircleRadius, nameLabel, pixelsPerMeter } from '../src/map-style';

const style = {
  version: 8,
  layers: [
    { id: 'water', type: 'fill', paint: { 'fill-color': '#00f' } },
    {
      id: 'street-names',
      type: 'symbol',
      layout: { 'text-field': ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']] },
    },
    { id: 'house-numbers', type: 'symbol', layout: { 'text-field': ['get', 'housenumber'] } },
    { id: 'icons', type: 'symbol', layout: { 'icon-image': 'shop' } },
  ],
};

describe('localizeStyle', () => {
  it('relabels names in the UI language and leaves everything else alone', () => {
    const localized = localizeStyle(style, 'mn');
    expect(localized.layers[1]).toEqual({
      ...style.layers[1],
      layout: { 'text-field': nameLabel('mn') },
    });
    expect(localized.layers[0]).toBe(style.layers[0]);
    expect(localized.layers[2]).toBe(style.layers[2]);
    expect(localized.layers[3]).toBe(style.layers[3]);
    expect(localized.version).toBe(8);
  });

  it('does not change the style it was given', () => {
    const before = JSON.stringify(style);
    localizeStyle(style, 'en');
    expect(JSON.stringify(style)).toBe(before);
  });

  it('prefers the Cyrillic name in Mongolian and the English one in English', () => {
    expect(JSON.stringify(nameLabel('mn'))).toMatch(/^\["coalesce",\["get","name:nonlatin"\]/);
    expect(JSON.stringify(nameLabel('en'))).toMatch(/^\["coalesce",\["get","name:en"\]/);
  });
});

describe('metersCircleRadius', () => {
  it('doubles the pixel radius with every zoom level', () => {
    const lat = 47.9;
    expect(pixelsPerMeter(11, lat) / pixelsPerMeter(10, lat)).toBeCloseTo(2);
    const [, , , zoomLow, radiusLow, zoomHigh, radiusHigh] = metersCircleRadius(200, lat) as [
      unknown,
      unknown,
      unknown,
      number,
      number,
      number,
      number,
    ];
    expect([zoomLow, zoomHigh]).toEqual([10, 18]);
    expect(radiusHigh / radiusLow).toBeCloseTo(256);
    // At zoom 18 in Ulaanbaatar a pixel is about 0.2 m (512 px tiles): 200 m is ~1000 px.
    expect(radiusHigh).toBeCloseTo(999, 0);
  });
});
