import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BUCKETS,
  CONTENT_TYPES,
  publicObjectUrl,
  scanRawPaths,
  type Database,
  type ProcessScanResponse,
} from '@bairmair/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/scans/[id]/process/route';

/**
 * POST /api/scans/{id}/process end to end against the dev project: real Auth tokens, storage
 * policies, column grants and the trigger that mirrors a ready scan onto its listing.
 * The handler is called directly; no Next.js server is needed.
 */

type Client = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin: Client = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, noSession);

const fixture = readFileSync(
  new URL(
    '../../../packages/room-model/test/fixtures/roomplan/l-shaped-room-shelves.json',
    import.meta.url,
  ),
  'utf8',
);

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

/** A draft listing and a scan row owned by `user`, with whichever raw files are given. */
async function scanWith(user: User, files: { json?: string; usdz?: boolean }): Promise<string> {
  const listingId = randomUUID();
  const scanId = randomUUID();
  listings.push(listingId);
  const listing = await user.client
    .from('listings')
    .insert({ id: listingId, type: 'sale', title: 'Скан тест', city_id: 1 });
  expect(listing.error).toBeNull();

  const paths = scanRawPaths(listingId, scanId);
  const scan = await user.client.from('room_scans').insert({
    id: scanId,
    listing_id: listingId,
    raw_json_path: paths.json,
    usdz_path: paths.usdz,
    device_model: 'iPhone16,2',
    ios_version: '26.1',
  });
  expect(scan.error).toBeNull();

  const raw = user.client.storage.from(BUCKETS.scanRaw);
  if (files.json !== undefined) {
    const { error } = await raw.upload(
      paths.json,
      new Blob([files.json], { type: CONTENT_TYPES.json }),
    );
    expect(error).toBeNull();
  }
  if (files.usdz) {
    const { error } = await raw.upload(
      paths.usdz,
      new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: CONTENT_TYPES.usdz }),
    );
    expect(error).toBeNull();
  }
  return scanId;
}

function call(scanId: string, token?: string): Promise<Response> {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  return POST(new Request(`http://test/api/scans/${scanId}/process`, { method: 'POST', headers }), {
    params: Promise.resolve({ id: scanId }),
  });
}

async function removeFolder(bucket: string, folder: string): Promise<void> {
  const queue = [folder];
  const paths: string[] = [];
  while (queue.length > 0) {
    const dir = queue.pop()!;
    const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    for (const entry of data ?? []) {
      if (entry.id === null) queue.push(`${dir}/${entry.name}`);
      else paths.push(`${dir}/${entry.name}`);
    }
  }
  if (paths.length > 0) await admin.storage.from(bucket).remove(paths);
}

let owner: User;
let stranger: User;

beforeAll(async () => {
  [owner, stranger] = await Promise.all([createUser(), createUser()]);
});

afterAll(async () => {
  for (const listingId of listings) {
    await removeFolder(BUCKETS.scanRaw, listingId);
    await removeFolder(BUCKETS.scanModels, listingId);
  }
  for (const id of users) await admin.auth.admin.deleteUser(id);
});

describe('POST /api/scans/{id}/process', () => {
  it('makes the scan ready and current, and the listing 3D with the scanned area', async () => {
    const scanId = await scanWith(owner, { json: fixture, usdz: true });

    const response = await call(scanId, owner.token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProcessScanResponse;
    expect(body).toMatchObject({ scanId, status: 'ready', schemaVersion: 1 });

    const { data: scan } = await admin
      .from('room_scans')
      .select('listing_id, status, is_current, model_path, metrics, processing_error')
      .eq('id', scanId)
      .single();
    expect(scan).toMatchObject({
      status: 'ready',
      is_current: true,
      model_path: body.modelPath,
      processing_error: null,
    });
    expect((scan!.metrics as { totalAreaM2: number }).totalAreaM2).toBe(body.totalAreaM2);

    const { data: listing } = await admin
      .from('listings')
      .select('has_3d, area_scanned_m2')
      .eq('id', scan!.listing_id)
      .single();
    expect(listing).toEqual({ has_3d: true, area_scanned_m2: body.totalAreaM2 });

    // model.json is public.
    const model = await fetch(publicObjectUrl(url, BUCKETS.scanModels, body.modelPath));
    expect(model.status).toBe(200);
    expect(((await model.json()) as { schemaVersion: number }).schemaVersion).toBe(1);
  });

  it('rejects requests without a valid token', async () => {
    const scanId = await scanWith(owner, { json: fixture, usdz: true });
    expect((await call(scanId)).status).toBe(401);
    expect((await call(scanId, 'not-a-jwt')).status).toBe(401);
  });

  it("answers 404 for another user's scan and leaves it unprocessed", async () => {
    const scanId = await scanWith(owner, { json: fixture, usdz: true });

    const response = await call(scanId, stranger.token);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'scan_not_found' });
    const { data } = await admin.from('room_scans').select('status').eq('id', scanId).single();
    expect(data?.status).toBe('uploaded');
  });

  it('answers 409 while the USDZ is not uploaded', async () => {
    const scanId = await scanWith(owner, { json: fixture });
    const response = await call(scanId, owner.token);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'scan_files_missing' });
  });

  it('marks an unreadable export failed with the reason', async () => {
    const scanId = await scanWith(owner, { json: '{"rooms":"nope"}', usdz: true });

    const response = await call(scanId, owner.token);
    expect(response.status).toBe(422);
    const { data } = await admin
      .from('room_scans')
      .select('status, is_current, processing_error')
      .eq('id', scanId)
      .single();
    expect(data?.status).toBe('failed');
    expect(data?.is_current).toBe(false);
    expect(data?.processing_error).toMatch(/RoomPlanParseError/);
  });

  it('sellers cannot write the server-written columns themselves', async () => {
    const scanId = await scanWith(owner, { json: fixture, usdz: true });
    for (const patch of [{ status: 'ready' as const }, { processing_error: 'x' }]) {
      const { error } = await owner.client.from('room_scans').update(patch).eq('id', scanId);
      expect(error?.code).toBe('42501');
    }
  });
});
