import {
  apertureCutout,
  boundsOf,
  directionFromYaw,
  inwardNormal,
  wallEndpoints,
  wallSegments,
  type Aperture,
  type Room,
  type RoomModelV1,
  type Vec2,
  type Wall,
} from '@bairmair/room-model';
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  MeshStandardMaterial,
  Shape,
  Vector2,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Drawn wall thickness. RoomPlan walls are surfaces without thickness. */
export const WALL_THICKNESS_M = 0.1;
/** Thickness of the slab drawn under each floor. */
const FLOOR_SLAB_M = 0.06;
/** Two wall ends closer than this meet at a corner. */
const CORNER_SNAP_M = 0.08;
/** A door whose bottom is this close to the floor gets a threshold. */
const THRESHOLD_SNAP_M = 0.05;

export const GLASS_OPACITY = 0.35;

export const COLORS = {
  wall: new Color('#f3efe8'),
  /** Top of the walls, where the "dollhouse" cut is. */
  wallCap: new Color('#3a3f44'),
  floor: '#ddcfb5',
  floorSelected: '#f6cf7e',
  threshold: '#d9ccb4',
  glass: '#bcdff1',
} as const;

export interface WindowPane {
  /** Wall-local position of the pane center. */
  position: [number, number, number];
  width: number;
  height: number;
}

export interface WallMesh {
  id: string;
  /** All solid parts of the wall, in wall-local coordinates. */
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  glassMaterial: MeshStandardMaterial;
  panes: WindowPane[];
  position: [number, number, number];
  yaw: number;
  /** Plan-view center of the wall. */
  center: Vec2;
  /** Plan-view normal pointing out of the wall's room; `null` when the wall has no room. */
  outward: Vec2 | null;
}

export interface FloorMesh {
  room: Room;
  geometry: BufferGeometry;
}

export interface SceneData {
  walls: WallMesh[];
  floors: FloorMesh[];
  /** Door and opening thresholds, merged into one geometry. */
  thresholds: BufferGeometry | null;
  bounds: { min: Vec2; max: Vec2; floorY: number; top: number };
  dispose(): void;
}

/** A box with per-vertex colors: dark on top when `cap` is set, wall color elsewhere. */
function wallBox(
  width: number,
  height: number,
  depth: number,
  center: [number, number, number],
  cap: boolean,
): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const color = cap && normals.getY(i) > 0.5 ? COLORS.wallCap : COLORS.wall;
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.translate(...center);
  return geometry;
}

function merge(geometries: BufferGeometry[]): BufferGeometry {
  const merged = geometries.length > 0 ? mergeGeometries(geometries) : null;
  for (const geometry of geometries) geometry.dispose();
  return merged ?? new BufferGeometry();
}

/** Plan-view direction of a wall's local +Z axis (three.js convention). */
const localZ = (yaw: number): Vec2 => [Math.sin(yaw), Math.cos(yaw)];

function sharedEndpoint(a: [Vec2, Vec2], b: [Vec2, Vec2]): Vec2 | null {
  for (const p of a) {
    for (const q of b) {
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < CORNER_SNAP_M) {
        return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      }
    }
  }
  return null;
}

/**
 * Builds the three.js geometry for a model. Walls get thickness on the side away from their
 * room, so interior dimensions stay as scanned; doors and windows are cut out of them.
 *
 * Call `dispose()` when the scene is no longer shown.
 */
export function buildScene(model: RoomModelV1): SceneData {
  const T = WALL_THICKNESS_M;
  const rooms = new Map(model.rooms.map((room) => [room.id, room]));
  const windowIds = new Set(model.windows.map((window) => window.id));

  const aperturesByWall = new Map<string, Aperture[]>();
  for (const aperture of [...model.doors, ...model.windows, ...model.openings]) {
    if (aperture.wallId === null) continue;
    aperturesByWall.set(aperture.wallId, [
      ...(aperturesByWall.get(aperture.wallId) ?? []),
      aperture,
    ]);
  }

  const thresholdPieces: BufferGeometry[] = [];

  const drafts = model.walls.map((wall: Wall) => {
    const [x, y, z] = wall.transform.position;
    const yaw = wall.transform.yaw;
    const { width, height } = wall.dimensions;
    const polygon = wall.roomId === null ? undefined : rooms.get(wall.roomId)?.floor.polygon;
    const inward = polygon ? inwardNormal([x, z], yaw, polygon) : null;
    const outward: Vec2 | null = inward ? [-inward[0], -inward[1]] : null;
    const zAxis = localZ(yaw);
    // Thickness goes outward. A wall without a room is centered on its surface.
    const offset = outward ? Math.sign(outward[0] * zAxis[0] + outward[1] * zAxis[1]) * (T / 2) : 0;

    const cutouts = (aperturesByWall.get(wall.id) ?? []).map((aperture) => ({
      aperture,
      cutout: apertureCutout(aperture, wall),
    }));
    const pieces = wallSegments(
      width,
      height,
      cutouts.map(({ cutout }) => cutout),
    ).map((s) =>
      wallBox(
        s.u1 - s.u0,
        s.v1 - s.v0,
        T,
        [(s.u0 + s.u1) / 2, (s.v0 + s.v1) / 2, offset],
        s.v1 >= height / 2 - 0.001,
      ),
    );

    const panes: WindowPane[] = [];
    for (const { aperture, cutout } of cutouts) {
      if (windowIds.has(aperture.id)) {
        panes.push({
          position: [cutout.u, cutout.v, offset],
          width: Math.min(cutout.width, width),
          height: Math.min(cutout.height, height),
        });
      } else if (cutout.v - cutout.height / 2 <= -height / 2 + THRESHOLD_SNAP_M) {
        // Fill the floor under a door or opening, across the wall's thickness.
        const threshold = new BoxGeometry(cutout.width, FLOOR_SLAB_M, T);
        threshold.translate(cutout.u, -height / 2 - FLOOR_SLAB_M / 2, offset);
        threshold.rotateY(yaw);
        threshold.translate(x, y, z);
        thresholdPieces.push(threshold);
      }
    }

    return { wall, outward, pieces, panes, center: [x, z] as Vec2 };
  });

  // Fill the square gap at the outside of each convex corner, where two walls that only got
  // thickness outward do not meet. At inner corners the walls already overlap.
  const byRoom = new Map<string, typeof drafts>();
  for (const draft of drafts) {
    if (draft.wall.roomId === null || !draft.outward) continue;
    byRoom.set(draft.wall.roomId, [...(byRoom.get(draft.wall.roomId) ?? []), draft]);
  }
  for (const group of byRoom.values()) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i]!;
      for (let j = i + 1; j < group.length; j++) {
        const b = group[j]!;
        const na = a.outward!;
        const nb = b.outward!;
        if (Math.abs(na[0] * nb[0] + na[1] * nb[1]) > 0.95) continue;
        const corner = sharedEndpoint(wallEndpoints(a.wall), wallEndpoints(b.wall));
        if (!corner) continue;
        const post: Vec2 = [
          corner[0] + ((na[0] + nb[0]) * T) / 2,
          corner[1] + ((na[1] + nb[1]) * T) / 2,
        ];
        const yaw = a.wall.transform.yaw;
        const dir = directionFromYaw(yaw);
        const zAxis = localZ(yaw);
        const dx = post[0] - a.center[0];
        const dz = post[1] - a.center[1];
        const u = dx * dir[0] + dz * dir[1];
        if (Math.abs(u) < a.wall.dimensions.width / 2) continue; // inner corner: covered
        a.pieces.push(
          wallBox(T, a.wall.dimensions.height, T, [u, 0, dx * zAxis[0] + dz * zAxis[1]], true),
        );
      }
    }
  }

  const walls: WallMesh[] = drafts.map((draft) => ({
    id: draft.wall.id,
    geometry: merge(draft.pieces),
    material: new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
      // Always transparent so walls can fade without recompiling shaders.
      transparent: true,
    }),
    glassMaterial: new MeshStandardMaterial({
      color: COLORS.glass,
      roughness: 0.15,
      metalness: 0,
      transparent: true,
      opacity: GLASS_OPACITY,
      depthWrite: false,
      side: DoubleSide,
    }),
    panes: draft.panes,
    position: draft.wall.transform.position,
    yaw: draft.wall.transform.yaw,
    center: draft.center,
    outward: draft.outward,
  }));

  const floors: FloorMesh[] = model.rooms.map((room) => {
    // Shape space is (x, -z); rotating it onto the ground maps it back to (x, z).
    const shape = new Shape(room.floor.polygon.map(([x, z]) => new Vector2(x, -z)));
    const geometry = new ExtrudeGeometry(shape, { depth: FLOOR_SLAB_M, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, room.floor.y - FLOOR_SLAB_M, 0);
    return { room, geometry };
  });

  const thresholds = thresholdPieces.length > 0 ? merge(thresholdPieces) : null;

  const plan = boundsOf([
    ...model.rooms.flatMap((room) => room.floor.polygon),
    ...model.walls.flatMap((wall) => wallEndpoints(wall)),
  ]) ?? { min: [-2, -2] as Vec2, max: [2, 2] as Vec2 };
  const floorY = model.rooms.reduce((lowest, room) => Math.min(lowest, room.floor.y), 0);
  const top = model.walls.reduce(
    (highest, wall) => Math.max(highest, wall.transform.position[1] + wall.dimensions.height / 2),
    floorY + 2.5,
  );

  return {
    walls,
    floors,
    thresholds,
    bounds: { min: plan.min, max: plan.max, floorY, top },
    dispose() {
      for (const wall of walls) {
        wall.geometry.dispose();
        wall.material.dispose();
        wall.glassMaterial.dispose();
      }
      for (const floor of floors) floor.geometry.dispose();
      thresholds?.dispose();
    },
  };
}
