import type { Vec2 } from '../schema/primitives';
import { polygonEdges, signedArea } from './polygon';

export interface EnclosedFacesOptions {
  /** Points closer than this are one corner, in meters. */
  snap?: number;
  /**
   * Each wall is lengthened by this much at both ends before intersecting, so a wall that stops
   * just short of another one still meets it. The leftover stubs are pruned.
   */
  extend?: number;
}

const DEFAULT_SNAP_M = 0.05;
const DEFAULT_EXTEND_M = 0.15;
/** Below this, two directions count as parallel (sine of the angle between them). */
const PARALLEL_SIN = 1e-3;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

/** Drops corners that lie on a straight line between their neighbours. */
function withoutStraightCorners(polygon: readonly Vec2[]): Vec2[] {
  const kept = polygon.filter((point, i) => {
    const previous = polygon[(i - 1 + polygon.length) % polygon.length]!;
    const next = polygon[(i + 1) % polygon.length]!;
    const a = sub(point, previous);
    const b = sub(next, point);
    const lengths = Math.hypot(...a) * Math.hypot(...b);
    return lengths === 0 || Math.abs(cross(a, b)) / lengths > PARALLEL_SIN || dot(a, b) < 0;
  });
  return kept.length >= 3 ? kept : [...polygon];
}

/**
 * The areas that walls close off completely, as counter-clockwise polygons.
 *
 * Walls are plan-view segments. Walls that cross, touch, or end on another wall (a T-junction)
 * are joined there; walls that lead nowhere are ignored. Each bounded face of the resulting
 * plan is returned once, without corners that lie on a straight line. Pure and deterministic.
 */
export function enclosedFaces(
  walls: readonly (readonly [Vec2, Vec2])[],
  options: EnclosedFacesOptions = {},
): Vec2[][] {
  const snap = options.snap ?? DEFAULT_SNAP_M;
  const extend = options.extend ?? DEFAULT_EXTEND_M;

  // 1. Lengthen every wall a little at both ends.
  const segments: [Vec2, Vec2][] = [];
  for (const [a, b] of walls) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < snap) continue;
    const dx = (b[0] - a[0]) / length;
    const dz = (b[1] - a[1]) / length;
    segments.push([
      [a[0] - dx * extend, a[1] - dz * extend],
      [b[0] + dx * extend, b[1] + dz * extend],
    ]);
  }

  // 2. Where each segment meets another one, as fractions along it.
  const cuts = segments.map(() => new Set<number>([0, 1]));
  for (let i = 0; i < segments.length; i++) {
    const [a, b] = segments[i]!;
    const d = sub(b, a);
    const length = Math.hypot(...d);
    for (let j = i + 1; j < segments.length; j++) {
      const [c, e] = segments[j]!;
      const f = sub(e, c);
      const otherLength = Math.hypot(...f);
      const denominator = cross(d, f);
      if (Math.abs(denominator) / (length * otherLength) < PARALLEL_SIN) {
        // Parallel: joined only where one runs along the other.
        for (const [point, onto, from, along, alongLength] of [
          [c, i, a, d, length],
          [e, i, a, d, length],
          [a, j, c, f, otherLength],
          [b, j, c, f, otherLength],
        ] as const) {
          const t = dot(sub(point, from), along) / (alongLength * alongLength);
          if (t > 0 && t < 1 && Math.abs(cross(sub(point, from), along)) / alongLength <= snap) {
            cuts[onto]!.add(t);
          }
        }
        continue;
      }
      const ac = sub(c, a);
      const t = cross(ac, f) / denominator;
      const u = cross(ac, d) / denominator;
      const toleranceT = snap / length;
      const toleranceU = snap / otherLength;
      if (t >= -toleranceT && t <= 1 + toleranceT && u >= -toleranceU && u <= 1 + toleranceU) {
        cuts[i]!.add(Math.min(1, Math.max(0, t)));
        cuts[j]!.add(Math.min(1, Math.max(0, u)));
      }
    }
  }

  // 3. Corners: cut points closer than `snap` merge into one.
  const corners: Vec2[] = [];
  const cornerOf = (point: Vec2): number => {
    const found = corners.findIndex((corner) => Math.hypot(...sub(corner, point)) <= snap);
    if (found >= 0) return found;
    corners.push(point);
    return corners.length - 1;
  };

  // 4. Edges between consecutive cuts, without duplicates.
  const neighbours = new Map<number, Set<number>>();
  const link = (u: number, v: number) => {
    if (u === v) return;
    if (!neighbours.has(u)) neighbours.set(u, new Set());
    if (!neighbours.has(v)) neighbours.set(v, new Set());
    neighbours.get(u)!.add(v);
    neighbours.get(v)!.add(u);
  };
  segments.forEach(([a, b], i) => {
    const ts = [...cuts[i]!].sort((x, y) => x - y);
    for (let k = 1; k < ts.length; k++) {
      link(cornerOf(lerp(a, b, ts[k - 1]!)), cornerOf(lerp(a, b, ts[k]!)));
    }
  });

  // 5. Walls that lead nowhere (and the stubs from step 1) enclose nothing.
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const [corner, around] of neighbours) {
      if (around.size > 1) continue;
      for (const other of around) neighbours.get(other)!.delete(corner);
      neighbours.delete(corner);
      pruned = true;
    }
  }

  // 6. Walk every face, keeping the interior on the left: at each corner, leave along the edge
  //    that comes next clockwise after the edge we arrived on. Bounded faces come out
  //    counter-clockwise (positive area); the outside of each connected group comes out
  //    clockwise and is skipped.
  const sorted = new Map<number, number[]>();
  for (const [corner, around] of neighbours) {
    const origin = corners[corner]!;
    const angle = (other: number) => {
      const [dx, dz] = sub(corners[other]!, origin);
      return Math.atan2(dz, dx);
    };
    sorted.set(
      corner,
      [...around].sort((x, y) => angle(x) - angle(y)),
    );
  }

  const visited = new Set<string>();
  const faces: Vec2[][] = [];
  const starts = [...sorted.keys()].sort((x, y) => x - y);
  for (const start of starts) {
    for (const first of sorted.get(start)!) {
      if (visited.has(`${start}>${first}`)) continue;
      const cycle: number[] = [];
      let from = start;
      let to = first;
      while (!visited.has(`${from}>${to}`)) {
        visited.add(`${from}>${to}`);
        cycle.push(from);
        const around = sorted.get(to)!;
        const back = around.indexOf(from);
        const next = around[(back - 1 + around.length) % around.length]!;
        from = to;
        to = next;
      }
      const polygon = cycle.map((corner) => corners[corner]!);
      if (polygon.length >= 3 && signedArea(polygon) > 0) {
        faces.push(withoutStraightCorners(polygon));
      }
    }
  }
  return faces;
}

/**
 * How many meters of the wall `a`-`b` run along the outline of `polygon`, counting only the
 * edges the wall is parallel to and within `tolerance` of.
 */
export function lengthAlongOutline(
  a: Vec2,
  b: Vec2,
  polygon: readonly Vec2[],
  tolerance: number,
): number {
  const d = sub(b, a);
  const length = Math.hypot(...d);
  if (length === 0) return 0;
  let total = 0;
  for (const [p, q] of polygonEdges(polygon)) {
    const e = sub(q, p);
    const edgeLength = Math.hypot(...e);
    if (edgeLength === 0) continue;
    // Roughly parallel (within about 10 degrees) and on the edge's line.
    if (Math.abs(cross(d, e)) / (length * edgeLength) > 0.17) continue;
    const lineDistance = (point: Vec2) => Math.abs(cross(sub(point, p), e)) / edgeLength;
    if (lineDistance(a) > tolerance || lineDistance(b) > tolerance) continue;
    // Overlap of the two segments measured along the edge.
    const along = (point: Vec2) => dot(sub(point, p), e) / edgeLength;
    const lo = Math.max(0, Math.min(along(a), along(b)));
    const hi = Math.min(edgeLength, Math.max(along(a), along(b)));
    if (hi > lo) total += hi - lo;
  }
  return total;
}
