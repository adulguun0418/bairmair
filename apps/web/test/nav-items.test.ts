import { describe, expect, it } from 'vitest';
import { activeNav, navItems } from '@/components/header/nav-items';

const params = (query: string) => new URLSearchParams(query);

describe('activeNav', () => {
  it('marks the section of a search URL, in either language', () => {
    expect(activeNav('/search', params('type=sale'))).toBe('sale');
    expect(activeNav('/en/search', params('type=rent&rooms=2'))).toBe('rent');
  });

  it('prefers the map over the listing type', () => {
    expect(activeNav('/search', params('view=map&type=sale'))).toBe('map');
  });

  it('marks nothing elsewhere or for a search of every type', () => {
    expect(activeNav('/search', params(''))).toBeNull();
    expect(activeNav('/listings/abc', params('type=sale'))).toBeNull();
    expect(activeNav('/', params(''))).toBeNull();
  });
});

describe('navItems', () => {
  it('links to the sections in the page language', () => {
    expect(navItems('mn').map((item) => item.href)).toEqual([
      '/search?type=sale',
      '/search?type=rent',
      '/search?view=map',
    ]);
    expect(navItems('en')[0]?.href).toBe('/en/search?type=sale');
  });
});
