import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUCKETS } from '@bairmair/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  createUser,
  deleteCreatedUsers,
  env,
  removeFolders,
  type TestUser,
} from '../../../packages/db/test-remote/helpers';
import { processScan } from '../../web/src/server/process-scan';
import { supabaseUserScanStore } from '../../web/src/server/supabase';
import { UploadEngine, type UploadRecordStore } from '../src/uploads/engine';
import { createUploadRemote, type UploadFile } from '../src/uploads/remote';
import { newUploadRecord, uploadStatus, type UploadRecord } from '../src/uploads/upload-model';

// bairmair scan's uploads with the real Supabase remote against the dev project: the row
// insert, the raw uploads into the owner's folder, the free limit. Processing runs the web
// server's real `processScan` (this branch's code) behind a fake fetch; the native upload is
// replaced by fetch.

const fixture = readFileSync(
  new URL(
    '../../../packages/room-model/test/fixtures/roomplan/l-shaped-room-shelves.json',
    import.meta.url,
  ),
  'utf8',
);

let alice: TestUser;
let dir: string;
let files: { json: string; usdz: string };

const uploadFile: UploadFile = async (url, fileUri, headers) => {
  const response = await fetch(url, { method: 'POST', headers, body: await readFile(fileUri) });
  return { status: response.status, body: await response.text() };
};

/** `POST /api/user-scans/{id}/process` as the web server would answer it, for `userId`. */
function processFetch(userId: string): typeof fetch {
  return (async (input: string | URL) => {
    const id = /\/api\/user-scans\/([^/]+)\/process$/.exec(String(input))?.[1] ?? '';
    const outcome = await processScan(supabaseUserScanStore(admin), id, userId);
    return outcome.ok
      ? Response.json(outcome.body)
      : Response.json({ error: outcome.error }, { status: outcome.status });
  }) as typeof fetch;
}

class MemoryStore implements UploadRecordStore {
  records = new Map<string, UploadRecord>();
  list() {
    return [...this.records.values()];
  }
  get(localId: string) {
    return this.records.get(localId) ?? null;
  }
  save(record: UploadRecord) {
    this.records.set(record.localId, record);
  }
  files() {
    return files;
  }
}

function record(localId: string): UploadRecord {
  return newUploadRecord({
    localId,
    remoteId: randomUUID(),
    ownerId: alice.id,
    title: `Тест ${localId}`,
    now: new Date(),
    device: { modelId: 'iPhone16,1', osVersion: '26.1', appVersion: '0.1.0' },
  });
}

beforeAll(async () => {
  alice = await createUser('scan-upload');
  dir = mkdtempSync(join(tmpdir(), 'bairmair-scan-'));
  files = { json: join(dir, 'roomplan.json'), usdz: join(dir, 'roomplan.usdz') };
  writeFileSync(files.json, fixture);
  writeFileSync(files.usdz, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
});

afterAll(async () => {
  if (alice) {
    await removeFolders(BUCKETS.userScanRaw, [alice.id]);
    await removeFolders(BUCKETS.userScanModels, [alice.id]);
  }
  await deleteCreatedUsers();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('scan uploads against the dev project', () => {
  const store = new MemoryStore();
  let engine: UploadEngine;

  beforeAll(() => {
    const remote = createUploadRemote(alice.client, {
      supabaseUrl: env.url,
      publishableKey: env.publishableKey,
      apiUrl: 'https://web.test',
      uploadFile,
      fetch: processFetch(alice.id),
    });
    engine = new UploadEngine(store, remote);
  });

  it('takes a scan to a ready row with a link', async () => {
    store.save(record('scan-a'));
    engine.kick();
    await engine.idle();

    const done = store.get('scan-a')!;
    expect(uploadStatus(done)).toBe('done');
    const { data } = await admin
      .from('user_scans')
      .select('owner_id, title, status, share_slug, metrics, device_model')
      .eq('id', done.remoteId)
      .single();
    expect(data).toMatchObject({
      owner_id: alice.id,
      title: 'Тест scan-a',
      status: 'ready',
      device_model: 'iPhone16,1',
    });
    expect(data?.share_slug).toMatch(/^[A-Za-z0-9]{12}$/);
    expect((data?.metrics as { totalAreaM2: number }).totalAreaM2).toBeGreaterThan(0);
  });

  it('stops a third scan at the free limit, and sends it once a slot is free', async () => {
    store.save(record('scan-b'));
    store.save(record('scan-c'));
    engine.kick();
    await engine.idle();

    const statuses = ['scan-b', 'scan-c'].map((id) => uploadStatus(store.get(id)!));
    expect(statuses.sort()).toEqual(['done', 'limit']);

    // The user deletes the first scan; "try again" then sends the stopped one.
    const first = store.get('scan-a')!;
    expect(
      (await alice.client.from('user_scans').delete().eq('id', first.remoteId)).error,
    ).toBeNull();
    const stopped = [...store.records.values()].find((r) => r.blocked === 'limit')!;
    store.save({ ...stopped, blocked: null });
    engine.kick();
    await engine.idle();
    expect(uploadStatus(store.get(stopped.localId)!)).toBe('done');
  });

  it('repeats a step whose answer was lost without a second row', async () => {
    const again = { ...store.get('scan-b')!, step: 'row' as const };
    store.save(again);
    engine.kick();
    await engine.idle();
    expect(uploadStatus(store.get('scan-b')!)).toBe('done');
    const { count } = await admin
      .from('user_scans')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', alice.id);
    expect(count).toBe(2);
  });
});
