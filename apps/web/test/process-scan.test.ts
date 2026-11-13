import { readFileSync } from 'node:fs';
import { scanModelPaths, scanRawPaths } from '@bairmair/db';
import { CONVERTER_VERSION, RoomModelV1Schema } from '@bairmair/room-model';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_RAW_JSON_CHARS,
  processScan,
  type ReadyFields,
  type ScanRecord,
  type ScanStore,
} from '@/server/process-scan';

const fixture = (name: string) =>
  readFileSync(
    new URL(`../../../packages/room-model/test/fixtures/roomplan/${name}`, import.meta.url),
    'utf8',
  );

const OWNER = '11111111-1111-4111-8111-111111111111';
const STRANGER = '22222222-2222-4222-8222-222222222222';
const LISTING = '33333333-3333-4333-8333-333333333333';
const SCAN = '44444444-4444-4444-8444-444444444444';
const OTHER_LISTING = '55555555-5555-4555-8555-555555555555';

class MemoryStore implements ScanStore {
  scans = new Map<string, ScanRecord>();
  raw = new Map<string, string>();
  models = new Map<string, string>();
  ready = new Map<string, ReadyFields>();
  failed = new Map<string, string>();

  async findScan(scanId: string) {
    return this.scans.get(scanId) ?? null;
  }
  async rawExists(path: string) {
    return this.raw.has(path);
  }
  async readRaw(path: string) {
    const text = this.raw.get(path);
    if (text === undefined) throw new Error(`missing ${path}`);
    return text;
  }
  async writeModel(path: string, json: string) {
    this.models.set(path, json);
  }
  async markReady(scanId: string, fields: ReadyFields) {
    this.ready.set(scanId, fields);
    this.failed.delete(scanId);
  }
  async markFailed(scanId: string, reason: string) {
    this.failed.set(scanId, reason);
  }
}

let store: MemoryStore;
const paths = scanRawPaths(LISTING, SCAN);

function upload(json: string, usdz = true) {
  store.raw.set(paths.json, json);
  if (usdz) store.raw.set(paths.usdz, 'usdz bytes');
}

beforeEach(() => {
  store = new MemoryStore();
  store.scans.set(SCAN, { id: SCAN, listingId: LISTING, ownerId: OWNER });
});

describe('processScan', () => {
  it('converts a real export, writes model.json and marks the scan ready', async () => {
    upload(fixture('l-shaped-room-shelves.json'));

    const outcome = await processScan(store, SCAN, OWNER);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const modelPath = scanModelPaths(LISTING, SCAN).model;
    expect(outcome.body).toMatchObject({
      scanId: SCAN,
      status: 'ready',
      modelPath,
      schemaVersion: 1,
      converterVersion: CONVERTER_VERSION,
    });
    expect(outcome.body.totalAreaM2).toBeGreaterThan(5);

    const model = RoomModelV1Schema.parse(JSON.parse(store.models.get(modelPath)!));
    expect(model.rooms).toHaveLength(1);

    const ready = store.ready.get(SCAN)!;
    expect(ready.modelPath).toBe(modelPath);
    expect(ready.metrics.totalAreaM2).toBe(outcome.body.totalAreaM2);
    expect(ready.metrics.rooms).toHaveLength(1);
  });

  it('records conversion warnings in the metrics and the response', async () => {
    upload(fixture('partial-room-table.json'));

    const outcome = await processScan(store, SCAN, OWNER);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.body.warnings['incomplete-room']).toBe(1);
    expect(store.ready.get(SCAN)!.metrics.warnings['incomplete-room']).toBe(1);
  });

  it('can run again on a ready scan and writes the same model', async () => {
    upload(fixture('l-shaped-room-shelves.json'));
    await processScan(store, SCAN, OWNER);
    const first = [...store.models.values()][0];

    const again = await processScan(store, SCAN, OWNER);

    expect(again.ok).toBe(true);
    expect([...store.models.values()]).toEqual([first]);
  });

  it("hides another user's scan as not found and touches nothing", async () => {
    upload(fixture('l-shaped-room-shelves.json'));

    expect(await processScan(store, SCAN, STRANGER)).toEqual({
      ok: false,
      status: 404,
      error: 'scan_not_found',
    });
    expect(store.models.size).toBe(0);
    expect(store.ready.size + store.failed.size).toBe(0);
  });

  it('rejects ids that are not UUIDs without a lookup', async () => {
    store.findScan = () => {
      throw new Error('should not be called');
    };
    expect(await processScan(store, '../etc', OWNER)).toMatchObject({ status: 404 });
  });

  it('returns 409 and leaves the scan alone while an upload is missing', async () => {
    upload(fixture('l-shaped-room-shelves.json'), false);

    expect(await processScan(store, SCAN, OWNER)).toEqual({
      ok: false,
      status: 409,
      error: 'scan_files_missing',
    });
    expect(store.ready.size + store.failed.size).toBe(0);
  });

  it("reads only the scan's own folder, even if another listing has files", async () => {
    const elsewhere = scanRawPaths(OTHER_LISTING, SCAN);
    store.raw.set(elsewhere.json, fixture('l-shaped-room-shelves.json'));
    store.raw.set(elsewhere.usdz, 'usdz bytes');

    expect(await processScan(store, SCAN, OWNER)).toMatchObject({ status: 409 });
  });

  it.each([
    ['invalid JSON', '{ not json', /SyntaxError/],
    ['a JSON file that is not a RoomPlan export', '{"hello":"world"}', /RoomPlanParseError/],
  ])('marks the scan failed for %s', async (_name, body, reason) => {
    upload(body);

    expect(await processScan(store, SCAN, OWNER)).toEqual({
      ok: false,
      status: 422,
      error: 'scan_conversion_failed',
    });
    expect(store.failed.get(SCAN)).toMatch(reason);
    expect(store.models.size).toBe(0);
  });

  it('refuses oversized raw files without parsing them', async () => {
    upload(' '.repeat(MAX_RAW_JSON_CHARS + 1));

    expect(await processScan(store, SCAN, OWNER)).toMatchObject({ status: 422 });
    expect(store.failed.get(SCAN)).toMatch(/too large/);
  });

  it('lets storage errors through (HTTP 500, the scan keeps its status)', async () => {
    upload(fixture('l-shaped-room-shelves.json'));
    store.writeModel = () => Promise.reject(new Error('storage down'));

    await expect(processScan(store, SCAN, OWNER)).rejects.toThrow('storage down');
    expect(store.ready.size + store.failed.size).toBe(0);
  });
});
