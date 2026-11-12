import { describe, expect, it } from 'vitest';
import { parseRoomModel, safeParseRoomModel } from '../src/index';
import { minimalModel } from './helpers';

const isValid = (input: unknown) => safeParseRoomModel(input).success;

describe('RoomModel v1 schema', () => {
  it('accepts a valid model and returns it unchanged', () => {
    expect(parseRoomModel(minimalModel())).toEqual(minimalModel());
  });

  it('survives a JSON round trip', () => {
    const json = JSON.stringify(minimalModel());
    expect(parseRoomModel(JSON.parse(json))).toEqual(minimalModel());
  });

  it('rejects other schema versions', () => {
    expect(isValid({ ...minimalModel(), schemaVersion: 2 })).toBe(false);
    expect(isValid({ ...minimalModel(), schemaVersion: undefined })).toBe(false);
  });

  it('rejects input that is not a model at all', () => {
    expect(isValid(null)).toBe(false);
    expect(isValid('model')).toBe(false);
    expect(isValid({})).toBe(false);
  });

  describe('forward compatibility', () => {
    it('ignores unknown fields', () => {
      const model = minimalModel();
      const parsed = parseRoomModel({
        ...model,
        addedInV1_1: true,
        rooms: [{ ...model.rooms[0]!, ceilingHeight: 2.6 }],
      });
      expect(parsed).toEqual(model);
    });

    it("reads a room label it does not know as 'other'", () => {
      const model = minimalModel();
      const parsed = parseRoomModel({
        ...model,
        rooms: [{ ...model.rooms[0]!, label: 'sauna' }],
      });
      expect(parsed.rooms[0]!.label).toBe('other');
    });

    it("reads an object category it does not know as 'other'", () => {
      const model = minimalModel();
      const parsed = parseRoomModel({
        ...model,
        objects: [{ ...model.objects[0]!, category: 'piano' }],
      });
      expect(parsed.objects[0]!.category).toBe('other');
    });

    it('accepts a hotspot that carries a camera pose', () => {
      const model = minimalModel();
      const parsed = parseRoomModel({
        ...model,
        hotspots: [
          {
            photoId: 'photo-1',
            roomId: 'room-1',
            cameraPose: { position: [0, 1.5, 0], rotation: [0, 0, 0, 1] },
          },
        ],
      });
      expect(parsed.hotspots[0]!.cameraPose?.position).toEqual([0, 1.5, 0]);
    });
  });

  describe('references', () => {
    it('rejects duplicate ids, even across element types', () => {
      const model = minimalModel();
      expect(isValid({ ...model, walls: [model.walls[0]!, model.walls[0]!] })).toBe(false);
      expect(isValid({ ...model, objects: [{ ...model.objects[0]!, id: 'wall-n' }] })).toBe(false);
    });

    it('rejects an element in a room that does not exist', () => {
      const model = minimalModel();
      expect(isValid({ ...model, walls: [{ ...model.walls[0]!, roomId: 'nowhere' }] })).toBe(false);
      expect(isValid({ ...model, objects: [{ ...model.objects[0]!, roomId: 'nowhere' }] })).toBe(
        false,
      );
    });

    it('accepts elements that belong to no room', () => {
      const model = minimalModel();
      expect(isValid({ ...model, objects: [{ ...model.objects[0]!, roomId: null }] })).toBe(true);
    });

    it('rejects an aperture on a wall that does not exist', () => {
      const model = minimalModel();
      expect(isValid({ ...model, windows: [{ ...model.windows[0]!, wallId: 'nowhere' }] })).toBe(
        false,
      );
      expect(isValid({ ...model, windows: [{ ...model.windows[0]!, wallId: null }] })).toBe(true);
    });

    it('rejects a hotspot in a room that does not exist', () => {
      const hotspots = [{ photoId: 'photo-1', roomId: 'nowhere' }];
      expect(isValid({ ...minimalModel(), hotspots })).toBe(false);
    });

    it('rejects two hotspots for the same photo', () => {
      const hotspots = [
        { photoId: 'photo-1', roomId: 'room-1' },
        { photoId: 'photo-1', roomId: 'room-1' },
      ];
      expect(isValid({ ...minimalModel(), hotspots })).toBe(false);
    });
  });

  describe('geometry values', () => {
    it('rejects non-finite numbers', () => {
      const model = minimalModel();
      const wall = model.walls[0]!;
      for (const bad of [Infinity, -Infinity, NaN]) {
        expect(
          isValid({ ...model, walls: [{ ...wall, transform: { position: [0, bad, 0], yaw: 0 } }] }),
        ).toBe(false);
        expect(
          isValid({ ...model, walls: [{ ...wall, transform: { ...wall.transform, yaw: bad } }] }),
        ).toBe(false);
      }
    });

    it('rejects a wall without width or height', () => {
      const model = minimalModel();
      const wall = model.walls[0]!;
      expect(
        isValid({
          ...model,
          walls: [{ ...wall, dimensions: { width: 0, height: 2.6, depth: 0 } }],
        }),
      ).toBe(false);
      expect(
        isValid({ ...model, walls: [{ ...wall, dimensions: { width: 4, height: -1, depth: 0 } }] }),
      ).toBe(false);
    });

    it('rejects a floor that is not a polygon with area', () => {
      const model = minimalModel();
      const room = model.rooms[0]!;
      const withPolygon = (polygon: [number, number][]) => ({
        ...model,
        rooms: [{ ...room, floor: { y: 0, polygon } }],
      });
      expect(
        isValid(
          withPolygon([
            [0, 0],
            [1, 0],
          ]),
        ),
      ).toBe(false);
      expect(
        isValid(
          withPolygon([
            [0, 0],
            [1, 0],
            [2, 0],
          ]),
        ),
      ).toBe(false);
    });

    it('rejects a transform matrix that is not 16 numbers', () => {
      expect(isValid({ ...minimalModel(), frame: { fromSource: [1, 0, 0, 0] } })).toBe(false);
    });
  });
});
