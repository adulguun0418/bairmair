import { describe, expect, it } from 'vitest';
import {
  applyAnnotations,
  distanceToPolygonEdge,
  inwardNormal,
  layoutHotspots,
  pointInPolygon,
  visualCenter,
  type Vec2,
} from '../src/index';
import { buildSample, SAMPLE_SPECS } from '../samples/definitions';
import { minimalModel } from './helpers';

const rectangle: Vec2[] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

// 6 x 5.5 with the lower-right 2.5 x 2.5 corner removed. Its centroid sits close to the notch.
const lShape: Vec2[] = [
  [0, 0],
  [6, 0],
  [6, 3],
  [3.5, 3],
  [3.5, 5.5],
  [0, 5.5],
];

describe('visualCenter', () => {
  it('is the middle of a rectangle', () => {
    const { point, clearance } = visualCenter(rectangle);
    expect(point[0]).toBeCloseTo(2, 6);
    expect(point[1]).toBeCloseTo(1.5, 6);
    expect(clearance).toBeCloseTo(1.5, 6);
  });

  it('stays well inside an L-shaped room', () => {
    const { point, clearance } = visualCenter(lShape);
    expect(pointInPolygon(point, lShape)).toBe(true);
    expect(clearance).toBeGreaterThan(1.2);
    expect(distanceToPolygonEdge(point, lShape)).toBeCloseTo(clearance, 9);
  });

  it('handles a U-shape, where the centroid is outside the polygon', () => {
    const uShape: Vec2[] = [
      [0, 0],
      [6, 0],
      [6, 4],
      [4.5, 4],
      [4.5, 1.5],
      [1.5, 1.5],
      [1.5, 4],
      [0, 4],
    ];
    const { point, clearance } = visualCenter(uShape);
    expect(pointInPolygon(point, uShape)).toBe(true);
    expect(clearance).toBeGreaterThan(0.6);
  });

  it('does not throw on degenerate input', () => {
    expect(visualCenter([]).clearance).toBe(0);
    expect(
      visualCenter([
        [0, 0],
        [1, 0],
      ]).clearance,
    ).toBe(0);
  });
});

describe('inwardNormal', () => {
  it('points from a wall into its room', () => {
    // Top wall of the rectangle (z = 0): the room is towards +Z.
    expect(inwardNormal([2, 0], 0, rectangle)).toEqual([expect.closeTo(0, 9), 1]);
    // Same wall described with the opposite heading.
    const flipped = inwardNormal([2, 0], Math.PI, rectangle)!;
    expect(flipped[0]).toBeCloseTo(0, 9);
    expect(flipped[1]).toBeCloseTo(1, 9);
    // Right wall (x = 4): the room is towards -X.
    const right = inwardNormal([4, 1.5], Math.PI / 2, rectangle)!;
    expect(right[0]).toBeCloseTo(-1, 9);
    expect(right[1]).toBeCloseTo(0, 9);
  });

  it('returns null for a wall that is not on the room', () => {
    expect(inwardNormal([20, 20], 0, rectangle)).toBeNull();
  });
});

describe('layoutHotspots', () => {
  const twoRoom = buildSample(SAMPLE_SPECS['two-room']);
  const withPhotos = (photos: { id: string; roomId: string }[]) =>
    applyAnnotations(twoRoom, { photos });

  it('returns nothing for a model without hotspots', () => {
    expect(layoutHotspots(twoRoom)).toEqual([]);
  });

  it('places every photo inside its room, away from the walls', () => {
    const model = withPhotos([
      { id: 'p1', roomId: 'living' },
      { id: 'p2', roomId: 'living' },
      { id: 'p3', roomId: 'living' },
      { id: 'p4', roomId: 'bedroom' },
      { id: 'p5', roomId: 'bathroom' },
      { id: 'p6', roomId: 'kitchen' },
    ]);
    const placements = layoutHotspots(model);
    expect(placements.map((placement) => placement.photoId).sort()).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
      'p5',
      'p6',
    ]);
    for (const placement of placements) {
      const room = model.rooms.find((candidate) => candidate.id === placement.roomId)!;
      expect(pointInPolygon(placement.position, room.floor.polygon)).toBe(true);
      expect(distanceToPolygonEdge(placement.position, room.floor.polygon)).toBeGreaterThan(0.1);
    }
  });

  it('does not stack photos of one room on top of each other', () => {
    const photos = Array.from({ length: 5 }, (_, index) => ({ id: `p${index}`, roomId: 'living' }));
    const placements = layoutHotspots(withPhotos(photos));
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const [a, b] = [placements[i]!.position, placements[j]!.position];
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.3);
      }
    }
  });

  it('is deterministic', () => {
    const model = withPhotos([
      { id: 'p1', roomId: 'living' },
      { id: 'p2', roomId: 'bedroom' },
    ]);
    expect(layoutHotspots(model)).toEqual(layoutHotspots(model));
  });

  it('uses the camera position when a hotspot has a pose', () => {
    const model = minimalModel();
    model.hotspots = [
      {
        photoId: 'posed',
        roomId: 'room-1',
        cameraPose: { position: [1.2, 1.5, -0.7], rotation: [0, 0, 0, 1] },
      },
    ];
    expect(layoutHotspots(model)).toEqual([
      { photoId: 'posed', roomId: 'room-1', position: [1.2, -0.7] },
    ]);
  });
});
