import { describe, expect, it } from 'vitest';
import {
  apertureCutout,
  boundsOf,
  directionFromYaw,
  distanceToPolygonEdge,
  distanceToSegment,
  normalizeAngle,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  signedArea,
  wallEndpoints,
  yawFromDirection,
  type Vec2,
} from '../src/index';

const rectangle: Vec2[] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

// 6 x 5.5 with a 2.5 x 2.5 corner removed.
const lShape: Vec2[] = [
  [0, 0],
  [6, 0],
  [6, 3],
  [3.5, 3],
  [3.5, 5.5],
  [0, 5.5],
];

describe('polygon area', () => {
  it('measures a rectangle', () => {
    expect(polygonArea(rectangle)).toBeCloseTo(12, 10);
  });

  it('measures an L-shaped room', () => {
    expect(polygonArea(lShape)).toBeCloseTo(6 * 5.5 - 2.5 * 2.5, 10);
  });

  it('measures a triangle', () => {
    expect(
      polygonArea([
        [0, 0],
        [4, 0],
        [0, 3],
      ]),
    ).toBeCloseTo(6, 10);
  });

  it('does not depend on winding direction, start point, or position', () => {
    const reversed = [...lShape].reverse();
    const rotatedStart = [...lShape.slice(2), ...lShape.slice(0, 2)];
    const moved = lShape.map(([x, z]): Vec2 => [x - 100, z + 250]);
    for (const variant of [reversed, rotatedStart, moved]) {
      expect(polygonArea(variant)).toBeCloseTo(26.75, 9);
    }
    expect(signedArea(reversed)).toBeCloseTo(-signedArea(lShape), 10);
  });

  it('is zero for degenerate polygons', () => {
    expect(polygonArea([])).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [1, 0],
        [2, 0],
      ]),
    ).toBe(0);
  });
});

describe('polygon helpers', () => {
  it('finds the centroid', () => {
    const [x, z] = polygonCentroid(rectangle);
    expect(x).toBeCloseTo(2, 10);
    expect(z).toBeCloseTo(1.5, 10);
  });

  it('finds the bounding box', () => {
    expect(boundsOf(lShape)).toEqual({ min: [0, 0], max: [6, 5.5] });
    expect(boundsOf([])).toBeNull();
  });

  it('tests whether a point is inside, including concave shapes', () => {
    expect(pointInPolygon([1, 1], lShape)).toBe(true);
    expect(pointInPolygon([1, 5], lShape)).toBe(true);
    expect(pointInPolygon([5, 1], lShape)).toBe(true);
    // Inside the bounding box but in the removed corner.
    expect(pointInPolygon([5, 4.5], lShape)).toBe(false);
    expect(pointInPolygon([-1, 1], lShape)).toBe(false);
    expect(pointInPolygon([7, 7], lShape)).toBe(false);
  });

  it('measures distance to a segment and to an outline', () => {
    expect(distanceToSegment([2, 1], [0, 0], [4, 0])).toBeCloseTo(1, 10);
    // Beyond the end of the segment: distance to the endpoint.
    expect(distanceToSegment([7, 4], [0, 0], [4, 0])).toBeCloseTo(5, 10);
    expect(distanceToSegment([3, 4], [0, 0], [0, 0])).toBeCloseTo(5, 10);
    expect(distanceToPolygonEdge([2, 1], rectangle)).toBeCloseTo(1, 10);
    expect(distanceToPolygonEdge([4.5, 1.5], rectangle)).toBeCloseTo(0.5, 10);
  });
});

describe('yaw convention', () => {
  it('matches three.js rotation.y: local +X points along [cos, -sin] in plan view', () => {
    const expectDirection = (yaw: number, x: number, z: number) => {
      const [dx, dz] = directionFromYaw(yaw);
      expect(dx).toBeCloseTo(x, 10);
      expect(dz).toBeCloseTo(z, 10);
    };
    expectDirection(0, 1, 0);
    expectDirection(Math.PI / 2, 0, -1);
    expectDirection(Math.PI, -1, 0);
    expectDirection(-Math.PI / 2, 0, 1);
  });

  it('round-trips between yaw and direction', () => {
    for (const yaw of [0, 0.3, 1.2, Math.PI / 2, 2.5, -0.7, -2.9]) {
      const [dx, dz] = directionFromYaw(yaw);
      expect(yawFromDirection(dx, dz)).toBeCloseTo(yaw, 10);
    }
  });

  it('normalizes angles into (-PI, PI]', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(normalizeAngle(2 * Math.PI + 0.25)).toBeCloseTo(0.25, 10);
    expect(normalizeAngle(-2 * Math.PI - 0.25)).toBeCloseTo(-0.25, 10);
  });
});

describe('walls and apertures', () => {
  const wall = (position: [number, number, number], yaw: number, width: number) => ({
    transform: { position, yaw },
    dimensions: { width, height: 2.6, depth: 0 },
  });

  it('computes wall endpoints in plan view', () => {
    const [a, b] = wallEndpoints(wall([0, 1.3, -1.5], 0, 4));
    expect(a[0]).toBeCloseTo(-2, 10);
    expect(a[1]).toBeCloseTo(-1.5, 10);
    expect(b[0]).toBeCloseTo(2, 10);
    expect(b[1]).toBeCloseTo(-1.5, 10);

    // Yaw of 90 degrees: the wall runs along -Z.
    const [c, d] = wallEndpoints(wall([2, 1.3, 0], Math.PI / 2, 3));
    expect(c[0]).toBeCloseTo(2, 10);
    expect(c[1]).toBeCloseTo(1.5, 10);
    expect(d[0]).toBeCloseTo(2, 10);
    expect(d[1]).toBeCloseTo(-1.5, 10);
  });

  it('projects an aperture onto its wall', () => {
    const host = wall([0, 1.3, -1.5], 0, 4);
    const window = {
      transform: { position: [0.5, 1.5, -1.5] as [number, number, number], yaw: 0 },
      dimensions: { width: 1.5, height: 1.4, depth: 0 },
    };
    const cutout = apertureCutout(window, host);
    expect(cutout.u).toBeCloseTo(0.5, 10);
    expect(cutout.v).toBeCloseTo(0.2, 10);
    expect(cutout.width).toBe(1.5);
    expect(cutout.height).toBe(1.4);
    expect(cutout.distance).toBeCloseTo(0, 10);
  });

  it('projects correctly on a rotated wall and reports the distance from the wall plane', () => {
    // Wall on the line x = 2, running along -Z.
    const host = wall([2, 1.3, 0], Math.PI / 2, 3);
    const door = {
      transform: { position: [2.1, 1, 0.5] as [number, number, number], yaw: Math.PI / 2 },
      dimensions: { width: 0.8, height: 2, depth: 0 },
    };
    const cutout = apertureCutout(door, host);
    // 0.5 m towards +Z is 0.5 m against the wall's local +X.
    expect(cutout.u).toBeCloseTo(-0.5, 10);
    expect(cutout.v).toBeCloseTo(-0.3, 10);
    expect(cutout.distance).toBeCloseTo(0.1, 10);
  });
});
