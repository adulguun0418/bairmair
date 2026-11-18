import {
  apertureCutout,
  boundsOf,
  directionFromYaw,
  doorHinge,
  findEntrance,
  inwardNormal,
  isSameDoor,
  pointInPolygon,
  wallEndpoints,
  wallSegments,
  type Aperture,
  type ApertureCutout,
  type Room,
  type RoomModelV1,
  type Vec2,
  type Vec3,
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
  Plane,
  Shape,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Drawn wall thickness. RoomPlan walls are surfaces without thickness. */
export const WALL_THICKNESS_M = 0.1;
/** Thickness of the slab drawn under each floor. */
const FLOOR_SLAB_M = 0.06;
/** Two wall ends closer than this meet at a corner. */
const CORNER_SNAP_M = 0.08;
/** Seller divider dash and gap lengths on the floor. */
const DIVIDER_DASH_M = 0.15;
const DIVIDER_GAP_M = 0.1;
/** A door whose bottom is this close to the floor gets a threshold. */
const THRESHOLD_SNAP_M = 0.05;
/** Height of the dark slab on top of each wall (the "dollhouse" cut line). */
const CAP_M = 0.02;
/**
 * A wall between the camera and its room is cut down to this height above its bottom (a
 * cutaway): still a solid wall, but no longer in the way.
 */
export const CUT_WALL_M = 0.45;

/** Door and window trim, in meters. */
const CASING_M = 0.07;
const CASING_PROUD_M = 0.015;
const LEAF_THICKNESS_M = 0.045;
const HANDLE_HEIGHT_M = 1.0;
const WINDOW_FRAME_M = 0.06;
const WINDOW_FRAME_DEPTH_M = 0.08;
const MULLION_M = 0.045;
/** Windows are split into panes about this wide. */
const PANE_WIDTH_M = 0.8;
const SILL_DEPTH_M = 0.14;
const SILL_THICKNESS_M = 0.03;
/**
 * The entrance label lies on the floor this far outside its door: outside the apartment, where
 * no room label or photo marker can be (above the door it collided with the hallway's markers).
 */
const ENTRANCE_LABEL_OUT_M = 0.55;

export const GLASS_OPACITY = 0.5;

export const COLORS = {
  wall: new Color('#f3efe8'),
  /** Top of the walls, where the "dollhouse" cut is. */
  wallCap: new Color('#3a3f44'),
  floor: '#ddcfb5',
  floorSelected: '#f6cf7e',
  threshold: '#d9ccb4',
  glass: '#8ecdee',
  glassGlow: '#cfeefc',
  /** Window frames: dark, so a window reads as a window against the light wall. */
  windowFrame: new Color('#3d4654'),
  windowSill: new Color('#ffffff'),
  doorLeaf: new Color('#c49a6c'),
  doorCasing: new Color('#9c7651'),
  doorHandle: new Color('#5c636a'),
  /** The front door: brand navy with a brass handle, unlike every other door. */
  entranceLeaf: new Color('#1a2b60'),
  entranceCasing: new Color('#0e1733'),
  entranceHandle: new Color('#d6a640'),
  /** Seller dividers: dashes on the floor, so they never pass for a scanned wall. */
  divider: '#3a3f44',
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
  /** The dark slab on its top, in wall-local coordinates; moved down with the cut. */
  cap: BufferGeometry;
  material: MeshStandardMaterial;
  glassMaterial: MeshStandardMaterial;
  /**
   * Cuts the wall (and its glass) above `clip.constant`, in model Y. Between `top` (whole wall)
   * and `bottom + CUT_WALL_M` (cut away).
   */
  clip: Plane;
  /** Model Y of the wall's top and bottom. */
  top: number;
  bottom: number;
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

export interface EntranceMesh {
  /** The front door's frame, leaf and handle, in model coordinates. */
  geometry: BufferGeometry;
  /** Where its label goes: on the floor just outside the door. */
  labelPosition: Vec3;
  /** Plan-view unit vector pointing out of the apartment through the door. */
  outward: Vec2;
}

export interface SceneData {
  walls: WallMesh[];
  floors: FloorMesh[];
  /** Door and opening thresholds, merged into one geometry. */
  thresholds: BufferGeometry | null;
  /** Seller dividers as dashes lying on the floor, merged into one geometry. */
  dividers: BufferGeometry | null;
  /** The front door, drawn apart so it stays whole when its wall is cut down; `null` when unknown. */
  entrance: EntranceMesh | null;
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

/** A box in one color (vertex colors, like the walls, so it merges into the wall geometry). */
function coloredBox(
  width: number,
  height: number,
  depth: number,
  center: [number, number, number],
  color: Color,
): BufferGeometry {
  const geometry = new BoxGeometry(width, height, depth);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.translate(...center);
  return geometry;
}

interface DoorPalette {
  leaf: Color;
  casing: Color;
  handle: Color;
}

/**
 * A door's frame and leaf, in wall-local coordinates. A closed door fills its opening; an open
 * one stands at 90 degrees into its room, hinged on the side the floor plan draws.
 */
function doorParts(
  cutout: ApertureCutout,
  wallHeight: number,
  offset: number,
  hingeAtStart: boolean,
  /** Sign of wall-local Z on the side the door opens to. */
  swing: number,
  open: boolean,
  palette: DoorPalette,
): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const u0 = cutout.u - cutout.width / 2;
  const u1 = cutout.u + cutout.width / 2;
  const v0 = Math.max(-wallHeight / 2, cutout.v - cutout.height / 2);
  const v1 = Math.min(wallHeight / 2 - CASING_M / 2, cutout.v + cutout.height / 2);
  if (u1 - u0 < 3 * CASING_M || v1 - v0 < 3 * CASING_M) return parts;
  const depth = 2 * Math.abs(offset) + 2 * CASING_PROUD_M;
  const jambHeight = v1 - v0 + CASING_M / 2;

  // Frame: two jambs and a head, half over the wall and half in the opening.
  for (const u of [u0, u1]) {
    parts.push(
      coloredBox(CASING_M, jambHeight, depth, [u, v0 + jambHeight / 2, offset], palette.casing),
    );
  }
  parts.push(
    coloredBox(u1 - u0 + CASING_M, CASING_M, depth, [cutout.u, v1, offset], palette.casing),
  );

  const leafWidth = u1 - u0 - CASING_M;
  const leafHeight = v1 - v0 - CASING_M / 2;
  const leafV = v0 + leafHeight / 2;
  const hingeU = hingeAtStart ? u0 + CASING_M / 2 : u1 - CASING_M / 2;
  const toLatch = hingeAtStart ? 1 : -1;
  const handleV = v0 + Math.min(HANDLE_HEIGHT_M, leafHeight * 0.5);
  const handle = (size: [number, number, number], at: [number, number, number]) =>
    coloredBox(...size, at, palette.handle);

  if (!open) {
    parts.push(
      coloredBox(leafWidth, leafHeight, LEAF_THICKNESS_M, [cutout.u, leafV, offset], palette.leaf),
    );
    // A lever through the leaf, near the latch side.
    parts.push(
      handle(
        [0.12, 0.025, LEAF_THICKNESS_M + 0.07],
        [hingeU + toLatch * (leafWidth - 0.1), handleV, offset],
      ),
    );
    return parts;
  }

  // Open: the leaf swings from the hinge into the room, starting at the wall face on that side.
  const face = swing > 0 ? Math.max(0, 2 * offset) : Math.min(0, 2 * offset);
  const leafU = hingeU + (toLatch * LEAF_THICKNESS_M) / 2;
  parts.push(
    coloredBox(
      LEAF_THICKNESS_M,
      leafHeight,
      leafWidth,
      [leafU, leafV, face + (swing * leafWidth) / 2],
      palette.leaf,
    ),
  );
  parts.push(
    handle(
      [LEAF_THICKNESS_M + 0.07, 0.025, 0.12],
      [leafU, handleV, face + swing * (leafWidth - 0.1)],
    ),
  );
  return parts;
}

/**
 * A window's frame, mullions and inside sill, in wall-local coordinates. The dark frame and the
 * panes it divides are what make a hole in a wall read as a window.
 */
function windowParts(
  cutout: ApertureCutout,
  wallWidth: number,
  wallHeight: number,
  offset: number,
): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const u0 = Math.max(-wallWidth / 2, cutout.u - cutout.width / 2);
  const u1 = Math.min(wallWidth / 2, cutout.u + cutout.width / 2);
  const v0 = Math.max(-wallHeight / 2, cutout.v - cutout.height / 2);
  const v1 = Math.min(wallHeight / 2, cutout.v + cutout.height / 2);
  const width = u1 - u0;
  const height = v1 - v0;
  if (width < 3 * WINDOW_FRAME_M || height < 3 * WINDOW_FRAME_M) return parts;
  const F = WINDOW_FRAME_M;
  const D = WINDOW_FRAME_DEPTH_M;
  const frame = (w: number, h: number, u: number, v: number) =>
    coloredBox(w, h, D, [u, v, offset], COLORS.windowFrame);
  const u = (u0 + u1) / 2;
  const v = (v0 + v1) / 2;

  parts.push(frame(F, height, u0 + F / 2, v), frame(F, height, u1 - F / 2, v));
  parts.push(frame(width, F, u, v0 + F / 2), frame(width, F, u, v1 - F / 2));
  const panes = Math.min(6, Math.max(1, Math.round(width / PANE_WIDTH_M)));
  for (let i = 1; i < panes; i++) parts.push(frame(MULLION_M, height, u0 + (width * i) / panes, v));

  // The sill sticks out into the room. A wall without a room has no inside.
  if (offset !== 0) {
    const inside = -Math.sign(offset) * SILL_DEPTH_M;
    parts.push(
      coloredBox(
        width + 0.1,
        SILL_THICKNESS_M,
        Math.abs(offset - inside),
        [u, v0 - SILL_THICKNESS_M / 2, (offset + inside) / 2],
        COLORS.windowSill,
      ),
    );
  }
  return parts;
}

/** Moves wall-local geometry into model coordinates. */
function toModel(geometry: BufferGeometry, wall: Wall): BufferGeometry {
  geometry.rotateY(wall.transform.yaw);
  geometry.translate(...wall.transform.position);
  return geometry;
}

/** The dark slab on top of a wall piece, in wall-local coordinates (`top`: the wall's top). */
function capSlab(width: number, u: number, top: number, offset: number): BufferGeometry {
  return coloredBox(width, CAP_M, WALL_THICKNESS_M, [u, top + CAP_M / 2, offset], COLORS.wallCap);
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
  const doorsById = new Map(model.doors.map((door) => [door.id, door]));
  const doorInward = (door: Aperture): Vec2 | null => {
    const room = door.roomId === null ? undefined : rooms.get(door.roomId);
    const [x, , z] = door.transform.position;
    return room ? inwardNormal([x, z], door.transform.yaw, room.floor.polygon) : null;
  };
  const foundEntrance = findEntrance(model);
  // A door scanned from both rooms gets one leaf, like its single swing on the floor plan. The
  // front door goes first, so a seller's pick of either side is the one drawn.
  const entranceId = foundEntrance?.door.id;
  const doorOrder = [...model.doors].sort(
    (a, b) => Number(b.id === entranceId) - Number(a.id === entranceId),
  );
  const leafDoors: Aperture[] = [];
  for (const door of doorOrder) {
    if (!doorInward(door) || leafDoors.some((other) => isSameDoor(other, door))) continue;
    leafDoors.push(door);
  }
  const leafDoorIds = new Set(leafDoors.map((door) => door.id));
  const entrancePieces: BufferGeometry[] = [];

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
    const segments = wallSegments(
      width,
      height,
      cutouts.map(({ cutout }) => cutout),
    );
    const pieces = segments.map((s) =>
      wallBox(
        s.u1 - s.u0,
        s.v1 - s.v0,
        T,
        [(s.u0 + s.u1) / 2, (s.v0 + s.v1) / 2, offset],
        s.v1 >= height / 2 - 0.001,
      ),
    );
    const caps: BufferGeometry[] = [];
    for (const s of segments) {
      if (s.v1 < height / 2 - 0.001) continue;
      caps.push(capSlab(s.u1 - s.u0, (s.u0 + s.u1) / 2, height / 2, offset));
    }

    const panes: WindowPane[] = [];
    for (const { aperture, cutout } of cutouts) {
      if (windowIds.has(aperture.id)) {
        panes.push({
          position: [cutout.u, cutout.v, offset],
          width: Math.min(cutout.width, width),
          height: Math.min(cutout.height, height),
        });
        pieces.push(...windowParts(cutout, width, height, offset));
        continue;
      }
      const door = doorsById.get(aperture.id);
      const isEntrance = door !== undefined && door.id === entranceId;
      if (door && (leafDoorIds.has(door.id) || isEntrance)) {
        // The front door always gets drawn; without a room it opens away from `outward`.
        const outward = foundEntrance?.outward ?? [0, 0];
        const inward = doorInward(door) ?? [-outward[0], -outward[1]];
        const hinge = doorHinge(door);
        const along = directionFromYaw(yaw);
        const hingeU = (hinge[0] - x) * along[0] + (hinge[1] - z) * along[1];
        const parts = doorParts(
          cutout,
          height,
          offset,
          hingeU < cutout.u,
          Math.sign(inward[0] * zAxis[0] + inward[1] * zAxis[1]) || 1,
          door.isOpen === true,
          isEntrance
            ? {
                leaf: COLORS.entranceLeaf,
                casing: COLORS.entranceCasing,
                handle: COLORS.entranceHandle,
              }
            : { leaf: COLORS.doorLeaf, casing: COLORS.doorCasing, handle: COLORS.doorHandle },
        );
        if (isEntrance) entrancePieces.push(...parts.map((part) => toModel(part, wall)));
        else pieces.push(...parts);
      }
      if (cutout.v - cutout.height / 2 <= -height / 2 + THRESHOLD_SNAP_M) {
        // Fill the floor under a door or opening, across the wall's thickness.
        const threshold = new BoxGeometry(cutout.width, FLOOR_SLAB_M, T);
        threshold.translate(cutout.u, -height / 2 - FLOOR_SLAB_M / 2, offset);
        threshold.rotateY(yaw);
        threshold.translate(x, y, z);
        thresholdPieces.push(threshold);
      }
    }

    return { wall, outward, pieces, caps, panes, center: [x, z] as Vec2 };
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
        const postZ = dx * zAxis[0] + dz * zAxis[1];
        a.pieces.push(wallBox(T, a.wall.dimensions.height, T, [u, 0, postZ], true));
        a.caps.push(capSlab(T, u, a.wall.dimensions.height / 2, postZ));
      }
    }
  }

  const walls: WallMesh[] = drafts.map((draft) => {
    const { position, yaw } = draft.wall.transform;
    const top = position[1] + draft.wall.dimensions.height / 2;
    const bottom = position[1] - draft.wall.dimensions.height / 2;
    // Keeps what lies below `constant` (model Y); starts with the whole wall.
    const clip = new Plane(new Vector3(0, -1, 0), top);
    return {
      id: draft.wall.id,
      geometry: merge(draft.pieces),
      cap: merge(draft.caps),
      material: new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0,
        clippingPlanes: [clip],
        // A cut wall shows its inside faces through the cut, in the wall color, so it looks
        // solid; the cap then covers the cut.
        side: DoubleSide,
      }),
      glassMaterial: new MeshStandardMaterial({
        color: COLORS.glass,
        emissive: COLORS.glassGlow,
        emissiveIntensity: 0.25,
        roughness: 0.1,
        metalness: 0,
        transparent: true,
        opacity: GLASS_OPACITY,
        depthWrite: false,
        side: DoubleSide,
        clippingPlanes: [clip],
      }),
      clip,
      top,
      bottom,
      panes: draft.panes,
      position,
      yaw,
      center: draft.center,
      outward: draft.outward,
    };
  });

  const floors: FloorMesh[] = model.rooms.map((room) => {
    // Shape space is (x, -z); rotating it onto the ground maps it back to (x, z).
    const shape = new Shape(room.floor.polygon.map(([x, z]) => new Vector2(x, -z)));
    const geometry = new ExtrudeGeometry(shape, { depth: FLOOR_SLAB_M, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, room.floor.y - FLOOR_SLAB_M, 0);
    return { room, geometry };
  });

  const thresholds = thresholdPieces.length > 0 ? merge(thresholdPieces) : null;

  let entrance: EntranceMesh | null = null;
  if (foundEntrance && entrancePieces.length > 0) {
    const { door, outward } = foundEntrance;
    const [x, y, z] = door.transform.position;
    entrance = {
      geometry: merge(entrancePieces),
      labelPosition: [
        x + outward[0] * ENTRANCE_LABEL_OUT_M,
        y - door.dimensions.height / 2,
        z + outward[1] * ENTRANCE_LABEL_OUT_M,
      ],
      outward,
    };
  }

  // Seller dividers: a dashed line lying on the floor of the rooms it separates.
  const dashes: BufferGeometry[] = [];
  for (const line of model.dividers ?? []) {
    const [dx, dz] = [line.b[0] - line.a[0], line.b[1] - line.a[1]];
    const length = Math.hypot(dx, dz);
    if (length === 0) continue;
    const middle: Vec2 = [(line.a[0] + line.b[0]) / 2, (line.a[1] + line.b[1]) / 2];
    const side: Vec2 = [middle[0] - (dz / length) * 0.05, middle[1] + (dx / length) * 0.05];
    const y =
      model.rooms.find((room) => pointInPolygon(side, room.floor.polygon))?.floor.y ??
      model.rooms.reduce((lowest, room) => Math.min(lowest, room.floor.y), 0);
    const yaw = Math.atan2(-dz, dx);
    for (let start = 0; start < length; start += DIVIDER_DASH_M + DIVIDER_GAP_M) {
      const dash = Math.min(DIVIDER_DASH_M, length - start);
      const t = (start + dash / 2) / length;
      const piece = new BoxGeometry(dash, 0.006, 0.035);
      piece.rotateY(yaw);
      piece.translate(line.a[0] + dx * t, y + 0.004, line.a[1] + dz * t);
      dashes.push(piece);
    }
  }
  const dividers = dashes.length > 0 ? merge(dashes) : null;

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
    dividers,
    entrance,
    bounds: { min: plan.min, max: plan.max, floorY, top },
    dispose() {
      for (const wall of walls) {
        wall.geometry.dispose();
        wall.material.dispose();
        wall.glassMaterial.dispose();
        wall.cap.dispose();
      }
      for (const floor of floors) floor.geometry.dispose();
      thresholds?.dispose();
      dividers?.dispose();
      entrance?.geometry.dispose();
    },
  };
}
