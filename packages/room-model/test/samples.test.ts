import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildSample, SAMPLE_SPECS, type SampleName } from '../samples/definitions';
import {
  apertureCutout,
  computeMetrics,
  parseRoomModel,
  pointInPolygon,
  type Aperture,
} from '../src/index';
import { formatSample } from './helpers';

// Areas worked out by hand from the room outlines in samples/definitions.ts.
const EXPECTED: Record<
  SampleName,
  { rooms: Record<string, number>; total: number; doors: number; windows: number; openings: number }
> = {
  studio: {
    // main: 6 x 5 minus the 2.2 x 2 bathroom corner. bathroom: 2 x 1.8.
    rooms: { main: 25.6, bathroom: 3.6 },
    total: 29.2,
    doors: 3, // entrance + bathroom door seen from both rooms
    windows: 1,
    openings: 0,
  },
  'two-room': {
    rooms: { living: 16.8, bedroom: 14, kitchen: 9.6, hallway: 8, bathroom: 6.56 },
    total: 54.96,
    doors: 7, // entrance + three interior doors seen from both rooms
    windows: 3,
    openings: 2, // kitchen opening seen from both rooms
  },
  'l-shaped': {
    // living: 6 x 5.5 minus the 2.5 x 2.5 notch. kitchen: 2.35 x 2.35 = 5.5225.
    rooms: { living: 26.75, kitchen: 5.52 },
    total: 32.27,
    doors: 1,
    windows: 2,
    openings: 2,
  },
};

describe.each(Object.keys(SAMPLE_SPECS) as SampleName[])('sample %s', (name) => {
  const model = buildSample(SAMPLE_SPECS[name]);
  const json = formatSample(model);

  it('has an up-to-date JSON file (run `pnpm samples` to regenerate)', async () => {
    const file = fileURLToPath(new URL(`../samples/${name}.json`, import.meta.url));
    await expect(json).toMatchFileSnapshot(file);
  });

  it('is a valid RoomModel v1 after a JSON round trip', () => {
    expect(parseRoomModel(JSON.parse(json))).toEqual(model);
  });

  it('has the expected room areas', () => {
    const metrics = computeMetrics(model);
    expect(Object.fromEntries(metrics.rooms.map((room) => [room.id, room.areaM2]))).toEqual(
      EXPECTED[name].rooms,
    );
    expect(metrics.totalAreaM2).toBe(EXPECTED[name].total);
  });

  it('has the expected doors, windows and openings', () => {
    expect(model.doors).toHaveLength(EXPECTED[name].doors);
    expect(model.windows).toHaveLength(EXPECTED[name].windows);
    expect(model.openings).toHaveLength(EXPECTED[name].openings);
  });

  it('is centered on the origin with the floor at y = 0', () => {
    const points = model.rooms.flatMap((room) => room.floor.polygon);
    const xs = points.map(([x]) => x);
    const zs = points.map(([, z]) => z);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 6);
    expect(model.rooms.every((room) => room.floor.y === 0)).toBe(true);
  });

  it('gives every wall a room and every room at least three walls', () => {
    for (const room of model.rooms) {
      const walls = model.walls.filter((wall) => wall.roomId === room.id);
      expect(walls.length).toBe(room.floor.polygon.length);
    }
    expect(model.walls.every((wall) => wall.roomId !== null)).toBe(true);
  });

  it('places every door, window and opening inside its wall', () => {
    const apertures: Aperture[] = [...model.doors, ...model.windows, ...model.openings];
    for (const aperture of apertures) {
      const wall = model.walls.find((candidate) => candidate.id === aperture.wallId);
      expect(wall, `${aperture.id} has a wall`).toBeDefined();
      const cutout = apertureCutout(aperture, wall!);
      const tolerance = 0.002;
      expect(cutout.distance).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(cutout.u) + cutout.width / 2).toBeLessThanOrEqual(
        wall!.dimensions.width / 2 + tolerance,
      );
      expect(Math.abs(cutout.v) + cutout.height / 2).toBeLessThanOrEqual(
        wall!.dimensions.height / 2 + tolerance,
      );
      expect(aperture.roomId).toBe(wall!.roomId);
    }
  });

  it('places every object inside the room it belongs to', () => {
    for (const object of model.objects) {
      const room = model.rooms.find((candidate) => candidate.id === object.roomId);
      expect(room, `${object.id} has a room`).toBeDefined();
      const [x, , z] = object.transform.position;
      expect(pointInPolygon([x, z], room!.floor.polygon)).toBe(true);
    }
  });
});
