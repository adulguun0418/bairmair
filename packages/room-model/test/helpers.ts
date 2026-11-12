import type { RoomModelV1 } from '../src/index';

/** A valid model of one 4 x 3 m bedroom: a wall with a window, and a bed. */
export function minimalModel(): RoomModelV1 {
  return {
    schemaVersion: 1,
    source: { kind: 'manual', converterVersion: 'test' },
    frame: { fromSource: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] },
    rooms: [
      {
        id: 'room-1',
        label: 'bedroom',
        story: 0,
        floor: {
          y: 0,
          polygon: [
            [-2, -1.5],
            [2, -1.5],
            [2, 1.5],
            [-2, 1.5],
          ],
        },
      },
    ],
    walls: [
      {
        id: 'wall-n',
        roomId: 'room-1',
        transform: { position: [0, 1.3, -1.5], yaw: 0 },
        dimensions: { width: 4, height: 2.6, depth: 0 },
      },
    ],
    doors: [],
    windows: [
      {
        id: 'win-1',
        roomId: 'room-1',
        wallId: 'wall-n',
        transform: { position: [0, 1.5, -1.5], yaw: 0 },
        dimensions: { width: 1.5, height: 1.4, depth: 0 },
      },
    ],
    openings: [],
    objects: [
      {
        id: 'bed-1',
        roomId: 'room-1',
        category: 'bed',
        transform: { position: [-1, 0.25, -0.5], yaw: 0 },
        dimensions: { width: 1.6, height: 0.5, depth: 2 },
      },
    ],
    hotspots: [],
  };
}
