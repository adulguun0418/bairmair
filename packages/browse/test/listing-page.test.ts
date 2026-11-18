import twoRoom from '@bairmair/room-model/samples/two-room.json';
import { describe, expect, it } from 'vitest';
import { buildListingPage, type ListingPageInput, type ListingRow } from '../src/listing-page';

const LISTING_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '22222222-2222-4222-8222-222222222222';
const OLD_SCAN_ID = '33333333-3333-4333-8333-333333333333';
const PHOTO_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PHOTO_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHOTO_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const NOW = new Date('2026-11-15T12:00:00Z');

const listing = {
  id: LISTING_ID,
  type: 'sale',
  status: 'published',
  price: 260_000_000,
  currency: 'MNT',
  area_official_m2: 65,
  area_scanned_m2: 61.2,
  district_id: 5,
  last_confirmed_at: '2026-11-10T09:00:00Z',
} as ListingRow;

function input(overrides: Partial<ListingPageInput> = {}): ListingPageInput {
  return {
    listing,
    photos: [
      {
        id: PHOTO_A,
        width: 2048,
        height: 1536,
        sort_order: 0,
        scan_id: SCAN_ID,
        room_id: 'living',
      },
      // Assigned in an older scan: its room id means nothing now.
      {
        id: PHOTO_B,
        width: 2048,
        height: 1536,
        sort_order: 1,
        scan_id: OLD_SCAN_ID,
        room_id: 'living',
      },
      // A room the current model does not have.
      { id: PHOTO_C, width: null, height: null, sort_order: 2, scan_id: SCAN_ID, room_id: 'gone' },
    ],
    seller: {
      display_name: 'Бат',
      role: 'agent',
      agent_profiles: { agency_name: 'Гэр Хаус', verified: true },
    },
    scan: { id: SCAN_ID, room_labels: { bedroom: { label: 'bedroom', name: 'Хүүхдийн өрөө' } } },
    modelJson: twoRoom,
    stats: { listing_count: 4, median_price_per_m2: 3_500_000 },
    supabaseUrl: 'https://example.supabase.co/',
    now: NOW,
    ...overrides,
  };
}

describe('buildListingPage', () => {
  it('builds photo URLs from the ids and keeps only rooms of the current model', () => {
    const page = buildListingPage(input());
    expect(page.photos.map((photo) => [photo.src, photo.roomId])).toEqual([
      [
        `https://example.supabase.co/storage/v1/object/public/listing-photos/${LISTING_ID}/${PHOTO_A}.jpg`,
        'living',
      ],
      [expect.stringContaining(PHOTO_B), null],
      [expect.stringContaining(PHOTO_C), null],
    ]);
  });

  it("applies the seller's room labels and photo rooms to the model", () => {
    const { model } = buildListingPage(input());
    expect(model?.hotspots).toEqual([{ photoId: PHOTO_A, roomId: 'living' }]);
    expect(model?.rooms.find((room) => room.id === 'bedroom')?.name).toBe('Хүүхдийн өрөө');
  });

  it("applies the seller's dividers before labels and photo rooms", () => {
    // The sample's frame is the identity, so divider points are plan points. The living room
    // (x -3.925..0.275) is split at x = -1; its larger part keeps the id "living".
    const { model, photos } = buildListingPage(
      input({
        scan: {
          id: SCAN_ID,
          room_labels: { 'living~nook': { label: 'diningRoom' } },
          room_dividers: [{ id: 'nook', a: [-1, -3], b: [-1, 0] }],
        },
      }),
    );
    expect(model?.rooms.map((room) => room.id)).toContain('living~nook');
    expect(model?.rooms.find((room) => room.id === 'living~nook')?.label).toBe('diningRoom');
    expect(model?.dividers).toHaveLength(1);
    expect(photos[0]!.roomId).toBe('living');
  });

  it("applies the seller's front door, ignoring an unknown one", () => {
    const page = (entrance_door_id: string | null) =>
      buildListingPage(input({ scan: { id: SCAN_ID, room_labels: {}, entrance_door_id } }));
    const doorId = page(null).model!.doors[0]!.id;
    expect(page(doorId).model?.entranceDoorId).toBe(doorId);
    expect(page('not-a-door').model?.entranceDoorId).toBeUndefined();
    expect(page(null).model?.entranceDoorId).toBeUndefined();
  });

  it('shows no model when the file is missing or invalid, and then no photo rooms', () => {
    for (const modelJson of [null, { schemaVersion: 1, rooms: 'no' }]) {
      const page = buildListingPage(input({ modelJson }));
      expect(page.model).toBeNull();
      expect(page.photos.every((photo) => photo.roomId === null)).toBe(true);
    }
  });

  it('computes price per m² from the official area only', () => {
    expect(buildListingPage(input()).pricePerM2).toBe(4_000_000);
    const noOfficial = { ...listing, area_official_m2: null };
    expect(buildListingPage(input({ listing: noOfficial })).pricePerM2).toBeNull();
  });

  it('shows the district median only when enough listings back it', () => {
    expect(buildListingPage(input()).districtMedian).toEqual({
      pricePerM2: 3_500_000,
      listingCount: 4,
    });
    const few = { listing_count: 2, median_price_per_m2: 3_500_000 };
    expect(buildListingPage(input({ stats: few })).districtMedian).toBeNull();
  });

  it('tells whether the listing is still in search', () => {
    expect(buildListingPage(input()).freshness).toEqual({ fresh: true, daysAgo: 5 });
    const old = { ...listing, last_confirmed_at: '2026-10-30T09:00:00Z' };
    expect(buildListingPage(input({ listing: old })).freshness).toEqual({
      fresh: false,
      daysAgo: 16,
    });
    const sold = { ...listing, status: 'sold_or_rented' as const };
    expect(buildListingPage(input({ listing: sold })).freshness.fresh).toBe(false);
  });

  it('describes the seller', () => {
    expect(buildListingPage(input()).seller).toEqual({
      displayName: 'Бат',
      isAgent: true,
      agencyName: 'Гэр Хаус',
      verifiedAgent: true,
    });
    expect(buildListingPage(input({ seller: null })).seller).toEqual({
      displayName: null,
      isAgent: false,
      agencyName: null,
      verifiedAgent: false,
    });
  });
});
