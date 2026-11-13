import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  expandRooms,
  hasFilters,
  pageArgs,
  pageCount,
  parseAmount,
  parseBounds,
  parseSearchParams,
  searchArgs,
  searchQuery,
} from '../src/search-filters';

describe('parseSearchParams', () => {
  it('reads an empty URL as the defaults', () => {
    expect(parseSearchParams({})).toEqual(DEFAULT_FILTERS);
  });

  it('reads every filter', () => {
    expect(
      parseSearchParams({
        type: 'rent',
        district: ['bayangol', 'khan-uul'],
        rooms: ['3', '2', '5'],
        currency: 'USD',
        priceMin: '800',
        priceMax: '1 500',
        areaMin: '40,5',
        has3d: '1',
        q: '  Зайсан ',
        sort: 'price_asc',
        page: '3',
        bbox: '106.8,47.9,106.9,47.95',
        view: 'map',
      }),
    ).toEqual({
      type: 'rent',
      // Districts follow the DISTRICTS order, not the URL order.
      districts: ['bayangol', 'khan-uul'],
      rooms: [2, 3, 5],
      currency: 'USD',
      priceMin: 800,
      priceMax: 1500,
      areaMin: 40.5,
      areaMax: null,
      has3d: true,
      q: 'Зайсан',
      sort: 'price_asc',
      bounds: { west: 106.8, south: 47.9, east: 106.9, north: 47.95 },
      page: 3,
      view: 'map',
    });
  });

  it('drops what it does not understand', () => {
    expect(
      parseSearchParams({
        type: 'lease',
        district: ['atlantis', 'khan-uul', 'khan-uul'],
        rooms: ['0', '2.5', '6', 'x', '2', '2'],
        priceMin: '-5',
        priceMax: 'cheap',
        sort: 'random',
        page: '-1',
        view: 'globe',
      }),
    ).toEqual({ ...DEFAULT_FILTERS, districts: ['khan-uul'], rooms: [2] });
  });

  it('keeps sales in tögrög and swaps a reversed range', () => {
    const filters = parseSearchParams({
      type: 'sale',
      currency: 'USD',
      areaMin: '90',
      areaMax: '50',
    });
    expect(filters.currency).toBe('MNT');
    expect([filters.areaMin, filters.areaMax]).toEqual([50, 90]);
  });

  it('caps the page where the database stops paging', () => {
    expect(parseSearchParams({ page: '100000' }).page).toBe(417);
  });
});

describe('searchQuery', () => {
  it('writes only what differs from the defaults', () => {
    expect(searchQuery(DEFAULT_FILTERS)).toBe('');
    expect(
      searchQuery({
        ...DEFAULT_FILTERS,
        type: 'sale',
        districts: ['khan-uul'],
        rooms: [2, 3],
        priceMax: 300,
        has3d: true,
        page: 2,
      }),
    ).toBe('?type=sale&district=khan-uul&rooms=2&rooms=3&priceMax=300&has3d=1');
  });

  it('goes back to page 1 on a change, unless a page is given', () => {
    const onPage3 = { ...DEFAULT_FILTERS, page: 3 };
    expect(searchQuery(onPage3, { view: 'map' })).toBe('?view=map');
    expect(searchQuery(onPage3, { page: 4 })).toBe('?page=4');
  });

  it('round-trips through the parser', () => {
    const filters = parseSearchParams({
      type: 'rent',
      district: 'chingeltei',
      currency: 'USD',
      priceMin: '500',
      q: 'River Garden',
      sort: 'newest',
      page: '2',
    });
    const raw = Object.fromEntries(new URLSearchParams(searchQuery(filters, { page: 2 })));
    expect(parseSearchParams(raw)).toEqual(filters);
  });
});

describe('searchArgs', () => {
  it('turns filters into RPC arguments, prices in tögrög', () => {
    expect(
      searchArgs({
        ...DEFAULT_FILTERS,
        type: 'sale',
        districts: ['sukhbaatar', 'khan-uul'],
        rooms: [1, 5],
        priceMin: 150,
        priceMax: 1.25,
        areaMax: 80,
        has3d: true,
        q: 'Зайсан',
      }),
    ).toEqual({
      p_sort: 'recommended',
      p_currency: 'MNT',
      p_type: 'sale',
      p_district_ids: [1, 5],
      p_rooms: [1, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      p_price_min: 150_000_000,
      p_price_max: 1_250_000,
      p_area_max: 80,
      p_has_3d: true,
      p_query: 'Зайсан',
    });
  });

  it('keeps dollar prices as they are', () => {
    const args = searchArgs({ ...DEFAULT_FILTERS, type: 'rent', currency: 'USD', priceMax: 1200 });
    expect(args).toMatchObject({ p_currency: 'USD', p_price_max: 1200 });
  });
});

describe('helpers', () => {
  it('parse amounts with a decimal comma or spaces', () => {
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('2 500')).toBe(2500);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('1e9')).toBeNull();
  });

  it('expand "5+" rooms', () => {
    expect(expandRooms([2, 3])).toEqual([2, 3]);
    expect(expandRooms([5])).toHaveLength(16);
  });

  it('page through results', () => {
    expect(pageArgs(1)).toEqual({ p_limit: 24, p_offset: 0 });
    expect(pageArgs(3)).toEqual({ p_limit: 24, p_offset: 48 });
    expect(pageCount(0)).toBe(1);
    expect(pageCount(49)).toBe(3);
  });

  it('tell whether anything narrows the search', () => {
    expect(hasFilters({ ...DEFAULT_FILTERS, type: 'sale', sort: 'newest', view: 'map' })).toBe(
      false,
    );
    expect(hasFilters({ ...DEFAULT_FILTERS, rooms: [2] })).toBe(true);
  });
});

describe('activeFilterCount', () => {
  it('counts each narrowing filter group once, not the text, type or sort', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...DEFAULT_FILTERS,
        type: 'rent',
        q: 'Зайсан',
        sort: 'newest',
        districts: ['khan-uul', 'bayangol'],
        rooms: [2, 3],
        priceMax: 300,
        areaMin: 40,
        areaMax: 80,
        has3d: true,
      }),
    ).toBe(5);
  });
});

describe('map area (bbox)', () => {
  const area = { west: 106.85, south: 47.88, east: 106.95, north: 47.94 };

  it('round-trips through the URL, rounded to 5 decimals', () => {
    const query = searchQuery(DEFAULT_FILTERS, {
      bounds: { west: 106.850001, south: 47.88, east: 106.95, north: 47.940004 },
    });
    expect(query).toBe('?bbox=106.85%2C47.88%2C106.95%2C47.94');
    expect(parseSearchParams({ bbox: '106.85,47.88,106.95,47.94' }).bounds).toEqual(area);
  });

  it('drops malformed or empty areas', () => {
    for (const bbox of ['', '1,2,3', 'a,b,c,d', '106.9,47.9,106.8,47.95', '0,95,1,96']) {
      expect(parseBounds(bbox)).toBeNull();
    }
  });

  it('narrows the RPC and counts as a filter, but not as a filter group', () => {
    const filters = { ...DEFAULT_FILTERS, bounds: area };
    expect(searchArgs(filters)).toMatchObject({
      p_west: 106.85,
      p_south: 47.88,
      p_east: 106.95,
      p_north: 47.94,
    });
    expect(hasFilters(filters)).toBe(true);
    expect(activeFilterCount(filters)).toBe(0);
  });
});
