import { randomInt, randomUUID } from 'node:crypto';
import {
  avatarPath,
  BUCKETS,
  CONTENT_TYPES,
  listingPhotoPath,
  scanModelPaths,
  scanRawPaths,
  type Database,
  type DeleteAccountResponse,
} from '@bairmair/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DELETE } from '@/app/api/account/route';

/**
 * DELETE /api/account end to end against the dev project: real tokens, storage policies and
 * the database cascade. The handler is called directly; no Next.js server is needed.
 */

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin: Client = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, noSession);

interface User {
  id: string;
  token: string;
  client: Client;
}
const users: string[] = [];
const listings: string[] = [];

async function createUser(): Promise<User> {
  const phone = `+9760${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
  });
  if (error) throw error;
  users.push(data.user.id);
  const client = createClient<Database>(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    noSession,
  );
  const signIn = await client.auth.signInWithPassword({ phone, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, token: signIn.data.session.access_token, client };
}

const jpeg = () =>
  new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: CONTENT_TYPES.jpeg });
const json = () => new Blob(['{}'], { type: CONTENT_TYPES.json });

/** A draft listing with one photo, owned by `user`. Returns the listing id. */
async function listingWithPhoto(user: User): Promise<{ listingId: string; photoPath: string }> {
  const listingId = randomUUID();
  listings.push(listingId);
  const insert = await user.client
    .from('listings')
    .insert({ id: listingId, type: 'sale', title: 'Устгах тест', city_id: 1 });
  expect(insert.error).toBeNull();
  const photoPath = listingPhotoPath(listingId, randomUUID());
  const upload = await user.client.storage.from(BUCKETS.listingPhotos).upload(photoPath, jpeg());
  expect(upload.error).toBeNull();
  return { listingId, photoPath };
}

async function exists(bucket: string, path: string): Promise<boolean> {
  const { data } = await admin.storage.from(bucket).exists(path);
  return data;
}

function call(token?: string): Promise<Response> {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  return DELETE(new Request('http://test/api/account', { method: 'DELETE', headers }));
}

let owner: User;
let stranger: User;

beforeAll(async () => {
  [owner, stranger] = await Promise.all([createUser(), createUser()]);
});

afterAll(async () => {
  // Whatever a failed test left behind.
  for (const listingId of listings) {
    for (const bucket of [BUCKETS.listingPhotos, BUCKETS.scanRaw, BUCKETS.scanModels]) {
      const { data } = await admin.storage.from(bucket).list(listingId);
      const paths = (data ?? []).filter((e) => e.id !== null).map((e) => `${listingId}/${e.name}`);
      if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
    }
  }
  for (const id of users) {
    await admin.storage.from(BUCKETS.avatars).remove([avatarPath(id)]);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('DELETE /api/account', () => {
  it('refuses a request without a valid token', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('not-a-token')).status).toBe(401);
  });

  it('deletes the user, their listings and every file, and nothing of anyone else', async () => {
    // The owner: a listing with a photo, a scan with raw files and a model, an avatar, and a
    // favorite on the stranger's listing.
    const mine = await listingWithPhoto(owner);
    const scanId = randomUUID();
    const raw = scanRawPaths(mine.listingId, scanId);
    const scan = await owner.client.from('room_scans').insert({
      id: scanId,
      listing_id: mine.listingId,
      raw_json_path: raw.json,
      usdz_path: raw.usdz,
      device_model: 'iPhone16,2',
      ios_version: '26.1',
    });
    expect(scan.error).toBeNull();
    expect(
      (await owner.client.storage.from(BUCKETS.scanRaw).upload(raw.json, json())).error,
    ).toBeNull();
    const model = scanModelPaths(mine.listingId, scanId).model;
    expect((await admin.storage.from(BUCKETS.scanModels).upload(model, json())).error).toBeNull();
    const avatar = avatarPath(owner.id);
    expect(
      (await owner.client.storage.from(BUCKETS.avatars).upload(avatar, jpeg())).error,
    ).toBeNull();

    const theirs = await listingWithPhoto(stranger);
    // The stranger's listing is a draft, so only its owner sees it; a favorite needs a visible
    // listing, so it goes in with the secret key.
    const favorite = await admin
      .from('favorites')
      .insert({ user_id: owner.id, listing_id: theirs.listingId });
    expect(favorite.error).toBeNull();

    const response = await call(owner.token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as DeleteAccountResponse;
    expect(body).toEqual({ deleted: true, removedFiles: 4 });

    // The owner and everything they had.
    const user = await admin.auth.admin.getUserById(owner.id);
    expect(user.data.user).toBeNull();
    const rows = await admin.from('listings').select('id').eq('id', mine.listingId);
    expect(rows.data).toEqual([]);
    const scans = await admin.from('room_scans').select('id').eq('id', scanId);
    expect(scans.data).toEqual([]);
    const favorites = await admin.from('favorites').select('listing_id').eq('user_id', owner.id);
    expect(favorites.data).toEqual([]);
    expect(await exists(BUCKETS.listingPhotos, mine.photoPath)).toBe(false);
    expect(await exists(BUCKETS.scanRaw, raw.json)).toBe(false);
    expect(await exists(BUCKETS.scanModels, model)).toBe(false);
    expect(await exists(BUCKETS.avatars, avatar)).toBe(false);

    // The stranger keeps theirs.
    const kept = await admin.from('listings').select('id').eq('id', theirs.listingId);
    expect(kept.data).toEqual([{ id: theirs.listingId }]);
    expect(await exists(BUCKETS.listingPhotos, theirs.photoPath)).toBe(true);

    // The deleted user's token no longer works, even before it expires.
    expect((await call(owner.token)).status).toBe(401);
  });
});
