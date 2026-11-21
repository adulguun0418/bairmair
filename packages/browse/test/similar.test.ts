import type { SearchListingRow } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import { pickSimilar, type SimilarTarget } from '../src/similar';

const target: SimilarTarget = {
  id: 'self',
  type: 'sale',
  price: 300_000_000,
  currency: 'MNT',
  rooms: 2,
  district_id: 3,
};

function row(id: string, fields: Partial<SearchListingRow> = {}): SearchListingRow {
  return {
    id,
    owner_id: 'owner',
    type: 'sale',
    title: id,
    price: 300_000_000,
    currency: 'MNT',
    negotiable: false,
    rooms: 2,
    area_official_m2: 50,
    area_scanned_m2: null,
    floor: null,
    total_floors: null,
    district_id: 3,
    complex_name: null,
    lat: 47.9,
    lng: 106.9,
    show_exact_location: false,
    has_3d: false,
    scan_verified: false,
    cover_photo_id: null,
    published_at: '2026-11-01T00:00:00Z',
    last_confirmed_at: '2026-11-01T00:00:00Z',
    promotion_tier: null,
    total_count: 1,
    ...fields,
  };
}

const ids = (rows: SearchListingRow[]) => rows.map((r) => r.id);

describe('pickSimilar', () => {
  it('skips the listing itself, other types and duplicates', () => {
    const rows = [row('self'), row('a'), row('rent', { type: 'rent' }), row('a')];
    expect(ids(pickSimilar(target, rows))).toEqual(['a']);
  });

  it('ranks by rooms, price, district and 3D', () => {
    const rows = [
      row('far-price', { price: 900_000_000 }),
      row('other-district', { district_id: 5 }),
      row('three-rooms', { rooms: 3 }),
      row('close', { price: 320_000_000 }),
      row('close-3d', { price: 320_000_000, has_3d: true }),
    ];
    // close-3d 9, close 8, other-district 6 and three-rooms 6 (tie: search order), far-price 5.
    expect(ids(pickSimilar(target, rows))).toEqual([
      'close-3d',
      'close',
      'other-district',
      'three-rooms',
    ]);
  });

  it('ignores price in another currency', () => {
    const rows = [
      row('usd', { currency: 'USD', price: 300_000_000 }),
      row('mnt', { price: 500_000_000 }),
    ];
    // mnt: price within a factor of two (+1); usd: no price points.
    expect(ids(pickSimilar(target, rows))).toEqual(['mnt', 'usd']);
  });

  it('keeps the search order on ties and respects the limit', () => {
    const rows = [row('1'), row('2'), row('3'), row('4'), row('5')];
    expect(ids(pickSimilar(target, rows, 3))).toEqual(['1', '2', '3']);
  });

  it('works without rooms or price on the target', () => {
    const rows = [row('plain'), row('scanned', { has_3d: true })];
    expect(ids(pickSimilar({ ...target, rooms: null, price: null }, rows))).toEqual([
      'scanned',
      'plain',
    ]);
  });
});
