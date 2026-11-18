import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  convertRoomPlan,
  applyAnnotations,
  doorHinge,
  doorNear,
  parseEntranceDoorId,
  safeParseRoomModel,
  findEntrance,
  isSameDoor,
  type Aperture,
  type RoomModelV1,
} from '../src/index';
import { buildSample, SAMPLE_SPECS } from '../samples/definitions';
import { minimalModel } from './helpers';

function scan(name: string): RoomModelV1 {
  const file = fileURLToPath(new URL(`./fixtures/roomplan/${name}.json`, import.meta.url));
  return convertRoomPlan(JSON.parse(readFileSync(file, 'utf8'))).model;
}

const door = (id: string, x: number, z: number, yaw = 0, width = 0.9): Aperture => ({
  id,
  roomId: 'room-1',
  wallId: null,
  transform: { position: [x, 1, z], yaw },
  dimensions: { width, height: 2, depth: 0 },
});

/** The 4 x 3 m test room as a hallway, with the given doors in its walls. */
function hallway(...doors: Aperture[]): RoomModelV1 {
  const model = minimalModel();
  return { ...model, rooms: [{ ...model.rooms[0]!, label: 'hallway' }], doors };
}

describe('isSameDoor / doorHinge', () => {
  it('pairs the two sides of one door, not neighbours or crossing doors', () => {
    expect(isSameDoor(door('a', 0, -1.5), door('b', 0.05, -1.2, Math.PI))).toBe(true);
    expect(isSameDoor(door('a', 0, -1.5), door('b', 1, -1.5))).toBe(false);
    expect(isSameDoor(door('a', 0, -1.5), door('b', 0, -1.3, Math.PI / 2))).toBe(false);
  });

  it('puts the hinge at the local -X end', () => {
    expect(doorHinge(door('a', 1, 2))).toEqual([0.55, 2]);
  });
});

describe('findEntrance', () => {
  it('finds the front door of every hand-made sample, facing out', () => {
    for (const spec of Object.values(SAMPLE_SPECS)) {
      const entrance = findEntrance(buildSample(spec));
      expect(entrance?.door.id).toBe('entrance');
    }
    // two-room: the front door is in the hallway's bottom wall (z = 7.35), so out is +Z.
    const entrance = findEntrance(buildSample(SAMPLE_SPECS['two-room']))!;
    expect(entrance.outward[0]).toBeCloseTo(0, 4);
    expect(entrance.outward[1]).toBeCloseTo(1, 4);
  });

  it('finds the closed front door of the real whole-apartment scan', () => {
    const model = scan('apartment-whole-open-plan');
    const entrance = findEntrance(model);
    expect(entrance?.door.id).toBe(model.doors.find((d) => d.isOpen === false)?.id);
  });

  it('takes the only door leading out of a partial scan', () => {
    expect(findEntrance(scan('apartment-kitchen-living'))).not.toBeNull();
  });

  it('gives no answer when several doors lead out and none stands out', () => {
    // A corridor with three doors into rooms that were not scanned.
    expect(findEntrance(scan('apartment-living-corridor'))).toBeNull();
    // One room with two wide doors (one is probably a wardrobe).
    expect(findEntrance(scan('l-shaped-room-shelves'))).toBeNull();
    expect(findEntrance(scan('partial-room-table'))).toBeNull();
  });

  it('prefers a front-door width over a narrow door', () => {
    const model = hallway(door('narrow', -1, -1.5, 0, 0.7), door('wide', 1, -1.5, 0, 0.9));
    expect(findEntrance(model)?.door.id).toBe('wide');
  });

  it('never picks a door scanned from both sides, or one in a bedroom', () => {
    expect(findEntrance(hallway(door('a', 0, -1.5), door('b', 0.05, -1.45, Math.PI)))).toBeNull();
    const bedroom = minimalModel();
    expect(findEntrance({ ...bedroom, doors: [door('a', 0, -1.5)] })).toBeNull();
  });
});

describe('the seller’s front door', () => {
  const twoRoom = () => buildSample(SAMPLE_SPECS['two-room']);

  it('wins over the guess, facing away from its room', () => {
    const model = applyAnnotations(twoRoom(), { entranceDoorId: 'bathroom-door-hallway' });
    const entrance = findEntrance(model)!;
    expect(entrance).toMatchObject({ source: 'seller', door: { id: 'bathroom-door-hallway' } });
    expect(findEntrance(twoRoom())?.source).toBe('guess');
  });

  it('is ignored when the model has no such door, or the value is not an id', () => {
    expect(applyAnnotations(twoRoom(), { entranceDoorId: 'gone' }).entranceDoorId).toBeUndefined();
    expect(applyAnnotations(twoRoom(), { entranceDoorId: null }).entranceDoorId).toBeUndefined();
    expect(parseEntranceDoorId('ABC-1')).toBe('ABC-1');
    expect(parseEntranceDoorId('')).toBeNull();
    expect(parseEntranceDoorId(12)).toBeNull();
    expect(parseEntranceDoorId('x'.repeat(65))).toBeNull();
  });

  it('must name a door of the model', () => {
    expect(safeParseRoomModel({ ...twoRoom(), entranceDoorId: 'entrance' }).success).toBe(true);
    expect(safeParseRoomModel({ ...twoRoom(), entranceDoorId: 'nope' }).success).toBe(false);
  });

  it('survives re-conversion and dividers on a real scan (RoomPlan’s door ids)', () => {
    const converted = scan('apartment-whole-open-plan');
    const door = converted.doors.find((d) => d.isOpen === true)!;
    const again = scan('apartment-whole-open-plan');
    expect(applyAnnotations(again, { entranceDoorId: door.id }).entranceDoorId).toBe(door.id);
  });
});

describe('doorNear', () => {
  it('picks the nearest door within reach of a tap, else none', () => {
    const model = hallway(door('left', -1, -1.5), door('right', 1, -1.5));
    expect(doorNear(model, [-1.2, -1.3])?.id).toBe('left');
    expect(doorNear(model, [0.6, -1.4])?.id).toBe('right');
    // Within the door's width, the distance is to the wall line.
    expect(doorNear(model, [1.4, -1.0])?.id).toBe('right');
    expect(doorNear(model, [0, 1])).toBeNull();
  });
});
