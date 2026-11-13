/**
 * Conversion tests against SYNTHETIC RoomPlan exports.
 *
 * They follow the shape of real exports and pin down the geometry of the conversion (canonical
 * frame, areas, room membership) with exact expected values, including cases no real scan has
 * covered yet (several rooms). Real exports are tested in real-scans.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { transformPoint } from '../src/geometry/mat4';
import {
  computeMetrics,
  convertRoomPlan,
  directionFromYaw,
  parseRoomModel,
  parseRoomPlanCapture,
  RoomPlanParseError,
  type Vec2,
} from '../src/index';

type Vec3 = [number, number, number];

/** Where a synthetic scan sits in raw scan coordinates. */
interface Placement {
  yaw: number;
  origin: Vec3;
}

// Turned 30 degrees, away from the origin, with the floor below zero.
const DEFAULT_PLACEMENT: Placement = { yaw: Math.PI / 6, origin: [10, -1.2, 5] };

/** Room-local coordinates to raw scan coordinates. */
function toScan(local: Vec3, { yaw, origin }: Placement): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    c * local[0] + s * local[2] + origin[0],
    local[1] + origin[1],
    -s * local[0] + c * local[2] + origin[2],
  ];
}

/** Matrix of an upright element (wall, door, furniture): local Y is up. */
function upright(position: Vec3, yaw: number): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, ...position, 1];
}

/** Matrix of a horizontal surface: local X and Y lie in the floor plane. */
function flat(position: Vec3, yaw: number): number[] {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [c, 0, -s, 0, s, 0, c, 0, 0, -1, 0, 0, ...position, 1];
}

function surface(
  placement: Placement,
  identifier: string,
  kind: string,
  local: Vec3,
  localYaw: number,
  dimensions: Vec3,
  extra: Record<string, unknown> = {},
) {
  return {
    identifier,
    category: { [kind]: {} },
    confidence: { high: {} },
    transform: upright(toScan(local, placement), localYaw + placement.yaw),
    dimensions,
    parentIdentifier: null,
    polygonCorners: [],
    completedEdges: [],
    curve: null,
    story: 0,
    ...extra,
  };
}

function floor(placement: Placement, identifier: string, local: Vec3, dimensions: Vec3) {
  return {
    ...surface(placement, identifier, 'floor', local, 0, dimensions),
    transform: flat(toScan(local, placement), placement.yaw),
  };
}

function object(
  placement: Placement,
  identifier: string,
  category: string,
  local: Vec3,
  localYaw: number,
  dimensions: Vec3,
) {
  return {
    identifier,
    category: { [category]: {} },
    confidence: { medium: {} },
    attributes: {},
    transform: upright(toScan(local, placement), localYaw + placement.yaw),
    dimensions,
    parentIdentifier: null,
    story: 0,
  };
}

/** A 4 x 3 m bedroom, in the shape of a single `CapturedRoom`. */
function bedroom(p: Placement = DEFAULT_PLACEMENT) {
  return {
    version: 2,
    coreModel: 'AAAA',
    walls: [
      surface(p, 'wall-n', 'wall', [0, 1.3, -1.5], 0, [4, 2.6, 0]),
      surface(p, 'wall-s', 'wall', [0, 1.3, 1.5], Math.PI, [4, 2.6, 0]),
      surface(p, 'wall-e', 'wall', [2, 1.3, 0], Math.PI / 2, [3, 2.6, 0]),
      surface(p, 'wall-w', 'wall', [-2, 1.3, 0], -Math.PI / 2, [3, 2.6, 0]),
    ],
    doors: [
      surface(p, 'door-1', 'door', [1, 1, 1.5], Math.PI, [0.9, 2, 0], {
        category: { door: { isOpen: true } },
        parentIdentifier: 'wall-s',
      }),
    ],
    windows: [
      surface(p, 'window-1', 'window', [0, 1.5, -1.5], 0, [1.5, 1.4, 0], {
        parentIdentifier: 'wall-n',
      }),
    ],
    // No parent in the export: the converter has to find the wall.
    openings: [surface(p, 'opening-1', 'opening', [2, 1.05, 0.5], Math.PI / 2, [0.8, 2.1, 0])],
    floors: [floor(p, 'floor-1', [0, 0, 0], [4, 3, 0])],
    objects: [
      object(p, 'bed-1', 'bed', [-1, 0.25, -0.5], 0, [1.6, 0.5, 2]),
      object(p, 'piano-1', 'piano', [1, 0.6, -1], Math.PI / 2, [1.5, 1.2, 0.6]),
    ],
    sections: [{ label: 'bedroom', story: 0, center: toScan([0, 1, 0], p) }],
  };
}

/** A 3 x 3 m kitchen east of the bedroom, 0.15 m of wall between them. */
function kitchen(p: Placement = DEFAULT_PLACEMENT) {
  return {
    version: 2,
    walls: [
      surface(p, 'k-wall-n', 'wall', [3.65, 1.3, -1.5], 0, [3, 2.6, 0]),
      surface(p, 'k-wall-s', 'wall', [3.65, 1.3, 1.5], Math.PI, [3, 2.6, 0]),
      surface(p, 'k-wall-e', 'wall', [5.15, 1.3, 0], Math.PI / 2, [3, 2.6, 0]),
      surface(p, 'k-wall-w', 'wall', [2.15, 1.3, 0], -Math.PI / 2, [3, 2.6, 0]),
    ],
    doors: [],
    windows: [],
    openings: [],
    floors: [floor(p, 'floor-2', [3.65, 0, 0], [3, 3, 0])],
    objects: [object(p, 'table-1', 'table', [3.65, 0.4, 0], 0, [1, 0.8, 1])],
    sections: [{ label: 'kitchen', story: 0, center: toScan([3.65, 1, 0], p) }],
  };
}

const byId = <T extends { id: string }>(items: readonly T[], id: string): T => {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`No element "${id}"`);
  return item;
};

const sortPoints = (points: readonly Vec2[]) =>
  [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

function expectPosition(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 3));
}

/** Compares headings by direction, so that +PI and -PI count as the same. */
function expectYaw(actual: number, expected: number) {
  const [ax, az] = directionFromYaw(actual);
  const [ex, ez] = directionFromYaw(expected);
  expect(ax).toBeCloseTo(ex, 3);
  expect(az).toBeCloseTo(ez, 3);
}

describe('convertRoomPlan: a single room', () => {
  const { model, warnings } = convertRoomPlan(bedroom());

  it('produces a valid RoomModel v1 without warnings', () => {
    expect(parseRoomModel(model)).toEqual(model);
    expect(warnings).toEqual([]);
    expect(model.schemaVersion).toBe(1);
    expect(model.source.kind).toBe('roomplan');
    expect(model.source.formatVersion).toBe(2);
    expect(model.hotspots).toEqual([]);
  });

  it('moves the scan into the canonical frame: axis-aligned, centered, floor at y = 0', () => {
    const room = model.rooms[0]!;
    expect(room.floor.y).toBe(0);
    expect(sortPoints(room.floor.polygon)).toEqual([
      [-2, -1.5],
      [-2, 1.5],
      [2, -1.5],
      [2, 1.5],
    ]);
  });

  it('computes the scanned area', () => {
    const metrics = computeMetrics(model);
    expect(metrics.rooms).toEqual([{ id: 'floor-1', areaM2: 12 }]);
    expect(metrics.totalAreaM2).toBe(12);
  });

  it('labels the room from the RoomPlan section inside it', () => {
    expect(model.rooms[0]).toMatchObject({ id: 'floor-1', label: 'bedroom', story: 0 });
  });

  it('converts walls to position, yaw and dimensions', () => {
    expect(model.walls).toHaveLength(4);

    const north = byId(model.walls, 'wall-n');
    expectPosition(north.transform.position, [0, 1.3, -1.5]);
    expectYaw(north.transform.yaw, 0);
    expect(north.dimensions).toEqual({ width: 4, height: 2.6, depth: 0 });
    expect(north.confidence).toBe('high');

    const south = byId(model.walls, 'wall-s');
    expectPosition(south.transform.position, [0, 1.3, 1.5]);
    expectYaw(south.transform.yaw, Math.PI);

    const east = byId(model.walls, 'wall-e');
    expectPosition(east.transform.position, [2, 1.3, 0]);
    expectYaw(east.transform.yaw, Math.PI / 2);
    expect(east.dimensions.width).toBe(3);

    expect(model.walls.every((wall) => wall.roomId === 'floor-1')).toBe(true);
  });

  it('keeps the wall a door or window was scanned on', () => {
    const door = byId(model.doors, 'door-1');
    expect(door.wallId).toBe('wall-s');
    expect(door.roomId).toBe('floor-1');
    expect(door.isOpen).toBe(true);
    expectPosition(door.transform.position, [1, 1, 1.5]);
    expect(door.dimensions).toEqual({ width: 0.9, height: 2, depth: 0 });

    const window = byId(model.windows, 'window-1');
    expect(window.wallId).toBe('wall-n');
    expect(window.isOpen).toBeUndefined();
  });

  it('attaches an aperture without a parent to the wall it lies on', () => {
    const opening = byId(model.openings, 'opening-1');
    expect(opening.wallId).toBe('wall-e');
    expect(opening.roomId).toBe('floor-1');
  });

  it('converts objects, reading unknown categories as other', () => {
    const bed = byId(model.objects, 'bed-1');
    expect(bed.category).toBe('bed');
    expect(bed.roomId).toBe('floor-1');
    expect(bed.confidence).toBe('medium');
    expectPosition(bed.transform.position, [-1, 0.25, -0.5]);
    expectYaw(bed.transform.yaw, 0);
    expect(bed.dimensions).toEqual({ width: 1.6, height: 0.5, depth: 2 });

    const piano = byId(model.objects, 'piano-1');
    expect(piano.category).toBe('other');
    expectYaw(piano.transform.yaw, Math.PI / 2);
  });

  it('records the transform from raw scan coordinates to model coordinates', () => {
    const local: Vec3 = [1, 0.5, -1];
    const mapped = transformPoint(model.frame.fromSource, toScan(local, DEFAULT_PLACEMENT));
    expectPosition(mapped, local);
  });

  it('is deterministic', () => {
    expect(convertRoomPlan(bedroom())).toEqual(convertRoomPlan(structuredClone(bedroom())));
  });
});

describe('convertRoomPlan: canonical frame', () => {
  it('gives the same model wherever the scan session started', () => {
    const reference = convertRoomPlan(bedroom()).model;
    const placements: Placement[] = [
      { yaw: 0, origin: [0, 0, 0] },
      { yaw: 0.3, origin: [-40, 2.5, 17] },
      { yaw: -0.5, origin: [3, -0.4, -8] },
    ];
    for (const placement of placements) {
      const { model } = convertRoomPlan(bedroom(placement));
      expect(sortPoints(model.rooms[0]!.floor.polygon)).toEqual(
        sortPoints(reference.rooms[0]!.floor.polygon),
      );
      for (const wall of reference.walls) {
        const other = byId(model.walls, wall.id);
        expectPosition(other.transform.position, wall.transform.position);
        expectYaw(other.transform.yaw, wall.transform.yaw);
      }
      for (const item of reference.objects) {
        expectPosition(byId(model.objects, item.id).transform.position, item.transform.position);
      }
    }
  });

  it('always ends up axis-aligned, whatever the scan heading', () => {
    for (const yaw of [1.0, 1.75, 2.4, -2.0, 3.1]) {
      const { model } = convertRoomPlan(bedroom({ yaw, origin: [1, 0, 1] }));
      for (const wall of model.walls) {
        const [dx, dz] = directionFromYaw(wall.transform.yaw);
        // Each wall runs along X or along Z.
        expect(Math.min(Math.abs(dx), Math.abs(dz))).toBeCloseTo(0, 3);
      }
      expect(computeMetrics(model).totalAreaM2).toBe(12);
    }
  });
});

describe('convertRoomPlan: several rooms', () => {
  const structure = { version: 2, rooms: [bedroom(), kitchen()] };
  const merged = {
    version: 2,
    walls: [...bedroom().walls, ...kitchen().walls],
    doors: bedroom().doors,
    windows: bedroom().windows,
    openings: bedroom().openings,
    floors: [...bedroom().floors, ...kitchen().floors],
    objects: [...bedroom().objects, ...kitchen().objects],
    sections: [...bedroom().sections, ...kitchen().sections],
  };

  it.each([
    ['a structure with per-room data', structure],
    ['a structure with only merged arrays', merged],
  ])('converts %s', (_name, input) => {
    const { model, warnings } = convertRoomPlan(input);
    expect(warnings).toEqual([]);

    expect(model.rooms.map((room) => [room.id, room.label])).toEqual([
      ['floor-1', 'bedroom'],
      ['floor-2', 'kitchen'],
    ]);
    const metrics = computeMetrics(model);
    expect(metrics.rooms).toEqual([
      { id: 'floor-1', areaM2: 12 },
      { id: 'floor-2', areaM2: 9 },
    ]);
    expect(metrics.totalAreaM2).toBe(21);

    // The two facing walls, 0.15 m apart, each stay with their own room.
    expect(byId(model.walls, 'wall-e').roomId).toBe('floor-1');
    expect(byId(model.walls, 'k-wall-w').roomId).toBe('floor-2');
    expect(model.walls.filter((wall) => wall.roomId === 'floor-1')).toHaveLength(4);
    expect(model.walls.filter((wall) => wall.roomId === 'floor-2')).toHaveLength(4);

    expect(byId(model.objects, 'bed-1').roomId).toBe('floor-1');
    expect(byId(model.objects, 'table-1').roomId).toBe('floor-2');

    // The whole apartment is centered: x spans [-3.575, 3.575].
    const xs = model.rooms.flatMap((room) => room.floor.polygon.map(([x]) => x));
    expect(Math.min(...xs)).toBeCloseTo(-3.575, 3);
    expect(Math.max(...xs)).toBeCloseTo(3.575, 3);
  });

  it('trusts per-room data from the export over geometry', () => {
    // A kitchen object that the scan placed inside the bedroom's floor.
    const stray = object(DEFAULT_PLACEMENT, 'stray-1', 'chair', [0, 0.45, 0], 0, [0.5, 0.9, 0.5]);

    const perRoom = { rooms: [bedroom(), { ...kitchen(), objects: [stray] }] };
    expect(byId(convertRoomPlan(perRoom).model.objects, 'stray-1').roomId).toBe('floor-2');

    const flattened = { ...merged, objects: [stray] };
    expect(byId(convertRoomPlan(flattened).model.objects, 'stray-1').roomId).toBe('floor-1');
  });

  it('does not duplicate elements that appear both per room and merged', () => {
    const { model } = convertRoomPlan({ ...merged, rooms: [bedroom(), kitchen()] });
    expect(model.walls).toHaveLength(8);
    expect(model.rooms).toHaveLength(2);
    expect(model.objects).toHaveLength(3);
  });

  it('drops a merged floor that repeats a room floor under a new identifier', () => {
    const p = DEFAULT_PLACEMENT;
    // As in real exports: the same outline, but a new identifier and a local frame turned 90°.
    const copy = (id: string, local: Vec3, dimensions: Vec3) => ({
      ...floor(p, id, local, dimensions),
      transform: flat(toScan(local, p), p.yaw + Math.PI / 2),
    });
    const input = {
      ...merged,
      floors: [copy('merged-1', [0, 0, 0], [3, 4, 0]), copy('merged-2', [3.65, 0, 0], [3, 3, 0])],
      rooms: [bedroom(), kitchen()],
    };
    const { model } = convertRoomPlan(input);
    expect(model.rooms.map((room) => room.id)).toEqual(['floor-1', 'floor-2']);
    expect(computeMetrics(model).totalAreaM2).toBe(21);
  });

  it('drops a merged floor spanning the rooms, and keeps one the rooms do not cover', () => {
    const p = DEFAULT_PLACEMENT;
    const spanning = floor(p, 'merged-all', [1.575, 0, 0], [7.15, 3, 0]);
    const elsewhere = floor(p, 'merged-elsewhere', [10, 0, 0], [3, 3, 0]);
    const input = { ...merged, floors: [spanning, elsewhere], rooms: [bedroom(), kitchen()] };
    expect(convertRoomPlan(input).model.rooms.map((room) => room.id)).toEqual([
      'floor-1',
      'floor-2',
      'merged-elsewhere',
    ]);
  });
});

describe('convertRoomPlan: format tolerance', () => {
  it('accepts 4x4 nested matrices and plain-string enums', () => {
    const reference = convertRoomPlan(bedroom()).model;

    const nest = (m: number[]) => [m.slice(0, 4), m.slice(4, 8), m.slice(8, 12), m.slice(12, 16)];
    const restyle = <T extends { transform: number[]; category: object; confidence: object }>(
      element: T,
    ) => ({
      ...element,
      transform: nest(element.transform),
      category: Object.keys(element.category)[0],
      confidence: Object.keys(element.confidence)[0],
    });
    const source = bedroom();
    const restyled = {
      ...source,
      walls: source.walls.map(restyle),
      windows: source.windows.map(restyle),
      openings: source.openings.map(restyle),
      floors: source.floors.map(restyle),
      objects: source.objects.map(restyle),
      // Doors keep the keyed form: it carries isOpen.
    };
    expect(convertRoomPlan(restyled).model).toEqual(reference);
  });

  it('reads a floor given as polygon corners', () => {
    const p = DEFAULT_PLACEMENT;
    // L-shape: 6 x 5.5 with a 2.5 x 2.5 corner removed. Corners are in the floor's local plane.
    const corners: Vec3[] = [
      [-3, -2.75, 0],
      [3, -2.75, 0],
      [3, 0.25, 0],
      [0.5, 0.25, 0],
      [0.5, 2.75, 0],
      [-3, 2.75, 0],
    ];
    const input = {
      floors: [{ ...floor(p, 'floor-l', [0, 0, 0], [6, 5.5, 0]), polygonCorners: corners }],
    };
    const { model } = convertRoomPlan(input);
    expect(model.rooms[0]!.floor.polygon).toHaveLength(6);
    expect(computeMetrics(model).totalAreaM2).toBe(26.75);
  });

  it('reads the format version and per-room membership', () => {
    const capture = parseRoomPlanCapture({ version: 2, rooms: [bedroom(), kitchen()] });
    expect(capture.formatVersion).toBe(2);
    expect(capture.walls.find((wall) => wall.id === 'wall-n')?.roomIndex).toBe(0);
    expect(capture.walls.find((wall) => wall.id === 'k-wall-n')?.roomIndex).toBe(1);
    expect(capture.doors[0]).toMatchObject({ parentId: 'wall-s', isOpen: true });
  });

  it('accepts surfaces whose optional keys are left out, as Swift encodes nil', () => {
    const reference = convertRoomPlan(bedroom()).model;
    const strip = (element: Record<string, unknown>) => {
      const copy = { ...element };
      for (const key of ['curve', 'parentIdentifier', 'polygonCorners', 'story']) {
        if (copy[key] === null || (Array.isArray(copy[key]) && copy[key].length === 0)) {
          delete copy[key];
        }
      }
      return copy;
    };
    const source = bedroom();
    const sparse = {
      ...source,
      walls: source.walls.map(strip),
      doors: source.doors.map(strip),
      windows: source.windows.map(strip),
      openings: source.openings.map(strip),
      floors: source.floors.map(strip),
    };
    expect(sparse.walls[0]).not.toHaveProperty('curve');
    expect(convertRoomPlan(sparse).model).toEqual(reference);
  });

  it('rejects input that is not a RoomPlan export', () => {
    expect(() => convertRoomPlan(null)).toThrow(RoomPlanParseError);
    expect(() => convertRoomPlan('{}')).toThrow(RoomPlanParseError);
    expect(() => convertRoomPlan({})).toThrow(RoomPlanParseError);
    expect(() => convertRoomPlan({ walls: [{ identifier: 'w' }] })).toThrow(RoomPlanParseError);
  });
});

describe('convertRoomPlan: warnings', () => {
  const p = DEFAULT_PLACEMENT;
  const codes = (input: unknown) => convertRoomPlan(input).warnings.map((warning) => warning.code);

  it('reports a scan without floors, and still converts the walls', () => {
    const { model, warnings } = convertRoomPlan({ ...bedroom(), floors: [], sections: [] });
    expect(warnings.map((warning) => warning.code)).toContain('no-floors');
    expect(model.rooms).toEqual([]);
    expect(model.walls).toHaveLength(4);
    expect(model.walls.every((wall) => wall.roomId === null)).toBe(true);
    expect(computeMetrics(model).totalAreaM2).toBe(0);
  });

  it('reports a tilted wall', () => {
    const source = bedroom();
    const leaning = { ...source.walls[0]!, transform: flat(toScan([0, 1.3, -1.5], p), p.yaw) };
    const input = { ...source, walls: [leaning, ...source.walls.slice(1)] };
    expect(convertRoomPlan(input).warnings).toContainEqual(
      expect.objectContaining({ code: 'tilted-element', elementId: 'wall-n' }),
    );
  });

  it('reports a curved wall', () => {
    const source = bedroom();
    const curved = { ...source.walls[0]!, curve: { radius: 2, startAngle: 0, endAngle: 1 } };
    expect(codes({ ...source, walls: [curved, ...source.walls.slice(1)] })).toContain(
      'curved-wall-flattened',
    );
  });

  it('reports an aperture that is not on any wall', () => {
    const source = bedroom();
    const lost = surface(p, 'door-lost', 'door', [0, 1, 0], 0, [0.9, 2, 0], {
      parentIdentifier: 'wall-that-is-not-in-the-export',
    });
    const { model, warnings } = convertRoomPlan({ ...source, doors: [lost] });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'orphan-aperture', elementId: 'door-lost' }),
    );
    expect(byId(model.doors, 'door-lost').wallId).toBeNull();
  });

  it('drops elements without size', () => {
    const source = bedroom();
    const flatWall = surface(p, 'wall-zero', 'wall', [0, 1.3, 0], 0, [0, 2.6, 0]);
    const { model, warnings } = convertRoomPlan({ ...source, walls: [...source.walls, flatWall] });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'degenerate-element', elementId: 'wall-zero' }),
    );
    expect(model.walls.map((wall) => wall.id)).not.toContain('wall-zero');
  });

  it('reports a room with fewer than three walls', () => {
    const source = bedroom();
    const { warnings } = convertRoomPlan({ ...source, walls: source.walls.slice(0, 2) });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'incomplete-room', elementId: 'floor-1' }),
    );
    expect(codes(bedroom())).not.toContain('incomplete-room');
  });

  it('reports an object outside every room', () => {
    const source = bedroom();
    const outside = object(p, 'chair-out', 'chair', [20, 0.45, 20], 0, [0.5, 0.9, 0.5]);
    const { model, warnings } = convertRoomPlan({ ...source, objects: [outside] });
    expect(warnings).toContainEqual(
      expect.objectContaining({ code: 'unassigned-element', elementId: 'chair-out' }),
    );
    expect(byId(model.objects, 'chair-out').roomId).toBeNull();
  });
});

describe('convertRoomPlan: one session through several rooms', () => {
  const p = DEFAULT_PLACEMENT;
  /**
   * A 6 x 3 m floor as one RoomPlan room: a 4 x 3 living room and a 2 x 3 bedroom east of it,
   * divided by a wall with a door. `divider` sets that wall's ends along z.
   */
  function oneSession({ divider = [-1.5, 1.5], west = true } = {}) {
    const [z0, z1] = divider as [number, number];
    const walls = [
      surface(p, 's-wall-n', 'wall', [0, 1.3, -1.5], 0, [6, 2.6, 0]),
      surface(p, 's-wall-s', 'wall', [0, 1.3, 1.5], Math.PI, [6, 2.6, 0]),
      surface(p, 's-wall-e', 'wall', [3, 1.3, 0], Math.PI / 2, [3, 2.6, 0]),
      surface(p, 's-divider', 'wall', [1, 1.3, (z0 + z1) / 2], Math.PI / 2, [z1 - z0, 2.6, 0]),
    ];
    if (west) walls.push(surface(p, 's-wall-w', 'wall', [-3, 1.3, 0], -Math.PI / 2, [3, 2.6, 0]));
    return {
      version: 2,
      rooms: [
        {
          version: 2,
          walls,
          doors: [
            surface(p, 's-door', 'door', [1, 1, 0], Math.PI / 2, [0.8, 2, 0], {
              category: { door: { isOpen: true } },
              parentIdentifier: 's-divider',
            }),
          ],
          windows: [],
          openings: [],
          floors: [floor(p, 's-floor', [0, 0, 0], [6, 3, 0])],
          objects: [
            object(p, 's-sofa', 'sofa', [-1, 0.4, 0], 0, [2, 0.8, 0.9]),
            object(p, 's-bed', 'bed', [2, 0.25, 0], 0, [1.4, 0.5, 2]),
          ],
          sections: [
            { label: 'livingRoom', story: 0, center: toScan([-1, 1, 0], p) },
            { label: 'bedroom', story: 0, center: toScan([2, 1, 0.5], p) },
          ],
        },
      ],
    };
  }

  it('splits the floor into the rooms its walls close off', () => {
    const { model, warnings } = convertRoomPlan(oneSession());
    expect(warnings).toEqual([]);
    expect(model.rooms.map((room) => room.label)).toEqual(['livingRoom', 'bedroom']);
    expect(computeMetrics(model).rooms.map((room) => room.areaM2)).toEqual([12, 6]);
    expect(computeMetrics(model).totalAreaM2).toBe(18);

    const [living, bedroom] = model.rooms;
    for (const room of model.rooms) expect(room.id).toMatch(/^s-floor-[0-9a-f]{8}$/);
    expect(byId(model.objects, 's-sofa').roomId).toBe(living!.id);
    expect(byId(model.objects, 's-bed').roomId).toBe(bedroom!.id);
    expect(byId(model.walls, 's-wall-e').roomId).toBe(bedroom!.id);
    expect(byId(model.walls, 's-wall-w').roomId).toBe(living!.id);
    // The dividing wall runs along both rooms; its door goes with it.
    expect(byId(model.doors, 's-door').roomId).toBe(byId(model.walls, 's-divider').roomId);
  });

  it('gives split rooms the same ids every time', () => {
    const first = convertRoomPlan(oneSession()).model.rooms.map((room) => room.id);
    const again = convertRoomPlan(oneSession()).model.rooms.map((room) => room.id);
    expect(again).toEqual(first);
    expect(new Set(first).size).toBe(2);
  });

  it('still splits when the dividing wall stops a few centimeters short', () => {
    const { model } = convertRoomPlan(oneSession({ divider: [-1.42, 1.45] }));
    expect(computeMetrics(model).rooms.map((room) => room.areaM2)).toEqual([12, 6]);
  });

  it('keeps one room, without a warning, when the dividing wall leaves a passage', () => {
    const { model, warnings } = convertRoomPlan(oneSession({ divider: [-1.5, 0.5] }));
    expect(model.rooms.map((room) => room.id)).toEqual(['s-floor']);
    expect(warnings).toEqual([]);
  });

  it('keeps one room, with a warning, when a missing wall leaves part of the floor open', () => {
    const { model, warnings } = convertRoomPlan(oneSession({ west: false }));
    expect(model.rooms.map((room) => room.id)).toEqual(['s-floor']);
    expect(computeMetrics(model).totalAreaM2).toBe(18);
    expect(warnings.map((warning) => warning.code)).toEqual(['rooms-not-split']);
    expect(warnings[0]!.elementId).toBe('s-floor');
  });
});
