import { describe, expect, it } from 'vitest';
import { computeMetrics, type RoomModelV1 } from '../src/index';
import { minimalModel } from './helpers';

function withRooms(polygons: Record<string, [number, number][]>): RoomModelV1 {
  return {
    ...minimalModel(),
    rooms: Object.entries(polygons).map(([id, polygon]) => ({
      id,
      label: 'other' as const,
      story: 0,
      floor: { y: 0, polygon },
    })),
    walls: [],
    windows: [],
    objects: [],
  };
}

describe('computeMetrics', () => {
  it('computes the area of a single room', () => {
    const metrics = computeMetrics(minimalModel());
    expect(metrics.rooms).toEqual([{ id: 'room-1', areaM2: 12 }]);
    expect(metrics.totalAreaM2).toBe(12);
  });

  it('counts elements', () => {
    expect(computeMetrics(minimalModel()).counts).toEqual({
      rooms: 1,
      walls: 1,
      doors: 0,
      windows: 1,
      openings: 0,
      objects: 1,
    });
  });

  it('rounds each room to 2 decimals', () => {
    const metrics = computeMetrics(
      withRooms({
        // 3.333 x 3.333 = 11.108889
        a: [
          [0, 0],
          [3.333, 0],
          [3.333, 3.333],
          [0, 3.333],
        ],
      }),
    );
    expect(metrics.rooms[0]!.areaM2).toBe(11.11);
  });

  it('reports a total that equals the sum of the rounded room areas', () => {
    const square = (side: number, offset: number): [number, number][] => [
      [offset, 0],
      [offset + side, 0],
      [offset + side, side],
      [offset, side],
    ];
    // Each room is 1.234 m² (shown as 1.23). Unrounded they sum to 3.702, which would show as
    // 3.70 while the three displayed values add up to 3.69.
    const side = Math.sqrt(1.234);
    const metrics = computeMetrics(
      withRooms({ a: square(side, 0), b: square(side, 5), c: square(side, 10) }),
    );
    expect(metrics.rooms.map((room) => room.areaM2)).toEqual([1.23, 1.23, 1.23]);
    expect(metrics.totalAreaM2).toBe(3.69);
  });

  it('handles a model without rooms', () => {
    const metrics = computeMetrics(withRooms({}));
    expect(metrics.rooms).toEqual([]);
    expect(metrics.totalAreaM2).toBe(0);
  });

  it('measures non-rectangular rooms', () => {
    const metrics = computeMetrics(
      withRooms({
        l: [
          [0, 0],
          [6, 0],
          [6, 3],
          [3.5, 3],
          [3.5, 5.5],
          [0, 5.5],
        ],
      }),
    );
    expect(metrics.totalAreaM2).toBe(26.75);
  });
});
