import { randomInt, randomUUID } from 'node:crypto';
import { EMPTY_FORM, formToFields, type ListingFields } from '@bairmair/browse';
import { BUCKETS, listingPhotoPath, type Database } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addPhoto,
  confirmAvailable,
  deleteMyListing,
  fetchMyListings,
  loadMyListing,
  removePhoto,
  saveListingFields,
  savePhotoOrder,
  savePrivate,
  setListingStatus,
} from '@/lib/my-listings';
import { browserClient } from '@/lib/supabase-browser';

/**
 * The website's seller data layer (`src/lib/my-listings.ts`) against the dev project: the same
 * browser client, signed in as a throwaway user, through a listing's whole life: create, edit,
 * pin, photos, publish, still available, sold, delete. RLS, storage policies and the publish
 * rules are the real ones.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let userId = '';
const listingId = randomUUID();

/** A tiny valid JPEG is not needed: the bucket checks the content type, not the pixels. */
const jpeg = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' });

function fields(overrides: Partial<typeof EMPTY_FORM>): ListingFields {
  const result = formToFields({ ...EMPTY_FORM, ...overrides });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.fields;
}

beforeAll(async () => {
  const phone = `+9760${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  const signIn = await browserClient().auth.signInWithPassword({ phone, password });
  if (signIn.error) throw signIn.error;
});

afterAll(async () => {
  const { data } = await admin.storage.from(BUCKETS.listingPhotos).list(listingId);
  const paths = (data ?? []).map((entry) => `${listingId}/${entry.name}`);
  if (paths.length > 0) await admin.storage.from(BUCKETS.listingPhotos).remove(paths);
  await admin.from('listings').delete().eq('id', listingId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe('website seller data layer', () => {
  it('runs a listing from draft to published to sold, then deletes it', async () => {
    // Create a draft with only a title, then fill it in.
    const draft = await saveListingFields(listingId, fields({ title: 'Вэб тест байр' }), true);
    expect(draft.status).toBe('draft');

    const full = fields({
      title: 'Вэб тест байр',
      price: '250 000 000',
      rooms: '2',
      areaOfficial: '55,5',
      districtId: 5,
      floor: '4',
      totalFloors: '12',
    });
    const saved = await saveListingFields(listingId, full, false);
    expect(saved.price).toBe(250_000_000);
    expect(saved.area_official_m2).toBe(55.5);

    // Pin + unit number: insert first time, update the second.
    await savePrivate(listingId, { lat: 47.9, lng: 106.9 }, '12');
    await savePrivate(listingId, { lat: 47.901, lng: 106.901 }, '14');

    // Publishing without a photo is refused by the database.
    await expect(setListingStatus(listingId, 'published')).rejects.toBeTruthy();

    // Two photos, reordered, one removed.
    const first = await addPhoto(listingId, { blob: jpeg(), width: 4, height: 3 }, 0);
    const second = await addPhoto(listingId, { blob: jpeg(), width: 4, height: 3 }, 1);
    await savePhotoOrder([
      { ...second, sortOrder: 1 },
      { ...first, sortOrder: 0 },
    ]);
    let loaded = await loadMyListing(listingId, userId);
    expect(loaded?.photos.map((photo) => photo.id)).toEqual([second.id, first.id]);
    expect(loaded?.pin).toEqual({ lat: 47.901, lng: 106.901 });
    expect(loaded?.unitNumber).toBe('14');

    await removePhoto(listingId, first.id);
    const gone = await admin.storage
      .from(BUCKETS.listingPhotos)
      .exists(listingPhotoPath(listingId, first.id));
    expect(gone.data).toBe(false);

    // Publish, confirm availability, mark sold.
    const published = await setListingStatus(listingId, 'published');
    expect(published.status).toBe('published');
    expect(await confirmAvailable(listingId)).toEqual(expect.any(String));
    const sold = await setListingStatus(listingId, 'sold_or_rented');
    expect(sold.status).toBe('sold_or_rented');

    const mine = await fetchMyListings(userId);
    expect(mine.map((row) => row.id)).toContain(listingId);

    // Delete: files and row.
    await deleteMyListing(listingId);
    loaded = await loadMyListing(listingId, userId);
    expect(loaded).toBeNull();
    const photo = await admin.storage
      .from(BUCKETS.listingPhotos)
      .exists(listingPhotoPath(listingId, second.id));
    expect(photo.data).toBe(false);
  });

  it('cannot read or change another user’s listing', async () => {
    const other = await admin
      .from('listings')
      .select('id, owner_id')
      .neq('owner_id', userId)
      .limit(1)
      .maybeSingle();
    if (!other.data) return; // nothing to try against on an empty project
    // The editor always asks for the signed-in user's listing.
    expect(await loadMyListing(other.data.id, userId)).toBeNull();
    await expect(
      saveListingFields(other.data.id, fields({ title: 'Хакердсан гарчиг' }), false),
    ).rejects.toBeTruthy();
  });
});
