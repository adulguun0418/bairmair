import { describe, expect, it } from 'vitest';
import {
  enclosedFaces,
  incompleteRoomIds,
  lengthAlongOutline,
  outlineWallCount,
  polygonArea,
  signedArea,
  yawFromDirection,
  type RoomModelV1,
  type Vec2,
  type Wall,
} from '../src/index';
import { minimalModel } from './helpers';

type Segment = [Vec2, Vec2];

/** The four walls of an axis-aligned rectangle. */
const box = (x0: number, z0: number, x1: number, z1: number): Segment[] => [
  [
    [x0, z0],
    [x1, z0],
  ],
  [
    [x1, z0],
    [x1, z1],
  ],
  [
    [x1, z1],
    [x0, z1],
  ],
  [
    [x0, z1],
    [x0, z0],
  ],
];

const areas = (faces: Vec2[][]) =>
  faces.map((face) => Math.round(polygonArea(face) * 100) / 100).sort((a, b) => b - a);

describe('enclosedFaces', () => {
  it('finds a single room, counter-clockwise, with only its four corners', () => {
    const faces = enclosedFaces(box(0, 0, 4, 3));
    expect(faces).toHaveLength(1);
    expect(faces[0]).toHaveLength(4);
    expect(signedArea(faces[0]!)).toBeCloseTo(12, 6);
  });

  it('splits a floor at a wall that ends on two other walls (T-junctions)', () => {
    const faces = enclosedFaces([
      ...box(0, 0, 6, 3),
      [
        [4, 0],
        [4, 3],
      ],
    ]);
    expect(areas(faces)).toEqual([12, 6]);
    // The T-junction corners lie on straight lines and are dropped.
    expect(faces.map((face) => face.length)).toEqual([4, 4]);
  });

  it('closes a gap of a few centimeters at a T-junction', () => {
    const faces = enclosedFaces([
      ...box(0, 0, 6, 3),
      [
        [4, 0.1],
        [4, 2.92],
      ],
    ]);
    expect(areas(faces)).toEqual([12, 6]);
  });

  it('does not close a doorway-sized gap', () => {
    const faces = enclosedFaces([
      ...box(0, 0, 6, 3),
      [
        [4, 0],
        [4, 2.1],
      ],
    ]);
    expect(areas(faces)).toEqual([18]);
  });

  it('finds nothing when the walls do not close', () => {
    const open = box(0, 0, 4, 3).slice(0, 3);
    expect(enclosedFaces(open)).toEqual([]);
  });

  it('handles an L-shaped corridor ending on a long wall, as in a real scan', () => {
    // A 5 x 3 living room; a corridor west of it, closed by the living room's west wall.
    const corridor: Segment[] = [
      [
        [0, 1],
        [-1.6, 1],
      ],
      [
        [-1.6, 1],
        [-1.6, 2],
      ],
      [
        [-1.6, 2],
        [-1.8, 2],
      ],
      [
        [-1.8, 2],
        [-1.8, 2.9],
      ],
      [
        [-1.8, 2.9],
        [0, 2.9],
      ],
    ];
    const faces = enclosedFaces([...box(0, 0, 3, 5), ...corridor]);
    expect(areas(faces)).toEqual([15, 3.22]);
  });

  it('treats a wall scanned twice (overlapping copies) as one', () => {
    const faces = enclosedFaces([
      ...box(0, 0, 4, 3),
      [
        [0.5, 0],
        [3.5, 0],
      ],
    ]);
    expect(areas(faces)).toEqual([12]);
  });

  it('is deterministic', () => {
    const walls: Segment[] = [
      ...box(0, 0, 6, 3),
      [
        [4, 0],
        [4, 3],
      ],
    ];
    expect(enclosedFaces(walls)).toEqual(enclosedFaces(walls));
  });
});

describe('lengthAlongOutline', () => {
  const outline: Vec2[] = [
    [0, 0],
    [4, 0],
    [4, 3],
    [0, 3],
  ];

  it('measures the part of a wall that runs along the outline', () => {
    expect(lengthAlongOutline([-1, 0], [2, 0], outline, 0.3)).toBeCloseTo(2, 6);
    expect(lengthAlongOutline([4.2, 0], [4.2, 3], outline, 0.3)).toBeCloseTo(3, 6);
  });

  it('ignores walls that are too far away or cross the outline', () => {
    expect(lengthAlongOutline([4.5, 0], [4.5, 3], outline, 0.3)).toBe(0);
    expect(lengthAlongOutline([2, -1], [2, 4], outline, 0.3)).toBe(0);
  });
});

describe('incompleteRoomIds', () => {
  const wall = (id: string, [a, b]: Segment): Wall => ({
    id,
    roomId: 'big',
    transform: {
      position: [(a[0] + b[0]) / 2, 1.3, (a[1] + b[1]) / 2],
      yaw: yawFromDirection(b[0] - a[0], b[1] - a[1]),
    },
    dimensions: { width: Math.hypot(b[0] - a[0], b[1] - a[1]), height: 2.6, depth: 0 },
  });
  const room = (id: string, polygon: Vec2[]) => ({
    id,
    label: 'other' as const,
    story: 0,
    floor: { polygon, y: 0 },
  });
  const model = (walls: Wall[]): RoomModelV1 => ({
    ...minimalModel(),
    rooms: [
      room('big', [
        [0, 0],
        [4, 0],
        [4, 3],
        [0, 3],
      ]),
      room('small', [
        [4, 0],
        [6, 0],
        [6, 3],
        [4, 3],
      ]),
    ],
    walls,
    doors: [],
    windows: [],
    openings: [],
    objects: [],
    hotspots: [],
  });

  it('counts walls shared with a neighbour for both rooms', () => {
    // Every wall is assigned to the big room, but the small one is closed all the way round.
    const walls = [
      ...box(0, 0, 6, 3),
      [
        [4, 0],
        [4, 3],
      ] as Segment,
    ].map((segment, i) => wall(`w${i}`, segment));
    const m = model(walls);
    expect(outlineWallCount(m.walls, m.rooms[1]!.floor.polygon)).toBe(4);
    expect(incompleteRoomIds(m)).toEqual([]);
  });

  it('reports a room with fewer than three walls along its outline', () => {
    const walls = box(0, 0, 4, 3).map((segment, i) => wall(`w${i}`, segment));
    expect(incompleteRoomIds(model(walls))).toEqual(['small']);
  });
});
