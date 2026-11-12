import type { RoomModelV1 } from '../schema/model';
import type { Vec2 } from '../schema/primitives';
import { boundsOf, distanceToPolygonEdge, pointInPolygon, polygonCentroid } from './polygon';
import { directionFromYaw } from './wall';

export interface VisualCenter {
  point: Vec2;
  /** Distance from the point to the nearest edge of the polygon. */
  clearance: number;
}

/**
 * A point comfortably inside a polygon, for placing a label. For a rectangle this is the
 * middle; for an L-shaped room it is the middle of the larger arm, where the plain centroid
 * could sit in a corner or even outside the room.
 */
export function visualCenter(polygon: readonly Vec2[], resolution = 32): VisualCenter {
  const centroid = polygonCentroid(polygon);
  const bounds = boundsOf(polygon);
  if (!bounds) return { point: centroid, clearance: 0 };

  const candidates: VisualCenter[] = [];
  const consider = (point: Vec2) => {
    if (pointInPolygon(point, polygon)) {
      candidates.push({ point, clearance: distanceToPolygonEdge(point, polygon) });
    }
  };
  consider(centroid);
  const stepX = (bounds.max[0] - bounds.min[0]) / resolution;
  const stepZ = (bounds.max[1] - bounds.min[1]) / resolution;
  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      consider([bounds.min[0] + (i + 0.5) * stepX, bounds.min[1] + (j + 0.5) * stepZ]);
    }
  }
  if (candidates.length === 0) return { point: centroid, clearance: 0 };

  // Many points can be almost equally far from the walls (the whole middle line of a
  // rectangle). Among those, take the one closest to the centroid.
  const best = Math.max(...candidates.map((candidate) => candidate.clearance));
  const roomy = candidates.filter((candidate) => candidate.clearance >= best * 0.9);
  const distanceToCentroid = ({ point }: VisualCenter) =>
    Math.hypot(point[0] - centroid[0], point[1] - centroid[1]);
  return roomy.reduce((a, b) => (distanceToCentroid(b) < distanceToCentroid(a) ? b : a));
}

/**
 * Unit normal of a wall or aperture that points into the given room, or `null` when neither
 * side of it is inside the room.
 */
export function inwardNormal(
  position: Vec2,
  yaw: number,
  roomPolygon: readonly Vec2[],
): Vec2 | null {
  const [dx, dz] = directionFromYaw(yaw);
  const probe = 0.05;
  for (const normal of [
    [-dz, dx],
    [dz, -dx],
  ] satisfies Vec2[]) {
    const point: Vec2 = [position[0] + normal[0] * probe, position[1] + normal[1] * probe];
    if (pointInPolygon(point, roomPolygon)) return normal;
  }
  return null;
}

export interface HotspotPlacement {
  photoId: string;
  roomId: string;
  /** Plan-view position of the marker. */
  position: Vec2;
}

/** Distance between neighbouring photo markers. */
const HOTSPOT_SPACING_M = 0.6;
/** Markers sit this far below (towards +Z) the room label, so they never cover it. */
const HOTSPOT_ROW_OFFSET_M = 0.65;
/** Markers keep at least this distance from the walls. */
const HOTSPOT_WALL_MARGIN_M = 0.15;

/**
 * Where to draw each photo hotspot. Used by both the 3D viewer and the floor plan so a photo
 * appears in the same spot in each.
 *
 * In v1 a photo only knows its room, so markers are laid out in rows below the room label.
 * A hotspot that carries a camera pose is placed where the photo was taken.
 */
export function layoutHotspots(model: RoomModelV1): HotspotPlacement[] {
  const placements: HotspotPlacement[] = [];

  for (const room of model.rooms) {
    const hotspots = model.hotspots.filter((hotspot) => hotspot.roomId === room.id);
    if (hotspots.length === 0) continue;

    const polygon = room.floor.polygon;
    const center = visualCenter(polygon);
    const unposed = hotspots.filter((hotspot) => !hotspot.cameraPose);
    const usableWidth = Math.max(HOTSPOT_SPACING_M, 2 * center.clearance - 0.4);
    const perRow = Math.max(1, Math.floor(usableWidth / HOTSPOT_SPACING_M));

    for (const hotspot of hotspots) {
      let position: Vec2;
      if (hotspot.cameraPose) {
        position = [hotspot.cameraPose.position[0], hotspot.cameraPose.position[2]];
      } else {
        const index = unposed.indexOf(hotspot);
        const row = Math.floor(index / perRow);
        const column = index % perRow;
        const inThisRow = Math.min(perRow, unposed.length - row * perRow);
        position = [
          center.point[0] + (column - (inThisRow - 1) / 2) * HOTSPOT_SPACING_M,
          center.point[1] + HOTSPOT_ROW_OFFSET_M + row * HOTSPOT_SPACING_M,
        ];
        const fits =
          pointInPolygon(position, polygon) &&
          distanceToPolygonEdge(position, polygon) >= HOTSPOT_WALL_MARGIN_M;
        if (!fits) position = center.point;
      }
      placements.push({ photoId: hotspot.photoId, roomId: room.id, position });
    }
  }
  return placements;
}
