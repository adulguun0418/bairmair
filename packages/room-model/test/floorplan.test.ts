import { describe, expect, it } from 'vitest';
import { buildSample, SAMPLE_SPECS, type SampleName } from '../samples/definitions';
import {
  applyAnnotations,
  renderFloorPlanSvg,
  type FloorPlanText,
  type RoomModelV1,
} from '../src/index';
import { minimalModel } from './helpers';

const text: FloorPlanText = {
  roomName: (room) => room.name ?? `label:${room.label}`,
  area: (areaM2) => `${areaM2.toFixed(1)} m2`,
  photo: (index, room) => `Photo ${index} in ${room.id}`,
};

const count = (svg: string, pattern: RegExp) => (svg.match(pattern) ?? []).length;

/** Checks that every tag is closed in the right order. */
function expectWellFormed(svg: string) {
  const open: string[] = [];
  for (const match of svg.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|[^>"])*?)(\/?)>/g)) {
    const [, closing, name, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) expect(open.pop()).toBe(name);
    else open.push(name!);
  }
  expect(open).toEqual([]);
}

describe('renderFloorPlanSvg', () => {
  describe.each(Object.keys(SAMPLE_SPECS) as SampleName[])('sample %s', (name) => {
    const model = buildSample(SAMPLE_SPECS[name]);
    const svg = renderFloorPlanSvg(model, { text });

    it('produces well-formed SVG without bad numbers', () => {
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expectWellFormed(svg);
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    });

    it('draws every room, wall and label', () => {
      expect(count(svg, /<polygon class="fp-room"/g)).toBe(model.rooms.length);
      expect(count(svg, /<line x1=/g)).toBeGreaterThanOrEqual(model.walls.length);
      for (const room of model.rooms) {
        expect(svg).toContain(`data-room-id="${room.id}"`);
        expect(svg).toContain(`>label:${room.label}</text>`);
      }
      expect(count(svg, /class="fp-room-area"/g)).toBe(model.rooms.length);
    });

    it('draws windows and furniture', () => {
      expect(count(svg, /class="fp-window"/g)).toBe(model.windows.length);
      expect(count(svg, /class="fp-object"/g)).toBe(model.objects.length);
    });

    it('is deterministic', () => {
      expect(renderFloorPlanSvg(model, { text })).toBe(svg);
    });
  });

  it('draws the swing of a door between two rooms only once', () => {
    const model = buildSample(SAMPLE_SPECS['two-room']);
    // 7 door surfaces: the entrance, and 3 interior doors seen from both sides.
    expect(model.doors).toHaveLength(7);
    expect(count(renderFloorPlanSvg(model), /class="fp-door"/g)).toBe(4);
  });

  it('fits the view box around the plan, in centimeters', () => {
    const svg = renderFloorPlanSvg(minimalModel(), { paddingM: 0.4, wallThicknessM: 0.1 });
    // The room spans x -2..2 and z -1.5..1.5 m; half a meter of margin on every side.
    expect(svg).toContain('viewBox="-250 -200 500 400"');
  });

  it('scales to its container by default and takes a fixed size for rasterizing', () => {
    expect(renderFloorPlanSvg(minimalModel())).toContain('width="100%" height="100%"');
    expect(renderFloorPlanSvg(minimalModel(), { size: { width: 1200, height: 630 } })).toContain(
      'width="1200" height="630"',
    );
  });

  it('draws no labels without text, and no background when it is null', () => {
    const svg = renderFloorPlanSvg(minimalModel(), { theme: { background: null } });
    expect(svg).not.toContain('<text');
    expect(svg).not.toMatch(/<rect x="-250" y="-200"/);
  });

  it('escapes user-provided room names and ids', () => {
    const base = minimalModel();
    const model: RoomModelV1 = {
      ...base,
      rooms: [{ ...base.rooms[0]!, name: '<script>alert("x")</script> & co' }],
    };
    const svg = renderFloorPlanSvg(model, { text, title: 'Plan "A" <1>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co');
    expect(svg).toContain('<title>Plan &quot;A&quot; &lt;1&gt;</title>');
    expectWellFormed(svg);
  });

  it('highlights the selected room', () => {
    const svg = renderFloorPlanSvg(minimalModel(), {
      selectedRoomId: 'room-1',
      theme: { floor: '#aaaaaa', floorSelected: '#ff0000' },
    });
    expect(svg).toMatch(/<polygon class="fp-room" data-room-id="room-1"[^>]*fill="#ff0000"/);
  });

  it('draws photo hotspots with their ids', () => {
    const model = applyAnnotations(buildSample(SAMPLE_SPECS.studio), {
      photos: [
        { id: 'photo-a', roomId: 'main' },
        { id: 'photo-b', roomId: 'main' },
        { id: 'photo-c', roomId: 'bathroom' },
      ],
    });
    const svg = renderFloorPlanSvg(model, { text, interactive: true });
    expect(count(svg, /class="fp-hotspot"/g)).toBe(3);
    expect(svg).toContain('data-photo-id="photo-a" data-room-id="main"');
    expect(svg).toContain('aria-label="Photo 3 in bathroom"');
    expect(count(renderFloorPlanSvg(model, { showHotspots: false }), /class="fp-hotspot"/g)).toBe(
      0,
    );
  });

  it('adds keyboard focus only when interactive', () => {
    expect(renderFloorPlanSvg(minimalModel(), { text })).not.toContain('tabindex');
    expect(renderFloorPlanSvg(minimalModel(), { text, interactive: true })).toContain(
      'tabindex="0" role="button" aria-label="label:bedroom"',
    );
  });

  it('can hide furniture', () => {
    expect(renderFloorPlanSvg(minimalModel(), { showObjects: false })).not.toContain('fp-object');
  });

  it('draws only the requested story', () => {
    const base = minimalModel();
    const upstairs: RoomModelV1 = {
      ...base,
      rooms: [
        base.rooms[0]!,
        { ...base.rooms[0]!, id: 'room-2', story: 1, floor: { ...base.rooms[0]!.floor, y: 2.8 } },
      ],
    };
    expect(renderFloorPlanSvg(upstairs)).toContain('data-room-id="room-1"');
    expect(renderFloorPlanSvg(upstairs)).not.toContain('data-room-id="room-2"');
    expect(renderFloorPlanSvg(upstairs, { story: 1 })).toContain('data-room-id="room-2"');
    expect(renderFloorPlanSvg(upstairs, { story: 1 })).not.toContain('data-room-id="room-1"');
  });

  it('renders a model without rooms', () => {
    const empty: RoomModelV1 = {
      ...minimalModel(),
      rooms: [],
      walls: [],
      windows: [],
      objects: [],
    };
    const svg = renderFloorPlanSvg(empty, { text });
    expectWellFormed(svg);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});
