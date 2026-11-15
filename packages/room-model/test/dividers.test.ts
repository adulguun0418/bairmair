import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyAnnotations,
  applyRoomDividers,
  computeMetrics,
  convertRoomPlan,
  dividerFromPlan,
  incompleteRoomIds,
  parseRoomDividers,
  parseRoomModel,
  planToSource,
  pointInPolygon,
  renderFloorPlanSvg,
  ROOM_DIVIDER_LIMITS,
  sourceToPlan,
  type RoomDivider,
  type RoomModelV1,
  type Vec2,
} from '../src/index';
import { minimalModel } from './helpers';

/** The 4 x 3 m test bedroom (x -2..2, z -1.5..1.5) has an identity frame: source = plan. */
const line = (id: string, a: Vec2, b: Vec2): RoomDivider => ({ id, a, b });
const areas = (model: RoomModelV1) => computeMetrics(model).rooms.map((room) => room.areaM2);

describe('applyRoomDividers', () => {
  it('splits a room across, from wall to wall, keeping the total area', () => {
    // Drawn short of both walls: the cut still runs from wall to wall.
    const { model, results } = applyRoomDividers(minimalModel(), [
      line('div1', [1, -1.2], [1, 1.1]),
    ]);
    expect(results).toEqual([
      { id: 'div1', status: 'applied', roomId: 'room-1', newRoomId: 'room-1~div1' },
    ]);
    expect(model.rooms.map((room) => room.id)).toEqual(['room-1', 'room-1~div1']);
    expect(areas(model)).toEqual([9, 3]);
    expect(computeMetrics(model).totalAreaM2).toBe(12);
    expect(model.dividers).toEqual([{ id: 'div1', a: [1, -1.5], b: [1, 1.5] }]);
    expect(parseRoomModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
  });

  it('keeps the id, label and elements of the room on its larger part', () => {
    const { model } = applyRoomDividers(minimalModel(), [line('div1', [1, -1.2], [1, 1.1])]);
    const [kept, split] = model.rooms;
    // No RoomPlan points in this model: the larger part keeps "bedroom", the new one is "other".
    expect([kept!.label, split!.label]).toEqual(['bedroom', 'other']);
    // The north wall runs 3 m along the larger part and 1 m along the smaller one.
    expect(model.walls[0]!.roomId).toBe('room-1');
    expect(model.windows[0]!.roomId).toBe('room-1');
    expect(model.objects[0]!.roomId).toBe('room-1');
  });

  it('moves furniture to the part it stands in', () => {
    const { model } = applyRoomDividers(minimalModel(), [line('div1', [-0.2, -1], [-0.2, 1])]);
    // The bed's center (x = -1) is now in the smaller, western part.
    expect(model.rooms.map((room) => room.id)).toEqual(['room-1', 'room-1~div1']);
    expect(model.objects[0]!.roomId).toBe('room-1~div1');
  });

  it('labels each part from the RoomPlan points inside it', () => {
    const base: RoomModelV1 = {
      ...minimalModel(),
      sections: [
        { label: 'livingRoom', story: 0, point: [-1, 0] },
        { label: 'kitchen', story: 0, point: [1.5, 0] },
      ],
    };
    const { model } = applyRoomDividers(base, [line('div1', [1, -1], [1, 1])]);
    expect(model.rooms.map((room) => room.label)).toEqual(['livingRoom', 'kitchen']);
  });

  it('straightens a line drawn a few degrees off the walls', () => {
    const { model } = applyRoomDividers(minimalModel(), [line('div1', [0.95, -1], [1.05, 1])]);
    expect(model.dividers).toEqual([{ id: 'div1', a: [1, -1.5], b: [1, 1.5] }]);
  });

  it('keeps a clearly diagonal line as drawn', () => {
    const { model, results } = applyRoomDividers(minimalModel(), [line('div1', [0, -1], [1, 1])]);
    expect(results[0]!.status).toBe('applied');
    const [a, b] = [model.dividers![0]!.a, model.dividers![0]!.b];
    expect((b[1] - a[1]) / (b[0] - a[0])).toBeCloseTo(2, 3);
    expect(computeMetrics(model).totalAreaM2).toBe(12);
  });

  it('refuses a tap, a line outside the rooms, a sliver, and a repeated id', () => {
    const { model, results } = applyRoomDividers(minimalModel(), [
      line('tap1', [0, 0], [0.1, 0]),
      line('out1', [3, -1], [3, 1]),
      line('thin', [1.9, -1], [1.9, 1]),
      line('div1', [1, -1], [1, 1]),
      line('div1', [-1, -1], [-1, 1]),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'noCut',
      'outsideRooms',
      'tooSmall',
      'applied',
      'noCut',
    ]);
    expect(model.rooms).toHaveLength(2);
  });

  it('lets a later line split a part an earlier one made', () => {
    const { model } = applyRoomDividers(minimalModel(), [
      line('div1', [1, -1], [1, 1]),
      line('div2', [1.2, 0], [1.8, 0]),
    ]);
    expect(model.rooms.map((room) => room.id)).toEqual([
      'room-1',
      'room-1~div1',
      'room-1~div1~div2',
    ]);
    expect(areas(model)).toEqual([9, 1.5, 1.5]);
    // The second cut stops at the first one, it does not run on through the larger part.
    expect(model.dividers![1]).toEqual({ id: 'div2', a: [1, 0], b: [2, 0] });
  });

  it('is deterministic and leaves its input alone', () => {
    const input = minimalModel();
    const dividers = [line('div1', [1, -1], [1, 1])];
    expect(applyRoomDividers(input, dividers)).toEqual(applyRoomDividers(input, dividers));
    expect(input).toEqual(minimalModel());
  });

  it('returns the same model when there is nothing to apply', () => {
    const model = minimalModel();
    expect(applyRoomDividers(model, []).model).toBe(model);
  });
});

describe('divider coordinates', () => {
  it('round-trips between the plan and the raw scan through the model frame', () => {
    // A frame turned by 30 degrees and moved, as the converter makes.
    const c = Math.cos(Math.PI / 6);
    const s = Math.sin(Math.PI / 6);
    const model: RoomModelV1 = {
      ...minimalModel(),
      frame: { fromSource: [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 1.5, -0.2, -2, 1] },
    };
    const point: Vec2 = [0.7, -1.1];
    const back = sourceToPlan(model, planToSource(model, point));
    expect(back[0]).toBeCloseTo(point[0], 3);
    expect(back[1]).toBeCloseTo(point[1], 3);

    // A divider drawn on the plan splits the plan where it was drawn.
    const divider = dividerFromPlan(model, 'div1', [1, -1], [1, 1]);
    expect(divider.a).not.toEqual([1, -1]);
    expect(applyRoomDividers(model, [divider]).model.dividers).toEqual([
      { id: 'div1', a: [1, -1.5], b: [1, 1.5] },
    ]);
  });
});

describe('parseRoomDividers', () => {
  it('keeps well-formed dividers and drops everything else', () => {
    expect(
      parseRoomDividers([
        { id: 'abcd1234', a: [1, 2], b: [3, 4], extra: true },
        { id: 'abcd1234', a: [0, 0], b: [1, 1] },
        { id: 'BAD', a: [0, 0], b: [1, 1] },
        { id: 'okay', a: [0, 'x'], b: [1, 1] },
        { id: 'okay2', a: [0, 0], b: [1, Number.NaN] },
        { id: 'okay3', a: [0, 0, 0], b: [1, 1] },
        null,
        'text',
      ]),
    ).toEqual([{ id: 'abcd1234', a: [1, 2], b: [3, 4] }]);
    expect(parseRoomDividers({})).toEqual([]);
    expect(parseRoomDividers(null)).toEqual([]);
  });

  it('keeps at most the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `d${100 + i}`,
      a: [0, 0],
      b: [1, 1],
    }));
    expect(parseRoomDividers(many)).toHaveLength(ROOM_DIVIDER_LIMITS.count);
  });
});

describe('applyAnnotations with dividers', () => {
  it('applies labels and photos to the rooms the dividers made', () => {
    const model = applyAnnotations(minimalModel(), {
      dividers: [line('div1', [1, -1], [1, 1])],
      roomLabels: { 'room-1~div1': { label: 'kitchen', name: 'Гал тогоо' } },
      photos: [
        { id: 'photo-1', roomId: 'room-1~div1' },
        { id: 'photo-2', roomId: 'room-1' },
      ],
    });
    expect(model.rooms[1]).toMatchObject({
      id: 'room-1~div1',
      label: 'kitchen',
      name: 'Гал тогоо',
    });
    expect(model.hotspots.map((hotspot) => hotspot.roomId)).toEqual(['room-1~div1', 'room-1']);
  });
});

describe('floor plan with dividers', () => {
  it('draws each divider dashed', () => {
    const { model } = applyRoomDividers(minimalModel(), [line('div1', [1, -1], [1, 1])]);
    const svg = renderFloorPlanSvg(model);
    expect(svg).toContain('<g class="fp-dividers"');
    expect(svg).toContain('stroke-dasharray');
    expect(renderFloorPlanSvg(minimalModel())).not.toContain('fp-dividers');
  });
});

// The friend's 58 m² apartment: one big room holds the hall, the open kitchen and dining area,
// the living room and the balcony. Two seller lines separate the balcony and the kitchen side.
describe('real scan apartment-whole-open-plan with seller dividers', () => {
  const file = fileURLToPath(
    new URL('./fixtures/roomplan/apartment-whole-open-plan.json', import.meta.url),
  );
  const { model: converted } = convertRoomPlan(JSON.parse(readFileSync(file, 'utf8')));
  const living = converted.rooms[0]!;
  // Lines drawn on the plan (model coordinates), stored as the app stores them.
  const dividers = [
    dividerFromPlan(converted, 'balc', [3.2, -0.3], [3.85, -0.3]),
    dividerFromPlan(converted, 'kitch', [-0.3, 0.6], [-0.3, 3.4]),
  ];
  const { model, results } = applyRoomDividers(converted, dividers);

  it('keeps RoomPlan points in the converted model', () => {
    expect(converted.sections?.map((section) => section.label)).toEqual([
      'livingRoom',
      'bedroom',
      'kitchen',
      'bathroom',
      'diningRoom',
    ]);
  });

  it('splits the open room into three, with the same total', () => {
    expect(results.map((result) => result.status)).toEqual(['applied', 'applied']);
    expect(model.rooms).toHaveLength(5);
    // Up to the rounding of the per-room areas, which add up to the total shown.
    expect(computeMetrics(model).totalAreaM2).toBeCloseTo(computeMetrics(converted).totalAreaM2, 1);
    const parts = model.rooms.filter(
      (room) => room.id === living.id || room.id.startsWith(`${living.id.slice(0, 40)}~`),
    );
    expect(parts.map((room) => room.label).sort()).toEqual(['kitchen', 'livingRoom', 'other']);
    const balcony = parts.find((room) => room.id.endsWith('~balc'))!;
    expect(balcony.label).toBe('other');
    expect(computeMetrics({ ...model, rooms: [balcony] }).totalAreaM2).toBeCloseTo(3.9, 1);
  });

  it('puts the kitchen appliances in the kitchen part', () => {
    const kitchen = model.rooms.find((room) => room.label === 'kitchen')!;
    for (const object of model.objects.filter((o) => ['oven', 'stove'].includes(o.category))) {
      expect(object.roomId).toBe(kitchen.id);
      const [x, , z] = object.transform.position;
      expect(pointInPolygon([x, z], kitchen.floor.polygon)).toBe(true);
    }
  });

  it('flags no room as incomplete and stays a valid model', () => {
    expect(incompleteRoomIds(model)).toEqual([]);
    expect(parseRoomModel(JSON.parse(JSON.stringify(model)))).toEqual(model);
  });
});
