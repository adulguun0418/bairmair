import { describe, expect, it } from 'vitest';
import { UploadEngine, type UploadRecordStore } from '../src/uploads/engine';
import { createUploadRemote, type UploadRemote } from '../src/uploads/remote';
import {
  advance,
  backoffMs,
  isDue,
  MAX_REWINDS,
  newUploadRecord,
  parseUploadRecord,
  pendingLocalCount,
  retryNow,
  uploadStatus,
  type UploadOutcome,
  type UploadRecord,
} from '../src/uploads/upload-model';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const REMOTE = '33333333-3333-4333-8333-333333333333';
const NOW = 1_800_000_000_000;

const record = (changes: Partial<UploadRecord> = {}): UploadRecord => ({
  ...newUploadRecord({
    localId: 'scan-20261120-101500-ab12',
    remoteId: REMOTE,
    ownerId: USER,
    title: '  Манай байр  ',
    now: new Date(NOW),
    device: { modelId: 'iPhone16,1', osVersion: '26.1', appVersion: '0.1.0' },
  }),
  ...changes,
});

describe('upload model', () => {
  it('starts at the row step with a trimmed title', () => {
    const r = record();
    expect(r.step).toBe('row');
    expect(r.title).toBe('Манай байр');
    expect(record({ title: null }).title).toBeNull();
    expect(newUploadRecord({ ...r, title: '   ', now: new Date(NOW) }).title).toBeNull();
  });

  it('walks row → json → usdz → process → done', () => {
    let r = record();
    for (const step of ['json', 'usdz', 'process', 'done'] as const) {
      r = advance(r, { kind: 'ok' }, NOW);
      expect(r.step).toBe(step);
    }
    expect(uploadStatus(r)).toBe('done');
  });

  it('backs off on temporary failures and resets on success', () => {
    let r = advance(record(), { kind: 'transient', message: 'offline' }, NOW);
    expect(r).toMatchObject({ step: 'row', failures: 1, retryAt: NOW + 5_000 });
    expect(uploadStatus(r)).toBe('waiting');
    expect(isDue(r, USER, NOW)).toBe(false);
    expect(isDue(r, USER, NOW + 5_000)).toBe(true);
    r = advance(r, { kind: 'transient', message: 'offline' }, NOW);
    expect(r.retryAt).toBe(NOW + 10_000);
    r = advance(r, { kind: 'ok' }, NOW);
    expect(r).toMatchObject({ step: 'json', failures: 0, retryAt: null, lastError: null });
    expect(backoffMs(30)).toBe(5 * 60_000);
  });

  it('stops over the limit or when the server cannot read the scan, until "try again"', () => {
    const limit = advance(record(), { kind: 'limit' }, NOW);
    expect(uploadStatus(limit)).toBe('limit');
    expect(isDue(limit, USER, NOW)).toBe(false);
    expect(isDue(retryNow(limit), USER, NOW)).toBe(true);

    const failed = advance(record({ step: 'process' }), { kind: 'unreadable', message: 'x' }, NOW);
    expect(uploadStatus(failed)).toBe('failed');
    expect(retryNow(failed).step).toBe('process');
  });

  it('goes back to the row or the files when processing says they are missing, a few times', () => {
    let r = advance(record({ step: 'process' }), { kind: 'rowMissing' }, NOW);
    expect(r.step).toBe('row');
    r = advance({ ...r, step: 'process' }, { kind: 'filesMissing' }, NOW);
    expect(r.step).toBe('json');
    for (let i = r.rewinds; i < MAX_REWINDS; i++) {
      r = advance({ ...r, step: 'process' }, { kind: 'filesMissing' }, NOW);
    }
    expect(uploadStatus(r)).toBe('failed');
  });

  it("works only on the signed-in user's records", () => {
    expect(isDue(record(), USER, NOW)).toBe(true);
    expect(isDue(record(), OTHER, NOW)).toBe(false);
  });

  it('reads stored records and rejects anything else', () => {
    const r = record({ step: 'usdz' });
    expect(parseUploadRecord(JSON.stringify(r))).toEqual(r);
    expect(parseUploadRecord(null)).toBeNull();
    expect(parseUploadRecord('{oops')).toBeNull();
    expect(parseUploadRecord(JSON.stringify({ ...r, step: 'teleport' }))).toBeNull();
    // An older record without the newer fields gets defaults.
    const { rewinds: _rewinds, ...older } = r;
    expect(parseUploadRecord(JSON.stringify(older))?.rewinds).toBe(0);
  });

  it('counts drafts and rows not inserted yet toward the free limit', () => {
    const records = [
      record({ step: 'row' }),
      record({ step: 'json' }),
      record({ step: 'row', blocked: 'limit' }),
      record({ step: 'row', ownerId: OTHER }),
    ];
    expect(pendingLocalCount(1, records, USER)).toBe(2);
  });
});

class MemoryStore implements UploadRecordStore {
  records = new Map<string, UploadRecord>();
  missingFiles = new Set<string>();
  list() {
    return [...this.records.values()];
  }
  get(localId: string) {
    return this.records.get(localId) ?? null;
  }
  save(r: UploadRecord) {
    this.records.set(r.localId, r);
  }
  files(localId: string) {
    return this.missingFiles.has(localId) ? null : { json: 'file:///j', usdz: 'file:///u' };
  }
}

class ScriptedRemote implements UploadRemote {
  user: string | null = USER;
  steps: string[] = [];
  answers: UploadOutcome[] = [];
  onRun?: () => void;
  async currentUserId() {
    return this.user;
  }
  async run(r: UploadRecord) {
    this.steps.push(r.step);
    this.onRun?.();
    return this.answers.shift() ?? { kind: 'ok' as const };
  }
}

describe('UploadEngine', () => {
  const setup = () => {
    const store = new MemoryStore();
    const remote = new ScriptedRemote();
    const engine = new UploadEngine(store, remote, () => NOW);
    return { store, remote, engine };
  };

  it('takes a new scan all the way to done and tells listeners', async () => {
    const { store, remote, engine } = setup();
    store.save(record());
    let changes = 0;
    engine.subscribe(() => changes++);
    engine.kick();
    await engine.idle();
    expect(remote.steps).toEqual(['row', 'json', 'usdz', 'process']);
    expect(store.get(record().localId)?.step).toBe('done');
    expect(changes).toBe(4);
  });

  it('does nothing signed out, and leaves other users’ records alone', async () => {
    const { store, remote, engine } = setup();
    store.save(record({ ownerId: OTHER }));
    engine.kick();
    await engine.idle();
    expect(remote.steps).toEqual([]);

    remote.user = null;
    store.save(record());
    engine.kick();
    await engine.idle();
    expect(remote.steps).toEqual([]);
  });

  it('stops at a temporary failure and keeps the record for the backoff', async () => {
    const { store, remote, engine } = setup();
    store.save(record());
    remote.answers = [{ kind: 'ok' }, { kind: 'transient', message: 'offline' }];
    engine.kick();
    await engine.idle();
    expect(remote.steps).toEqual(['row', 'json']);
    expect(store.get(record().localId)).toMatchObject({ step: 'json', failures: 1 });
  });

  it('does not bring back a record deleted while its step ran', async () => {
    const { store, remote, engine } = setup();
    store.save(record());
    remote.onRun = () => store.records.clear();
    engine.kick();
    await engine.idle();
    expect(store.list()).toEqual([]);
  });

  it('marks a scan whose files are gone from the phone as failed', async () => {
    const { store, remote, engine } = setup();
    store.save(record());
    store.missingFiles.add(record().localId);
    engine.kick();
    await engine.idle();
    expect(remote.steps).toEqual([]);
    expect(uploadStatus(store.get(record().localId)!)).toBe('failed');
  });
});

describe('createUploadRemote', () => {
  const session = { access_token: 'token-1', user: { id: USER } };

  function fakeClient(insertError: { code?: string; message: string } | null) {
    return {
      auth: { getSession: async () => ({ data: { session }, error: null }) },
      from: () => ({ insert: async () => ({ error: insertError }) }),
    } as never;
  }

  const files = { json: 'file:///j', usdz: 'file:///u' };
  const make = (
    insertError: { code?: string; message: string } | null,
    status = 200,
    uploadStatusCode = 200,
  ) => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const remote = createUploadRemote(fakeClient(insertError), {
      supabaseUrl: 'https://proj.supabase.co/',
      publishableKey: 'pk',
      apiUrl: 'https://site.example/',
      uploadFile: async (url, _uri, headers) => {
        calls.push({ url, headers });
        return { status: uploadStatusCode, body: '{}' };
      },
      fetch: (async (url: string) => {
        calls.push({ url });
        return new Response('{}', { status });
      }) as never,
    });
    return { remote, calls };
  };

  it('treats a repeated row insert as done and the limit as the limit', async () => {
    expect(await make({ code: '23505', message: 'dup' }).remote.run(record(), files)).toEqual({
      kind: 'ok',
    });
    expect(
      await make({ code: 'P0001', message: 'scan_limit_reached' }).remote.run(record(), files),
    ).toEqual({ kind: 'limit' });
  });

  it("uploads into the owner's folder with upsert", async () => {
    const { remote, calls } = make(null);
    expect(await remote.run(record({ step: 'usdz' }), files)).toEqual({ kind: 'ok' });
    expect(calls[0]?.url).toBe(
      `https://proj.supabase.co/storage/v1/object/user-scan-raw/${USER}/${REMOTE}/capture.usdz`,
    );
    expect(calls[0]?.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'x-upsert': 'true',
      'Content-Type': 'model/vnd.usdz+zip',
    });
    expect((await make(null, 200, 500).remote.run(record({ step: 'json' }), files)).kind).toBe(
      'transient',
    );
  });

  it('maps the processing answers', async () => {
    const at = (status: number) =>
      make(null, status).remote.run(record({ step: 'process' }), files);
    expect(await at(200)).toEqual({ kind: 'ok' });
    expect(await at(404)).toEqual({ kind: 'rowMissing' });
    expect(await at(409)).toEqual({ kind: 'filesMissing' });
    expect((await at(422)).kind).toBe('unreadable');
    expect((await at(500)).kind).toBe('transient');
    const { remote, calls } = make(null);
    await remote.run(record({ step: 'process' }), files);
    expect(calls[0]?.url).toBe(`https://site.example/api/user-scans/${REMOTE}/process`);
  });
});
