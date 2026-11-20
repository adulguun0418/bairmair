import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  BUCKETS,
  CONTENT_TYPES,
  userScanModelPath,
  userScanRawPaths,
  type Database,
  type ProcessScanResponse,
} from '@bairmair/db';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signInForTest } from './sign-in';
import { POST } from '@/app/api/user-scans/[id]/process/route';
import { loadSharedScan } from '@/server/shared-scan';
import { supabaseSharedScanSource } from '@/server/supabase';

/**
 * bairmair scan end to end against the dev project: a user's scan row and raw upload under the
 * real storage policies, POST /api/user-scans/{id}/process, then the private link's loader
 * (`/s/<slug>`) reading it back by slug with the secret key.
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
  const signIn = await signInForTest(client, { phone, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, token: signIn.data.session.access_token, client };
}

/** A scan row of `user` with whichever raw files are given; returns its id and slug. */
async function scanWith(
  user: User,
  files: { json?: string; usdz?: boolean },
): Promise<{ id: string; slug: string }> {
  const id = randomUUID();
  const { data, error } = await user.client
    .from('user_scans')
    .insert({ id, title: 'Тест скан', device_model: 'iPhone16,2', ios_version: '26.1' })
    .select('share_slug')
    .single();
  if (error) throw error;

  const paths = userScanRawPaths(user.id, id);
  const raw = user.client.storage.from(BUCKETS.userScanRaw);
  if (files.json !== undefined) {
    const upload = await raw.upload(
      paths.json,
      new Blob([files.json], { type: CONTENT_TYPES.json }),
    );
    expect(upload.error).toBeNull();
  }
  if (files.usdz) {
    const upload = await raw.upload(
      paths.usdz,
      new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: CONTENT_TYPES.usdz }),
    );
    expect(upload.error).toBeNull();
  }
  return { id, slug: data.share_slug };
}

function call(scanId: string, token?: string): Promise<Response> {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined;
  return POST(
    new Request(`http://test/api/user-scans/${scanId}/process`, { method: 'POST', headers }),
    { params: Promise.resolve({ id: scanId }) },
  );
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
  for (const id of users) {
    await removeFolder(BUCKETS.userScanRaw, id);
    await removeFolder(BUCKETS.userScanModels, id);
    await admin.auth.admin.deleteUser(id);
  }
});

describe('POST /api/user-scans/{id}/process and the private link', () => {
  let scan: { id: string; slug: string };

  it('answers 409 until both files are uploaded, 401 without a token', async () => {
    scan = await scanWith(owner, { json: fixture });
    expect((await call(scan.id)).status).toBe(401);

    const response = await call(scan.id, owner.token);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'scan_files_missing' });
  });

  it("makes the owner's scan ready and writes its model to the owner's folder", async () => {
    const usdz = await owner.client.storage
      .from(BUCKETS.userScanRaw)
      .upload(
        userScanRawPaths(owner.id, scan.id).usdz,
        new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], { type: CONTENT_TYPES.usdz }),
      );
    expect(usdz.error).toBeNull();

    const response = await call(scan.id, owner.token);
    expect(response.status).toBe(200);
    const body = (await response.json()) as ProcessScanResponse;
    expect(body).toMatchObject({
      scanId: scan.id,
      status: 'ready',
      modelPath: userScanModelPath(owner.id, scan.id),
    });
    expect(body.totalAreaM2).toBeGreaterThan(0);

    const { data } = await admin
      .from('user_scans')
      .select('status, metrics, converter_version, processing_error')
      .eq('id', scan.id)
      .single();
    expect(data?.status).toBe('ready');
    expect((data?.metrics as { totalAreaM2: number }).totalAreaM2).toBe(body.totalAreaM2);
    expect(data?.processing_error).toBeNull();
  });

  it("refuses someone else's scan like a missing one", async () => {
    const response = await call(scan.id, stranger.token);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'scan_not_found' });
  });

  it('opens by its slug, with the owner’s room names', async () => {
    const source = supabaseSharedScanSource(admin);
    const shared = await loadSharedScan(source, scan.slug);
    expect(shared?.title).toBe('Тест скан');
    expect(shared?.model.rooms.length).toBeGreaterThan(0);

    const roomId = shared!.model.rooms[0]!.id;
    const labelled = await owner.client
      .from('user_scans')
      .update({ room_labels: { [roomId]: { label: 'livingRoom', name: 'Зочны өрөө' } } })
      .eq('id', scan.id);
    expect(labelled.error).toBeNull();
    const again = await loadSharedScan(source, scan.slug);
    expect(again?.model.rooms[0]).toMatchObject({ label: 'livingRoom', name: 'Зочны өрөө' });
  });

  it('stops opening once the owner turns the link off', async () => {
    const off = await owner.client
      .from('user_scans')
      .update({ link_enabled: false })
      .eq('id', scan.id);
    expect(off.error).toBeNull();
    expect(await loadSharedScan(supabaseSharedScanSource(admin), scan.slug)).toBeNull();
  });

  it('marks an unreadable export failed, and its slug opens nothing', async () => {
    const broken = await scanWith(owner, { json: '{"rooms":"nope"}', usdz: true });
    const response = await call(broken.id, owner.token);
    expect(response.status).toBe(422);
    const { data } = await admin
      .from('user_scans')
      .select('status, processing_error')
      .eq('id', broken.id)
      .single();
    expect(data?.status).toBe('failed');
    expect(data?.processing_error).toMatch(/RoomPlanParseError/);
    expect(await loadSharedScan(supabaseSharedScanSource(admin), broken.slug)).toBeNull();
  });
});
