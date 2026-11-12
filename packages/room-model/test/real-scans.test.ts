/**
 * Conversion tests against REAL RoomPlan exports, made on an iPhone with the app's scanner
 * (expo-roomplan 1.3.2) and kept byte for byte in test/fixtures/roomplan/. What they showed
 * about Apple's format is written up in docs/proposal/00-expo-roomplan-findings.md.
 *
 * A complete scan also becomes a web sample (samples/<name>.json), regenerated with
 *   pnpm --filter @bairmair/room-model samples
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  apertureCutout,
  computeMetrics,
  convertRoomPlan,
  parseRoomModel,
  pointInPolygon,
  type ConversionWarningCode,
} from '../src/index';
import { formatSample } from './helpers';

interface Expected {
  /** The room's id: the identifier of the floor inside `rooms[0]`. */
  roomId: string;
  /** The merged top-level copy of that floor, which must not become a second room. */
  mergedFloorId: string;
  areaM2: number;
  walls: number;
  /** Door id to the wall the export names as its parent. */
  doors: Record<string, string>;
  /** Object categories, sorted. */
  objects: string[];
  warnings: ConversionWarningCode[];
  /** Scanned all the way round, so the floor holds every object. */
  complete: boolean;
  /** Written to samples/<sample>.json for the web gallery. */
  sample?: string;
}

const FIXTURES: Record<string, Expected> = {
  // A room with a meeting table. Only two walls were captured, so the floor stops at them and
  // the table sticks out of it.
  'partial-room-table': {
    roomId: 'B7BB2942-148F-42F8-A089-E9A7F2E8F5A8',
    mergedFloorId: 'D5895F28-CDA0-4872-AB24-8AB47B74F6D3',
    areaM2: 12.07,
    walls: 2,
    doors: {},
    objects: ['chair', 'chair', 'chair', 'table', 'television'],
    warnings: ['incomplete-room'],
    complete: false,
  },
  // An L-shaped room (8 walls) with two doors and two tall shelves.
  'l-shaped-room-shelves': {
    roomId: '8BC72EC3-4348-4A55-9138-776F87903864',
    mergedFloorId: '08501EC6-F42A-4F0B-94DF-8C62E2073D83',
    areaM2: 9.62,
    walls: 8,
    doors: {
      '220477EF-5E45-497F-A2DC-B9A9D8F0DA36': '25086092-1E68-4939-B54B-605E475204C3',
      'E045E928-7A0D-48BA-B89F-7A409253CE0C': '383AF787-2C9D-4E17-A680-29C453F5B2EB',
    },
    objects: ['storage', 'storage'],
    warnings: [],
    complete: true,
    sample: 'scan-l-room',
  },
};

function loadFixture(name: string): unknown {
  const file = fileURLToPath(new URL(`./fixtures/roomplan/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe.each(Object.entries(FIXTURES))('real scan %s', (name, expected) => {
  const raw = loadFixture(name);
  const { model, warnings } = convertRoomPlan(raw);
  const room = model.rooms[0]!;

  it('becomes one room, not one per copy of its floor', () => {
    expect(model.rooms.map((candidate) => candidate.id)).toEqual([expected.roomId]);
    // RoomPlan labelled the room "unidentified"; the seller picks the label.
    expect(room.label).toBe('other');
  });

  it('has the expected scanned area', () => {
    expect(computeMetrics(model).totalAreaM2).toBe(expected.areaM2);
  });

  it('keeps every wall, door and object, all in that room', () => {
    expect(model.walls).toHaveLength(expected.walls);
    expect(model.doors.map((door) => door.id).sort()).toEqual(Object.keys(expected.doors).sort());
    expect(model.objects.map((object) => object.category).sort()).toEqual(expected.objects);
    for (const element of [...model.walls, ...model.doors, ...model.objects]) {
      expect(element.roomId, element.id).toBe(room.id);
    }
  });

  it('cuts each door into the wall the export names', () => {
    for (const door of model.doors) {
      expect(door.wallId).toBe(expected.doors[door.id]);
      const wall = model.walls.find((candidate) => candidate.id === door.wallId)!;
      const cutout = apertureCutout(door, wall);
      expect(cutout.distance).toBeLessThan(0.01);
      expect(Math.abs(cutout.u) + cutout.width / 2).toBeLessThanOrEqual(wall.dimensions.width / 2);
    }
  });

  it('reports only the expected warnings', () => {
    expect(warnings.map((warning) => warning.code)).toEqual(expected.warnings);
  });

  it.runIf(expected.complete)('holds every object inside the floor', () => {
    for (const object of model.objects) {
      const [x, , z] = object.transform.position;
      expect(pointInPolygon([x, z], room.floor.polygon), object.id).toBe(true);
    }
  });

  it('is centered, with the floor at y = 0, and deterministic', () => {
    const xs = room.floor.polygon.map(([x]) => x);
    const zs = room.floor.polygon.map(([, z]) => z);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 2);
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 2);
    expect(room.floor.y).toBe(0);
    expect(convertRoomPlan(raw).model).toEqual(model);
  });

  it('is a valid RoomModel v1 after a JSON round trip', () => {
    expect(parseRoomModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
  });

  it.runIf(expected.sample !== undefined)(
    'has an up-to-date sample file (run `pnpm samples` to regenerate)',
    async () => {
      const file = fileURLToPath(new URL(`../samples/${expected.sample}.json`, import.meta.url));
      await expect(formatSample(model)).toMatchFileSnapshot(file);
    },
  );
});
