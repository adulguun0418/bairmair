import { describe, expect, it } from 'vitest';
import { dbErrorKey } from '../src/errors';
import {
  BUCKETS,
  avatarPath,
  listingPhotoPath,
  publicObjectUrl,
  scanModelPaths,
  scanRawPaths,
} from '../src/storage';

const LISTING = '0b6f3c1e-8a52-4c1f-9f0e-2d7b5a9c4e11';
const OTHER = 'f2a9d7c4-1b3e-4f60-8c25-7e9d0a1b2c33';

describe('storage paths', () => {
  it('puts the listing id first, as the storage policies expect', () => {
    expect(listingPhotoPath(LISTING, OTHER)).toBe(`${LISTING}/${OTHER}.jpg`);
    expect(scanRawPaths(LISTING, OTHER)).toEqual({
      json: `${LISTING}/${OTHER}/capture.json`,
      usdz: `${LISTING}/${OTHER}/capture.usdz`,
    });
    expect(scanModelPaths(LISTING, OTHER)).toEqual({
      model: `${LISTING}/${OTHER}/model.json`,
      floorPlanPng: `${LISTING}/${OTHER}/floorplan.png`,
    });
    expect(avatarPath(OTHER)).toBe(`${OTHER}/avatar.jpg`);
  });

  it('rejects ids that would break the path checks', () => {
    expect(() => listingPhotoPath('../etc', OTHER)).toThrow(/listingId/);
    expect(() => listingPhotoPath(LISTING.toUpperCase(), OTHER)).toThrow(/listingId/);
    expect(() => scanRawPaths(LISTING, `${OTHER}/x`)).toThrow(/scanId/);
    expect(() => avatarPath('')).toThrow(/userId/);
  });

  it('builds public object URLs', () => {
    expect(
      publicObjectUrl('https://abc.supabase.co/', BUCKETS.listingPhotos, `${LISTING}/a b.jpg`),
    ).toBe(`https://abc.supabase.co/storage/v1/object/public/listing-photos/${LISTING}/a%20b.jpg`);
  });
});

describe('dbErrorKey', () => {
  it('recognizes keys raised by our SQL and nothing else', () => {
    expect(dbErrorKey({ message: 'publish_requires_photo' })).toBe('publish_requires_photo');
    expect(dbErrorKey({ message: 'rate_limited' })).toBe('rate_limited');
    expect(dbErrorKey({ message: 'duplicate key value violates unique constraint' })).toBeNull();
    expect(dbErrorKey(null)).toBeNull();
  });
});
