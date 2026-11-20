import { readFileSync } from 'node:fs';
import { userScanModelPath } from '@bairmair/db';
import { convertRoomPlan } from '@bairmair/room-model';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSharedScan, type SharedScanRow, type SharedScanSource } from '@/server/shared-scan';

const raw = readFileSync(
  new URL(
    '../../../packages/room-model/test/fixtures/roomplan/l-shaped-room-shelves.json',
    import.meta.url,
  ),
  'utf8',
);
const { model } = convertRoomPlan(JSON.parse(raw));
const roomId = model.rooms[0]!.id;

const OWNER = '11111111-1111-4111-8111-111111111111';
const SCAN = '44444444-4444-4444-8444-444444444444';
const SLUG = 'Ab3dEf6hJk9m';

class MemorySource implements SharedScanSource {
  rows = new Map<string, SharedScanRow>();
  models = new Map<string, unknown>();
  lookups: string[] = [];

  async findBySlug(slug: string) {
    this.lookups.push(slug);
    return this.rows.get(slug) ?? null;
  }
  async readModel(path: string) {
    return this.models.get(path) ?? null;
  }
}

let source: MemorySource;

beforeEach(() => {
  source = new MemorySource();
  source.rows.set(SLUG, {
    id: SCAN,
    owner_id: OWNER,
    title: 'Манай байр',
    created_at: '2026-11-20T10:00:00Z',
    room_labels: { [roomId]: { label: 'kitchen', name: 'Том гал тогоо' } },
    room_dividers: [],
    entrance_door_id: null,
  });
  source.models.set(userScanModelPath(OWNER, SCAN), JSON.parse(JSON.stringify(model)));
});

describe('loadSharedScan', () => {
  it("loads the model from the owner's folder with their room names applied", async () => {
    const scan = await loadSharedScan(source, SLUG);

    expect(scan).not.toBeNull();
    expect(scan?.title).toBe('Манай байр');
    expect(scan?.createdAt).toBe('2026-11-20T10:00:00Z');
    expect(scan?.model.rooms[0]).toMatchObject({ label: 'kitchen', name: 'Том гал тогоо' });
    expect(scan?.metrics.totalAreaM2).toBeGreaterThan(0);
  });

  it('does not look up anything that is not a slug', async () => {
    for (const slug of ['', 'short', 'Ab3dEf6hJk9m!', '../../etc/pass', 'Ab3dEf6hJk9mX']) {
      expect(await loadSharedScan(source, slug)).toBeNull();
    }
    expect(source.lookups).toEqual([]);
  });

  it('is null for an unknown slug (or a link turned off, which the source does not return)', async () => {
    expect(await loadSharedScan(source, 'Zz9zZz9zZz9z')).toBeNull();
  });

  it('is null when the model file is missing or not a RoomModel', async () => {
    source.models.clear();
    expect(await loadSharedScan(source, SLUG)).toBeNull();

    source.models.set(userScanModelPath(OWNER, SCAN), { hello: 'world' });
    expect(await loadSharedScan(source, SLUG)).toBeNull();
  });

  it('ignores malformed owner annotations instead of failing', async () => {
    source.rows.set(SLUG, {
      ...source.rows.get(SLUG)!,
      room_labels: 'not an object',
      room_dividers: { nope: true },
      entrance_door_id: 'no-such-door',
    });
    const scan = await loadSharedScan(source, SLUG);
    expect(scan?.model.rooms.length).toBe(model.rooms.length);
  });
});
