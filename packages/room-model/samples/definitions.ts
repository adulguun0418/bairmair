/**
 * Hand-made sample apartments.
 *
 * Each sample is described compactly below (room outlines, where the doors and windows are,
 * furniture), and `buildSample` turns that into a full RoomModel. The JSON files next to this
 * file are generated from it:
 *
 *   pnpm --filter @bairmair/room-model samples
 *
 * Authoring coordinates are plan view `[x, z]` in meters with the origin at the top-left corner
 * of the apartment (x to the right, z down the page). The builder re-centers the result.
 *
 * Like a RoomPlan scan, every room has its own wall surfaces, with a gap between neighbouring
 * rooms where the physical wall is. A door between two rooms is given once, in the middle of
 * that gap, and the builder cuts it into both facing walls.
 */
import {
  boundsOf,
  distanceToSegment,
  parseRoomModel,
  pointInPolygon,
  polygonEdges,
  signedArea,
  yawFromDirection,
  type Aperture,
  type ObjectCategory,
  type Room,
  type RoomLabel,
  type RoomModelV1,
  type RoomObject,
  type Vec2,
  type Wall,
} from '../src/index';
import { roundAngle, roundLength } from '../src/round';

interface RoomSpec {
  id: string;
  label: RoomLabel;
  polygon: Vec2[];
}

interface ApertureSpec {
  kind: 'door' | 'window' | 'opening';
  id: string;
  /** Center of the aperture in plan view. */
  at: Vec2;
  width: number;
  height: number;
  /** Height of the lower edge above the floor. Defaults to 0. */
  sill?: number;
}

interface ObjectSpec {
  id: string;
  category: ObjectCategory;
  /** Center of the object in plan view. */
  at: Vec2;
  size: [width: number, height: number, depth: number];
  yawDeg?: number;
  /** Height of the underside above the floor. Defaults to 0. */
  elevation?: number;
}

interface ApartmentSpec {
  wallHeight: number;
  rooms: RoomSpec[];
  apertures: ApertureSpec[];
  objects: ObjectSpec[];
}

/** How far from a wall an aperture's center may be and still belong to it. */
const APERTURE_SNAP_M = 0.2;

const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

export function buildSample(spec: ApartmentSpec): RoomModelV1 {
  const bounds = boundsOf(spec.rooms.flatMap((room) => room.polygon));
  if (!bounds) throw new Error('A sample needs at least one room.');
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerZ = (bounds.min[1] + bounds.max[1]) / 2;
  const shift = ([x, z]: Vec2): Vec2 => [x - centerX, z - centerZ];

  const rooms: Room[] = spec.rooms.map((room) => {
    let polygon = room.polygon.map((point): Vec2 => {
      const [x, z] = shift(point);
      return [roundLength(x), roundLength(z)];
    });
    if (signedArea(polygon) < 0) polygon = polygon.reverse();
    return { id: room.id, label: room.label, story: 0, floor: { polygon, y: 0 } };
  });

  // One wall surface per floor edge.
  const edges = rooms.flatMap((room) =>
    [...polygonEdges(room.floor.polygon)].map(([start, end], index) => {
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      const wall: Wall = {
        id: `${room.id}-wall-${index + 1}`,
        roomId: room.id,
        transform: {
          position: [
            roundLength((start[0] + end[0]) / 2),
            roundLength(spec.wallHeight / 2),
            roundLength((start[1] + end[1]) / 2),
          ],
          yaw: roundAngle(yawFromDirection(end[0] - start[0], end[1] - start[1])),
        },
        dimensions: { width: roundLength(length), height: spec.wallHeight, depth: 0 },
      };
      return { wall, start, end, length };
    }),
  );

  const apertures: Record<ApertureSpec['kind'], Aperture[]> = { door: [], window: [], opening: [] };
  for (const aperture of spec.apertures) {
    const at = shift(aperture.at);
    const hosts = edges.filter(
      (edge) => distanceToSegment(at, edge.start, edge.end) <= APERTURE_SNAP_M,
    );
    if (hosts.length === 0) throw new Error(`Aperture "${aperture.id}" is not on any wall.`);

    for (const { wall, start, end, length } of hosts) {
      const dirX = (end[0] - start[0]) / length;
      const dirZ = (end[1] - start[1]) / length;
      const along = (at[0] - start[0]) * dirX + (at[1] - start[1]) * dirZ;
      if (along < aperture.width / 2 || along > length - aperture.width / 2) {
        throw new Error(`Aperture "${aperture.id}" does not fit inside wall "${wall.id}".`);
      }
      apertures[aperture.kind].push({
        id: hosts.length === 1 ? aperture.id : `${aperture.id}-${wall.roomId}`,
        roomId: wall.roomId,
        wallId: wall.id,
        transform: {
          position: [
            roundLength(start[0] + dirX * along),
            roundLength((aperture.sill ?? 0) + aperture.height / 2),
            roundLength(start[1] + dirZ * along),
          ],
          yaw: wall.transform.yaw,
        },
        dimensions: { width: aperture.width, height: aperture.height, depth: 0 },
      });
    }
  }

  const objects: RoomObject[] = spec.objects.map((object) => {
    const at = shift(object.at);
    const room = rooms.find((candidate) => pointInPolygon(at, candidate.floor.polygon));
    if (!room) throw new Error(`Object "${object.id}" is not inside any room.`);
    const [width, height, depth] = object.size;
    return {
      id: object.id,
      roomId: room.id,
      category: object.category,
      transform: {
        position: [
          roundLength(at[0]),
          roundLength((object.elevation ?? 0) + height / 2),
          roundLength(at[1]),
        ],
        yaw: roundAngle(((object.yawDeg ?? 0) * Math.PI) / 180),
      },
      dimensions: { width, height, depth },
    };
  });

  return parseRoomModel({
    schemaVersion: 1,
    source: { kind: 'manual', converterVersion: 'samples-1' },
    frame: { fromSource: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    rooms,
    walls: edges.map((edge) => edge.wall),
    doors: apertures.door,
    windows: apertures.window,
    openings: apertures.opening,
    objects,
    hotspots: [],
  });
}

/**
 * A studio of about 29 m²: one L-shaped main room wrapped around a bathroom in the corner.
 *
 *   +---------+-----------------------+
 *   | bath    |  kitchen wall         |
 *   +----D----+                       W
 *   |             main                W
 *   |                                 |
 *   +--D------------------------------+
 */
const studio: ApartmentSpec = {
  wallHeight: 2.6,
  rooms: [
    {
      id: 'main',
      label: 'livingRoom',
      polygon: [
        [2.2, 0],
        [6, 0],
        [6, 5],
        [0, 5],
        [0, 2],
        [2.2, 2],
      ],
    },
    { id: 'bathroom', label: 'bathroom', polygon: rect(0, 0, 2, 1.8) },
  ],
  apertures: [
    { kind: 'door', id: 'entrance', at: [1, 5], width: 0.9, height: 2.05 },
    { kind: 'door', id: 'bathroom-door', at: [2.1, 0.9], width: 0.7, height: 2 },
    { kind: 'window', id: 'main-window', at: [6, 2.5], width: 2.4, height: 1.5, sill: 0.8 },
  ],
  objects: [
    { id: 'bed', category: 'bed', at: [4.9, 3.9], size: [1.6, 0.5, 2] },
    { id: 'sofa', category: 'sofa', at: [0.5, 3.3], size: [2, 0.8, 0.9], yawDeg: 90 },
    { id: 'table', category: 'table', at: [3.2, 2.6], size: [1.2, 0.75, 0.8] },
    { id: 'chair-1', category: 'chair', at: [3.2, 1.95], size: [0.45, 0.9, 0.45] },
    { id: 'chair-2', category: 'chair', at: [3.2, 3.25], size: [0.45, 0.9, 0.45], yawDeg: 180 },
    { id: 'refrigerator', category: 'refrigerator', at: [2.55, 0.38], size: [0.6, 1.8, 0.65] },
    { id: 'stove', category: 'stove', at: [3.25, 0.33], size: [0.6, 0.9, 0.6] },
    { id: 'kitchen-sink', category: 'sink', at: [3.9, 0.33], size: [0.6, 0.9, 0.6] },
    { id: 'wardrobe', category: 'storage', at: [5.35, 0.33], size: [1.2, 2, 0.6] },
    { id: 'toilet', category: 'toilet', at: [0.4, 0.4], size: [0.4, 0.8, 0.65] },
    { id: 'bathroom-sink', category: 'sink', at: [1.6, 0.25], size: [0.5, 0.85, 0.45] },
    { id: 'bathtub', category: 'bathtub', at: [0.8, 1.42], size: [1.5, 0.55, 0.7] },
  ],
};

/**
 * A typical "2 өрөө" apartment of about 55 m²: living room and bedroom on the window side,
 * kitchen, hallway and bathroom on the entrance side. The kitchen has a doorless opening.
 *
 *   +--------WW--------+------WW------+
 *   |     living       |   bedroom    |
 *   |                  |              |
 *   +--------------D---+--D-----------+
 *   |  kitchen   O  hallway  D  bath  |
 *   |            |           |        |
 *   +----WW------+-----D-----+--------+
 */
const twoRoom: ApartmentSpec = {
  wallHeight: 2.7,
  rooms: [
    { id: 'living', label: 'livingRoom', polygon: rect(0, 0, 4.2, 4) },
    { id: 'bedroom', label: 'bedroom', polygon: rect(4.35, 0, 7.85, 4) },
    { id: 'kitchen', label: 'kitchen', polygon: rect(0, 4.15, 3, 7.35) },
    { id: 'hallway', label: 'hallway', polygon: rect(3.15, 4.15, 5.65, 7.35) },
    { id: 'bathroom', label: 'bathroom', polygon: rect(5.8, 4.15, 7.85, 7.35) },
  ],
  apertures: [
    { kind: 'door', id: 'entrance', at: [4.4, 7.35], width: 0.9, height: 2.05 },
    { kind: 'door', id: 'living-door', at: [3.65, 4.075], width: 0.8, height: 2 },
    { kind: 'door', id: 'bedroom-door', at: [5, 4.075], width: 0.8, height: 2 },
    { kind: 'door', id: 'bathroom-door', at: [5.725, 5.5], width: 0.7, height: 2 },
    { kind: 'opening', id: 'kitchen-opening', at: [3.075, 5], width: 0.9, height: 2.1 },
    { kind: 'window', id: 'living-window', at: [2.1, 0], width: 2, height: 1.5, sill: 0.8 },
    { kind: 'window', id: 'bedroom-window', at: [6.1, 0], width: 1.6, height: 1.5, sill: 0.8 },
    { kind: 'window', id: 'kitchen-window', at: [1.5, 7.35], width: 1.2, height: 1.3, sill: 0.9 },
  ],
  objects: [
    { id: 'sofa', category: 'sofa', at: [0.5, 2], size: [2.2, 0.8, 0.9], yawDeg: 90 },
    { id: 'coffee-table', category: 'table', at: [1.9, 2], size: [1, 0.45, 0.6] },
    {
      id: 'television',
      category: 'television',
      at: [4.12, 2],
      size: [1.2, 0.7, 0.08],
      yawDeg: 90,
      elevation: 0.9,
    },
    { id: 'living-cabinet', category: 'storage', at: [2.2, 3.72], size: [1.6, 2, 0.45] },
    { id: 'bed', category: 'bed', at: [6.8, 2], size: [1.8, 0.5, 2], yawDeg: 90 },
    { id: 'wardrobe', category: 'storage', at: [4.68, 1.5], size: [1.8, 2.1, 0.6], yawDeg: 90 },
    {
      id: 'refrigerator',
      category: 'refrigerator',
      at: [0.35, 4.5],
      size: [0.6, 1.85, 0.65],
      yawDeg: 90,
    },
    { id: 'stove', category: 'stove', at: [0.32, 5.2], size: [0.6, 0.9, 0.6], yawDeg: 90 },
    { id: 'kitchen-sink', category: 'sink', at: [0.32, 5.9], size: [0.6, 0.9, 0.6], yawDeg: 90 },
    { id: 'dining-table', category: 'table', at: [2, 6.4], size: [0.9, 0.75, 0.9] },
    { id: 'chair-1', category: 'chair', at: [2, 5.7], size: [0.45, 0.9, 0.45], yawDeg: 180 },
    { id: 'chair-2', category: 'chair', at: [1.3, 6.4], size: [0.45, 0.9, 0.45], yawDeg: 90 },
    { id: 'bathtub', category: 'bathtub', at: [7.45, 5.1], size: [1.7, 0.55, 0.75], yawDeg: 90 },
    { id: 'bathroom-sink', category: 'sink', at: [7.6, 6.4], size: [0.6, 0.85, 0.45], yawDeg: 90 },
    { id: 'toilet', category: 'toilet', at: [6.9, 7], size: [0.4, 0.8, 0.65], yawDeg: 180 },
    { id: 'washer', category: 'washerDryer', at: [6.15, 6.95], size: [0.6, 0.85, 0.6] },
    { id: 'shoe-cabinet', category: 'storage', at: [5.45, 6.8], size: [1, 1, 0.35], yawDeg: 90 },
  ],
};

/**
 * An L-shaped living and dining room with a kitchen in the notch, joined by a wide doorless
 * opening. About 32 m². Exercises non-rectangular floors.
 *
 *   +----------WWW-----------+
 *   |        living          |
 *   |             +----------+
 *   |  dining     O kitchen  W
 *   D             |          |
 *   +-------------+----------+
 */
const lShaped: ApartmentSpec = {
  wallHeight: 2.6,
  rooms: [
    {
      id: 'living',
      label: 'livingRoom',
      polygon: [
        [0, 0],
        [6, 0],
        [6, 3],
        [3.5, 3],
        [3.5, 5.5],
        [0, 5.5],
      ],
    },
    { id: 'kitchen', label: 'kitchen', polygon: rect(3.65, 3.15, 6, 5.5) },
  ],
  apertures: [
    { kind: 'door', id: 'entrance', at: [0, 4.6], width: 0.9, height: 2.05 },
    { kind: 'opening', id: 'kitchen-opening', at: [3.575, 4.3], width: 1.2, height: 2.2 },
    { kind: 'window', id: 'living-window', at: [3, 0], width: 2.4, height: 1.5, sill: 0.8 },
    { kind: 'window', id: 'kitchen-window', at: [6, 4.3], width: 1, height: 1.2, sill: 1 },
  ],
  objects: [
    { id: 'sofa', category: 'sofa', at: [4.75, 2.5], size: [2.2, 0.8, 0.9], yawDeg: 180 },
    { id: 'coffee-table', category: 'table', at: [4.75, 1.4], size: [1, 0.45, 0.6] },
    {
      id: 'television',
      category: 'television',
      at: [5, 0.06],
      size: [1.3, 0.75, 0.08],
      elevation: 0.9,
    },
    { id: 'dining-table', category: 'table', at: [1.6, 3.6], size: [1.4, 0.75, 0.85] },
    { id: 'chair-1', category: 'chair', at: [1.6, 2.95], size: [0.45, 0.9, 0.45] },
    { id: 'chair-2', category: 'chair', at: [1.6, 4.25], size: [0.45, 0.9, 0.45], yawDeg: 180 },
    { id: 'chair-3', category: 'chair', at: [0.65, 3.6], size: [0.45, 0.9, 0.45], yawDeg: 90 },
    { id: 'chair-4', category: 'chair', at: [2.55, 3.6], size: [0.45, 0.9, 0.45], yawDeg: -90 },
    { id: 'cabinet', category: 'storage', at: [1.75, 5.25], size: [1.5, 1.9, 0.45] },
    { id: 'refrigerator', category: 'refrigerator', at: [5.65, 3.5], size: [0.6, 1.85, 0.65] },
    { id: 'stove', category: 'stove', at: [4.9, 3.47], size: [0.6, 0.9, 0.6] },
    { id: 'kitchen-sink', category: 'sink', at: [4.2, 3.47], size: [0.6, 0.9, 0.6] },
  ],
};

/** File name (without `.json`) to sample definition. */
export const SAMPLE_SPECS = {
  studio,
  'two-room': twoRoom,
  'l-shaped': lShaped,
} satisfies Record<string, ApartmentSpec>;

export type SampleName = keyof typeof SAMPLE_SPECS;
