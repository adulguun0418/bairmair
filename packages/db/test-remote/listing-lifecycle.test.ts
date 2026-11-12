import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BUCKETS,
  CONTENT_TYPES,
  avatarPath,
  listingPhotoPath,
  scanRawPaths,
  type Database,
} from '../src/index';
import {
  TINY_JPEG,
  ZAISAN,
  admin,
  anonClient,
  createEmailUser,
  createUser,
  deleteCreatedUsers,
  env,
  removeFolders,
  snapped,
  type TestUser,
} from './helpers';

// One listing goes through its whole life: draft, location, photos, publish, contact, views,
// favorites, reports, scans, sold. Tests run in order and share state.

let alice: TestUser; // seller
let bob: TestUser; // buyer
const anon = anonClient();

const listingId = randomUUID();
const photoId = randomUUID();
const scan1 = randomUUID();
const scan2 = randomUUID();

const draft = {
  id: listingId,
  type: 'sale' as const,
  title: 'Зайсан хотхон, 3 өрөө',
  price: 450_000_000,
  rooms: 3,
  area_official_m2: 85.5,
  floor: 7,
  total_floors: 12,
  city_id: 1,
  district_id: 5, // Хан-Уул
  khoroo: 11,
  complex_name: 'Зайсан хотхон',
  mortgage_eligible: true,
};

beforeAll(async () => {
  alice = await createUser('alice');
  bob = await createUser('bob');
});

afterAll(async () => {
  await removeFolders(BUCKETS.listingPhotos, [listingId]);
  await removeFolders(BUCKETS.scanRaw, [listingId]);
  if (alice) await removeFolders(BUCKETS.avatars, [alice.id]);
  await deleteCreatedUsers();
});

describe('reference data', () => {
  it('anon reads Ulaanbaatar and its 9 districts', async () => {
    const { data, error } = await anon
      .from('districts')
      .select('slug, name_mn, cities(slug)')
      .order('sort_order');
    expect(error).toBeNull();
    expect(data).toHaveLength(9);
    expect(data?.[0]).toEqual({
      slug: 'sukhbaatar',
      name_mn: 'Сүхбаатар',
      cities: { slug: 'ulaanbaatar' },
    });
  });

  it('nobody writes it through the API', async () => {
    const { error } = await alice.client
      .from('cities')
      .insert({ id: 99, slug: 'x', name_mn: 'x', name_en: 'x' });
    expect(error?.code).toBe('42501');
  });
});

describe('profiles', () => {
  it('a profile is created on sign-up, named from the auth metadata', async () => {
    const { data } = await anon
      .from('profiles')
      .select('id, role, display_name')
      .eq('id', alice.id)
      .single();
    expect(data).toEqual({ id: alice.id, role: 'owner', display_name: 'Test alice' });
  });

  it('users edit their own name, never their role or someone else', async () => {
    const own = await alice.client
      .from('profiles')
      .update({ display_name: 'Алиса' })
      .eq('id', alice.id)
      .select('display_name')
      .single();
    expect(own.data?.display_name).toBe('Алиса');

    const role = await alice.client.from('profiles').update({ role: 'admin' }).eq('id', alice.id);
    expect(role.error?.code).toBe('42501');

    const other = await bob.client
      .from('profiles')
      .update({ display_name: 'hacked' })
      .eq('id', alice.id)
      .select();
    expect(other.data).toEqual([]);
  });

  it('avatars go only into the user’s own folder', async () => {
    const own = await alice.client.storage
      .from(BUCKETS.avatars)
      .upload(avatarPath(alice.id), TINY_JPEG, { contentType: CONTENT_TYPES.jpeg });
    expect(own.error).toBeNull();

    const other = await bob.client.storage
      .from(BUCKETS.avatars)
      .upload(avatarPath(alice.id), TINY_JPEG, { contentType: CONTENT_TYPES.jpeg, upsert: true });
    expect(other.error).not.toBeNull();
  });
});

describe('draft listing', () => {
  it('the owner creates a draft that nobody else can see', async () => {
    const { error } = await alice.client.from('listings').insert(draft);
    expect(error).toBeNull();

    expect((await anon.from('listings').select('id').eq('id', listingId)).data).toEqual([]);
    expect((await bob.client.from('listings').select('id').eq('id', listingId)).data).toEqual([]);
    const own = await alice.client
      .from('listings')
      .select('owner_id, status, has_3d')
      .eq('id', listingId)
      .single();
    expect(own.data).toEqual({ owner_id: alice.id, status: 'draft', has_3d: false });
  });

  it('cannot be created already published', async () => {
    // Rejected twice over: the publish checks in the BEFORE trigger run first (no photo can exist
    // yet), and the "insert own draft" RLS check would reject it after that.
    const id = randomUUID();
    const { error } = await alice.client
      .from('listings')
      .insert({ ...draft, id, status: 'published' });
    expect(error?.message).toBe('publish_requires_photo');
    expect((await admin.from('listings').select('id').eq('id', id)).data).toEqual([]);
  });

  it('server-maintained columns are not writable', async () => {
    for (const patch of [
      { has_3d: true },
      { area_scanned_m2: 200 },
      { public_lat: 47.9 },
      { published_at: new Date().toISOString() },
      { owner_id: bob.id },
    ]) {
      const { error } = await alice.client.from('listings').update(patch).eq('id', listingId);
      expect(error?.code, JSON.stringify(patch)).toBe('42501');
    }
  });

  it('enforces sale/rent field rules', async () => {
    const deposit = await alice.client.from('listings').update({ deposit: 1 }).eq('id', listingId);
    expect(deposit.error?.code).toBe('23514');
    const usd = await alice.client.from('listings').update({ currency: 'USD' }).eq('id', listingId);
    expect(usd.error?.code).toBe('23514');
  });

  it('a draft cannot jump to sold', async () => {
    const { error } = await alice.client
      .from('listings')
      .update({ status: 'sold_or_rented' })
      .eq('id', listingId);
    expect(error?.message).toBe('listing_not_published');
  });

  it('only the owner can edit or delete it', async () => {
    const edit = await bob.client
      .from('listings')
      .update({ title: 'hacked' })
      .eq('id', listingId)
      .select();
    expect(edit.data).toEqual([]);
    const del = await bob.client.from('listings').delete().eq('id', listingId).select();
    expect(del.data).toEqual([]);
  });
});

describe('location', () => {
  it('the exact point is private; the public pin is snapped to a grid cell', async () => {
    const { error } = await alice.client
      .from('listing_private')
      .insert({ listing_id: listingId, lat: ZAISAN.lat, lng: ZAISAN.lng, unit_number: '45' });
    expect(error).toBeNull();

    const pin = await alice.client
      .from('listings')
      .select('public_lat, public_lng')
      .eq('id', listingId)
      .single();
    expect(pin.data).toEqual({ public_lat: snapped(ZAISAN.lat), public_lng: snapped(ZAISAN.lng) });

    expect(
      (await bob.client.from('listing_private').select('*').eq('listing_id', listingId)).data,
    ).toEqual([]);
    expect((await anon.from('listing_private').select('*')).error?.code).toBe('42501');
  });

  it('rejects points outside Mongolia', async () => {
    const { error } = await alice.client
      .from('listing_private')
      .update({ lat: 0, lng: 0 })
      .eq('listing_id', listingId);
    expect(error?.code).toBe('23514');
  });

  it('shows the exact point only when the owner opts in', async () => {
    const exact = await alice.client
      .from('listings')
      .update({ show_exact_location: true })
      .eq('id', listingId)
      .select('public_lat, public_lng')
      .single();
    expect(exact.data).toEqual({ public_lat: ZAISAN.lat, public_lng: ZAISAN.lng });

    const approx = await alice.client
      .from('listings')
      .update({ show_exact_location: false })
      .eq('id', listingId)
      .select('public_lat, public_lng')
      .single();
    expect(approx.data).toEqual({
      public_lat: snapped(ZAISAN.lat),
      public_lng: snapped(ZAISAN.lng),
    });
  });
});

describe('photos and publishing', () => {
  it('publishing needs a photo', async () => {
    const { error } = await alice.client
      .from('listings')
      .update({ status: 'published' })
      .eq('id', listingId);
    expect(error?.message).toBe('publish_requires_photo');
  });

  it('only the owner uploads into the listing folder, and only images', async () => {
    const path = listingPhotoPath(listingId, photoId);
    const own = await alice.client.storage
      .from(BUCKETS.listingPhotos)
      .upload(path, TINY_JPEG, { contentType: CONTENT_TYPES.jpeg });
    expect(own.error).toBeNull();

    const other = await bob.client.storage
      .from(BUCKETS.listingPhotos)
      .upload(listingPhotoPath(listingId, randomUUID()), TINY_JPEG, {
        contentType: CONTENT_TYPES.jpeg,
      });
    expect(other.error).not.toBeNull();

    const gif = await alice.client.storage
      .from(BUCKETS.listingPhotos)
      .upload(listingPhotoPath(listingId, randomUUID()), TINY_JPEG, { contentType: 'image/gif' });
    expect(gif.error).not.toBeNull();
  });

  it('photo rows must point into the listing folder', async () => {
    const ok = await alice.client.from('listing_photos').insert({
      id: photoId,
      listing_id: listingId,
      storage_path: listingPhotoPath(listingId, photoId),
      width: 1600,
      height: 1200,
    });
    expect(ok.error).toBeNull();

    const outside = await alice.client
      .from('listing_photos')
      .insert({ listing_id: listingId, storage_path: `${randomUUID()}/x.jpg` });
    expect(outside.error?.code).toBe('23514');

    const roomWithoutScan = await alice.client.from('listing_photos').insert({
      listing_id: listingId,
      storage_path: listingPhotoPath(listingId, randomUUID()),
      room_id: 'room-1',
    });
    expect(roomWithoutScan.error?.code).toBe('23514');
  });

  it('draft photos are hidden from others', async () => {
    expect(
      (await anon.from('listing_photos').select('id').eq('listing_id', listingId)).data,
    ).toEqual([]);
  });

  it('publishes once complete, stamping published_at and last_confirmed_at', async () => {
    const { data, error } = await alice.client
      .from('listings')
      .update({ status: 'published' })
      .eq('id', listingId)
      .select('status, published_at, last_confirmed_at')
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe('published');
    expect(data?.published_at).not.toBeNull();
    expect(data?.last_confirmed_at).not.toBeNull();
  });

  it('anyone sees the published listing and its photos, never the exact point', async () => {
    const listing = await anon
      .from('listings')
      .select('id, public_lat, listing_photos(storage_path)')
      .eq('id', listingId)
      .single();
    expect(listing.data).toEqual({
      id: listingId,
      public_lat: snapped(ZAISAN.lat),
      listing_photos: [{ storage_path: listingPhotoPath(listingId, photoId) }],
    });
  });

  it('the owner confirms availability; nobody else can', async () => {
    const own = await alice.client.rpc('confirm_listing_available', { p_listing_id: listingId });
    expect(own.error).toBeNull();
    const other = await bob.client.rpc('confirm_listing_available', { p_listing_id: listingId });
    expect(other.error?.message).toBe('listing_not_available');
  });
});

describe('contact and views', () => {
  it('reveals the seller’s verified phone to anyone', async () => {
    const asAnon = await anon.rpc('reveal_listing_contact', { p_listing_id: listingId });
    expect(asAnon.error).toBeNull();
    expect(asAnon.data).toBe(alice.phone);

    const asBob = await bob.client.rpc('reveal_listing_contact', { p_listing_id: listingId });
    expect(asBob.data).toBe(alice.phone);
  });

  it('logs reveals with the caller’s hashed IP (the gateway passes it to SQL)', async () => {
    const { data } = await admin
      .from('contact_reveals')
      .select('viewer_id, ip_hash')
      .eq('listing_id', listingId)
      .order('id');
    const unknownHash = createHash('sha256').update('unknown').digest('hex');
    expect(data).toEqual([
      { viewer_id: null, ip_hash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      { viewer_id: bob.id, ip_hash: null },
    ]);
    expect(data?.[0]?.ip_hash).not.toBe(unknownHash);
  });

  it('forged IP headers do not change the rate-limit key', async () => {
    const forged = '203.0.113.7';
    const forgedHash = createHash('sha256').update(forged).digest('hex');
    const spoofer = (headers: Record<string, string>) =>
      createClient<Database>(env.url, env.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers },
      });

    // x-forwarded-for / x-real-ip sent by the client are ignored.
    const xff = await spoofer({ 'x-forwarded-for': forged, 'x-real-ip': forged }).rpc(
      'reveal_listing_contact',
      { p_listing_id: listingId },
    );
    expect(xff.error).toBeNull();

    // Cloudflare refuses requests that carry their own cf-connecting-ip (error 1000), so that
    // header cannot be forged either. If it ever let one through, the key must still not change.
    const cf = await spoofer({ 'cf-connecting-ip': forged }).rpc('reveal_listing_contact', {
      p_listing_id: listingId,
    });

    const { data } = await admin
      .from('contact_reveals')
      .select('ip_hash')
      .eq('listing_id', listingId)
      .is('viewer_id', null)
      .order('id');
    const hashes = data?.map((r) => r.ip_hash) ?? [];
    expect(hashes).toHaveLength(cf.error ? 2 : 3);
    expect(new Set(hashes).size).toBe(1);
    expect(hashes).not.toContain(forgedHash);
  });

  it('rate-limits anonymous reveals per IP (10 an hour)', async () => {
    let lastError: string | undefined;
    for (let i = 0; i < 10; i++) {
      const { error } = await anon.rpc('reveal_listing_contact', { p_listing_id: listingId });
      lastError = error?.message;
      if (error) break;
    }
    expect(lastError).toBe('rate_limited');
    const { count } = await admin
      .from('contact_reveals')
      .select('*', { count: 'exact', head: true })
      .eq('listing_id', listingId)
      .is('viewer_id', null);
    expect(count).toBe(10);
  });

  it('counts views from others, not the owner; only the owner reads them', async () => {
    await anon.rpc('record_listing_view', { p_listing_id: listingId });
    await bob.client.rpc('record_listing_view', { p_listing_id: listingId });
    await alice.client.rpc('record_listing_view', { p_listing_id: listingId });

    const own = await alice.client
      .from('listing_views')
      .select('views')
      .eq('listing_id', listingId)
      .single();
    expect(own.data?.views).toBe(2);
    expect(
      (await bob.client.from('listing_views').select('views').eq('listing_id', listingId)).data,
    ).toEqual([]);
  });
});

describe('favorites and reports', () => {
  it('favorites are private to their user', async () => {
    expect((await bob.client.from('favorites').insert({ listing_id: listingId })).error).toBeNull();
    expect((await bob.client.from('favorites').select('listing_id')).data).toEqual([
      { listing_id: listingId },
    ]);
    expect((await alice.client.from('favorites').select('listing_id')).data).toEqual([]);
  });

  it('a user reports a listing once; reports are private', async () => {
    const first = await bob.client
      .from('reports')
      .insert({ listing_id: listingId, reason: 'wrong_info', details: 'Талбай буруу' });
    expect(first.error).toBeNull();
    const again = await bob.client
      .from('reports')
      .insert({ listing_id: listingId, reason: 'fake' });
    expect(again.error?.code).toBe('23505');
    expect((await alice.client.from('reports').select('id')).data).toEqual([]);
    const status = await bob.client
      .from('reports')
      .update({ status: 'resolved' })
      .eq('listing_id', listingId);
    expect(status.error?.code).toBe('42501');
  });
});

describe('scans', () => {
  async function uploadRaw(user: TestUser, scanId: string) {
    const paths = scanRawPaths(listingId, scanId);
    // For a Blob body, supabase-js sends the Blob's own type and ignores `contentType`.
    const json = await user.client.storage
      .from(BUCKETS.scanRaw)
      .upload(paths.json, new Blob(['{}'], { type: CONTENT_TYPES.json }));
    const usdz = await user.client.storage
      .from(BUCKETS.scanRaw)
      .upload(paths.usdz, TINY_JPEG, { contentType: CONTENT_TYPES.usdz });
    return { paths, errors: [json.error, usdz.error] };
  }

  it('raw scan files are private to the owner', async () => {
    const { paths, errors } = await uploadRaw(alice, scan1);
    expect(errors).toEqual([null, null]);

    expect(
      (await alice.client.storage.from(BUCKETS.scanRaw).download(paths.json)).error,
    ).toBeNull();
    expect(
      (await bob.client.storage.from(BUCKETS.scanRaw).download(paths.json)).error,
    ).not.toBeNull();
    expect((await anon.storage.from(BUCKETS.scanRaw).download(paths.json)).error).not.toBeNull();

    const bobUpload = await uploadRaw(bob, randomUUID());
    expect(bobUpload.errors.every((e) => e !== null)).toBe(true);
  });

  it('the owner registers a scan but cannot mark it ready', async () => {
    const paths = scanRawPaths(listingId, scan1);
    const { error } = await alice.client.from('room_scans').insert({
      id: scan1,
      listing_id: listingId,
      raw_json_path: paths.json,
      usdz_path: paths.usdz,
      device_model: 'iPhone16,1',
      ios_version: '27.1',
      app_version: '0.1.0',
    });
    expect(error).toBeNull();

    const ready = await alice.client.from('room_scans').update({ status: 'ready' }).eq('id', scan1);
    expect(ready.error?.code).toBe('42501');
    expect((await anon.from('room_scans').select('id').eq('listing_id', listingId)).data).toEqual(
      [],
    );
  });

  it('a ready scan becomes current and gives the listing its 3D badge and scanned area', async () => {
    const { error } = await admin
      .from('room_scans')
      .update({ status: 'ready', schema_version: 1, metrics: { totalAreaM2: 84.274 } })
      .eq('id', scan1);
    expect(error).toBeNull();

    const listing = await anon
      .from('listings')
      .select('has_3d, area_scanned_m2')
      .eq('id', listingId)
      .single();
    expect(listing.data).toEqual({ has_3d: true, area_scanned_m2: 84.27 });
    const scans = await anon
      .from('room_scans')
      .select('id, is_current')
      .eq('listing_id', listingId);
    expect(scans.data).toEqual([{ id: scan1, is_current: true }]);
  });

  it('photos are assigned to a room of a scan of the same listing', async () => {
    const ok = await alice.client
      .from('listing_photos')
      .update({ scan_id: scan1, room_id: 'room-1' })
      .eq('id', photoId);
    expect(ok.error).toBeNull();

    const foreignScan = await alice.client
      .from('listing_photos')
      .update({ scan_id: randomUUID(), room_id: 'room-1' })
      .eq('id', photoId);
    expect(foreignScan.error?.code).toBe('23503');
  });

  it('a newer ready scan replaces the current one', async () => {
    const paths = scanRawPaths(listingId, scan2);
    await uploadRaw(alice, scan2);
    expect(
      (
        await alice.client.from('room_scans').insert({
          id: scan2,
          listing_id: listingId,
          raw_json_path: paths.json,
          usdz_path: paths.usdz,
        })
      ).error,
    ).toBeNull();
    await admin
      .from('room_scans')
      .update({ status: 'ready', schema_version: 1, metrics: { totalAreaM2: 90 } })
      .eq('id', scan2);

    const scans = await admin
      .from('room_scans')
      .select('id, is_current')
      .eq('listing_id', listingId)
      .order('created_at');
    expect(scans.data).toEqual([
      { id: scan1, is_current: false },
      { id: scan2, is_current: true },
    ]);
    const listing = await anon
      .from('listings')
      .select('area_scanned_m2')
      .eq('id', listingId)
      .single();
    expect(listing.data?.area_scanned_m2).toBe(90);
  });

  it('deleting scans clears photo rooms and the 3D badge', async () => {
    expect((await alice.client.from('room_scans').delete().eq('id', scan1)).error).toBeNull();
    const photo = await alice.client
      .from('listing_photos')
      .select('scan_id, room_id')
      .eq('id', photoId)
      .single();
    expect(photo.data).toEqual({ scan_id: null, room_id: null });

    expect((await alice.client.from('room_scans').delete().eq('id', scan2)).error).toBeNull();
    const listing = await anon
      .from('listings')
      .select('has_3d, area_scanned_m2')
      .eq('id', listingId)
      .single();
    expect(listing.data).toEqual({ has_3d: false, area_scanned_m2: null });
  });
});

describe('agents', () => {
  it('an agent profile makes the user an agent; verification is admin-only', async () => {
    const { error } = await bob.client
      .from('agent_profiles')
      .insert({ agency_name: 'Тест Realty', bio: 'Test' });
    expect(error).toBeNull();
    const profile = await anon.from('profiles').select('role').eq('id', bob.id).single();
    expect(profile.data?.role).toBe('agent');

    const verify = await bob.client
      .from('agent_profiles')
      .update({ verified: true })
      .eq('profile_id', bob.id);
    expect(verify.error?.code).toBe('42501');
  });
});

describe('accounts without a verified phone (Apple / Google sign-in)', () => {
  it('can draft but not publish', async () => {
    const carol = await createEmailUser('carol');
    const id = randomUUID();
    const photo = randomUUID();
    expect((await carol.client.from('listings').insert({ ...draft, id })).error).toBeNull();
    expect(
      (await carol.client.from('listing_private').insert({ listing_id: id, ...ZAISAN })).error,
    ).toBeNull();
    expect(
      (
        await carol.client
          .from('listing_photos')
          .insert({ id: photo, listing_id: id, storage_path: listingPhotoPath(id, photo) })
      ).error,
    ).toBeNull();

    const { error } = await carol.client
      .from('listings')
      .update({ status: 'published' })
      .eq('id', id);
    expect(error?.message).toBe('publish_requires_verified_phone');
  });
});

describe('sold', () => {
  it('a sold listing stays visible but its contact is no longer revealed', async () => {
    expect(
      (await alice.client.from('listings').update({ status: 'sold_or_rented' }).eq('id', listingId))
        .error,
    ).toBeNull();
    expect(
      (await anon.from('listings').select('status').eq('id', listingId).single()).data,
    ).toEqual({ status: 'sold_or_rented' });
    const reveal = await bob.client.rpc('reveal_listing_contact', { p_listing_id: listingId });
    expect(reveal.error?.message).toBe('listing_not_available');
  });
});
