import { describe, expect, it } from 'vitest';
import { ogImageVersion, type OgImageContent } from '@/lib/og-version';

const content: OgImageContent = {
  type: 'sale',
  price: 350_000_000,
  currency: 'MNT',
  rooms: 2,
  area_official_m2: 55,
  area_scanned_m2: 58.85,
  district_id: 2,
  complex_name: null,
  coverPhotoId: 'photo-1',
  scan: { rooms: 6, totalAreaM2: 58.85 },
};

describe('ogImageVersion', () => {
  it('is short and stable for the same content', () => {
    const version = ogImageVersion(content);
    expect(version).toMatch(/^[0-9a-z]{1,7}$/);
    expect(ogImageVersion({ ...content })).toBe(version);
  });

  it('changes with anything the picture shows', () => {
    const version = ogImageVersion(content);
    expect(ogImageVersion({ ...content, price: 340_000_000 })).not.toBe(version);
    expect(ogImageVersion({ ...content, coverPhotoId: 'photo-2' })).not.toBe(version);
    expect(ogImageVersion({ ...content, scan: { rooms: 7, totalAreaM2: 58.84 } })).not.toBe(
      version,
    );
    expect(ogImageVersion({ ...content, scan: null })).not.toBe(version);
  });
});
