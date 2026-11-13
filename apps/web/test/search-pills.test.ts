import { DEFAULT_FILTERS } from '@bairmair/browse';
import { createTranslator } from '@bairmair/i18n';
import { describe, expect, it } from 'vitest';
import {
  areaLabel,
  districtsLabel,
  priceLabel,
  rangeLabel,
  roomsLabel,
} from '../src/lib/search-pills';

const mn = createTranslator('mn');
const en = createTranslator('en');

describe('search pill labels', () => {
  it('are null while the filter is not set', () => {
    expect(districtsLabel(DEFAULT_FILTERS, 'mn')).toBeNull();
    expect(roomsLabel(DEFAULT_FILTERS, mn)).toBeNull();
    expect(priceLabel(DEFAULT_FILTERS, mn)).toBeNull();
    expect(areaLabel(DEFAULT_FILTERS)).toBeNull();
  });

  it('name the first district and count the rest', () => {
    const filters = { ...DEFAULT_FILTERS, districts: ['khan-uul', 'bayangol'] };
    expect(districtsLabel(filters, 'mn')).toBe('Хан-Уул +1');
    expect(districtsLabel({ ...filters, districts: ['khan-uul'] }, 'en')).toBe('Khan-Uul');
  });

  it('list room counts, the last chip as "5+"', () => {
    expect(roomsLabel({ ...DEFAULT_FILTERS, rooms: [2, 3, 5] }, mn)).toBe('2, 3, 5+ өрөө');
    expect(roomsLabel({ ...DEFAULT_FILTERS, rooms: [1] }, en)).toBe('Rooms: 1');
  });

  it('show ranges with one unit', () => {
    expect(rangeLabel(100, 300, 'м²')).toBe('100–300 м²');
    expect(rangeLabel(null, 300, 'м²')).toBe('≤ 300 м²');
    expect(rangeLabel(40, null, 'м²')).toBe('≥ 40 м²');
    expect(priceLabel({ ...DEFAULT_FILTERS, priceMax: 300 }, mn)).toBe('≤ 300 сая ₮');
    expect(
      priceLabel({ ...DEFAULT_FILTERS, type: 'rent', currency: 'USD', priceMin: 800 }, mn),
    ).toBe('≥ 800 $');
  });
});
