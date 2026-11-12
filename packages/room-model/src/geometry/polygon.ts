import type { Vec2 } from '../schema/primitives';

/** Yields each edge of a polygon as `[start, end]`, including the closing edge. */
export function* polygonEdges(polygon: readonly Vec2[]): Generator<[Vec2, Vec2]> {
  for (let i = 0; i < polygon.length; i++) {
    yield [polygon[i]!, polygon[(i + 1) % polygon.length]!];
  }
}

/** Shoelace formula. The sign depends on the winding direction. */
export function signedArea(polygon: readonly Vec2[]): number {
  let twiceArea = 0;
  for (const [a, b] of polygonEdges(polygon)) {
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return twiceArea / 2;
}

/** Area of a simple polygon in square meters, regardless of winding. */
export function polygonArea(polygon: readonly Vec2[]): number {
  return Math.abs(signedArea(polygon));
}

/** Area-weighted centroid. Falls back to the vertex average for degenerate polygons. */
export function polygonCentroid(polygon: readonly Vec2[]): Vec2 {
  const area = signedArea(polygon);
  if (Math.abs(area) < 1e-9) {
    const sum = polygon.reduce<Vec2>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    const n = Math.max(polygon.length, 1);
    return [sum[0] / n, sum[1] / n];
  }
  let cx = 0;
  let cz = 0;
  for (const [a, b] of polygonEdges(polygon)) {
    const cross = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * cross;
    cz += (a[1] + b[1]) * cross;
  }
  return [cx / (6 * area), cz / (6 * area)];
}

export interface Bounds2 {
  min: Vec2;
  max: Vec2;
}

/** Axis-aligned bounding box of a set of points. Returns `null` for an empty set. */
export function boundsOf(points: Iterable<Vec2>): Bounds2 | null {
  let bounds: Bounds2 | null = null;
  for (const [x, z] of points) {
    if (bounds === null) {
      bounds = { min: [x, z], max: [x, z] };
    } else {
      bounds.min = [Math.min(bounds.min[0], x), Math.min(bounds.min[1], z)];
      bounds.max = [Math.max(bounds.max[0], x), Math.max(bounds.max[1], z)];
    }
  }
  return bounds;
}

/** Ray-casting test. Points exactly on an edge may land on either side. */
export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  const [px, pz] = point;
  let inside = false;
  for (const [a, b] of polygonEdges(polygon)) {
    const crosses = a[1] > pz !== b[1] > pz;
    if (crosses && px < ((b[0] - a[0]) * (pz - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to the segment `a`-`b`. */
export function distanceToSegment(point: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const abz = b[1] - a[1];
  const lengthSq = abx * abx + abz * abz;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((point[0] - a[0]) * abx + (point[1] - a[1]) * abz) / lengthSq));
  return Math.hypot(point[0] - (a[0] + t * abx), point[1] - (a[1] + t * abz));
}

/** Shortest distance from a point to the outline of a polygon. */
export function distanceToPolygonEdge(point: Vec2, polygon: readonly Vec2[]): number {
  let best = Infinity;
  for (const [a, b] of polygonEdges(polygon)) {
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}
