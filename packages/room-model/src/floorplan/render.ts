import { inwardNormal, layoutHotspots, visualCenter } from '../geometry/layout';
import { boundsOf, polygonArea } from '../geometry/polygon';
import { directionFromYaw, wallEndpoints } from '../geometry/wall';
import type { Aperture, Room, RoomModelV1 } from '../schema/model';
import type { Vec2 } from '../schema/primitives';

export interface FloorPlanTheme {
  /** Page color behind the plan, or `null` for a transparent background. */
  background: string | null;
  floor: string;
  floorSelected: string;
  wall: string;
  windowFill: string;
  door: string;
  objectFill: string;
  objectStroke: string;
  text: string;
  textMuted: string;
  hotspot: string;
  hotspotIcon: string;
  fontFamily: string;
}

export const DEFAULT_FLOOR_PLAN_THEME: FloorPlanTheme = {
  background: '#ffffff',
  floor: '#f6f1e7',
  floorSelected: '#fbe3b4',
  wall: '#2f3437',
  windowFill: '#d8ecf7',
  door: '#8a8f93',
  objectFill: '#e3dccd',
  objectStroke: '#b7ad98',
  text: '#23272a',
  textMuted: '#5d656b',
  hotspot: '#d9480f',
  hotspotIcon: '#ffffff',
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', Arial, sans-serif",
};

/** Localized text for the plan. Without it, the plan is drawn without labels. */
export interface FloorPlanText {
  roomName(room: Room): string;
  area(areaM2: number): string;
  /** Accessible name of a photo marker, for example "Photo 2, Kitchen". */
  photo?(index: number, room: Room): string;
}

export interface FloorPlanOptions {
  text?: FloorPlanText;
  theme?: Partial<FloorPlanTheme>;
  /** Which story to draw. Defaults to the lowest story in the model. */
  story?: number;
  /** Room to draw highlighted. */
  selectedRoomId?: string | null;
  /** Accessible title of the drawing. */
  title?: string;
  showObjects?: boolean;
  showHotspots?: boolean;
  /** Makes rooms and photo markers focusable, for use in an interactive page. */
  interactive?: boolean;
  /** Fixed pixel size, for rasterizing. Without it the drawing scales to its container. */
  size?: { width: number; height: number };
  /** Empty margin around the plan, in meters. */
  paddingM?: number;
  /** Drawn wall thickness, in meters. RoomPlan walls are surfaces without thickness. */
  wallThicknessM?: number;
}

/** Drawing units per meter. Centimeters keep font sizes and stroke widths in a sane range. */
const UNITS_PER_M = 100;
/** Two doors closer than this, and parallel, are the two sides of one physical door. */
const DOOR_PAIR_DISTANCE_M = 0.5;

const unit = (meters: number): string => {
  const value = Math.round(meters * UNITS_PER_M * 10) / 10;
  return String(value === 0 ? 0 : value);
};

const degrees = (radians: number): string => {
  const value = Math.round(((radians * 180) / Math.PI) * 100) / 100;
  return String(value === 0 ? 0 : value);
};

/** Escapes text for use in SVG content and attribute values. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const points = (polygon: readonly Vec2[]): string =>
  polygon.map(([x, z]) => `${unit(x)},${unit(z)}`).join(' ');

/** SVG transform that places a shape drawn around the origin at a plan position and yaw. */
const place = (position: Vec2, yaw: number): string =>
  `translate(${unit(position[0])} ${unit(position[1])}) rotate(${degrees(-yaw)})`;

/**
 * Draws a model as a 2D floor plan and returns it as an SVG string.
 *
 * Pure and deterministic, with no DOM or React dependency, so the same function serves the
 * interactive component, server-rendered pages, and image previews. Elements carry `data-`
 * attributes (`data-room-id`, `data-photo-id`) for click handling.
 */
export function renderFloorPlanSvg(model: RoomModelV1, options: FloorPlanOptions = {}): string {
  const theme = { ...DEFAULT_FLOOR_PLAN_THEME, ...options.theme };
  const thickness = options.wallThicknessM ?? 0.1;
  const padding = (options.paddingM ?? 0.4) + thickness;
  const { text, interactive = false } = options;

  // --- What is on this story ------------------------------------------------------------------
  const lowestStory = model.rooms.reduce((lowest, room) => Math.min(lowest, room.story), Infinity);
  const story = options.story ?? (Number.isFinite(lowestStory) ? lowestStory : 0);
  const rooms = model.rooms.filter((room) => room.story === story);
  const roomsById = new Map(model.rooms.map((room) => [room.id, room]));
  // Elements without a room cannot be assigned to a story; they are drawn on the lowest one.
  const onStory = (roomId: string | null) =>
    roomId === null
      ? story === lowestStory || rooms.length === 0
      : roomsById.get(roomId)?.story === story;

  const walls = model.walls.filter((wall) => onStory(wall.roomId));
  const doors = model.doors.filter((door) => onStory(door.roomId));
  const windows = model.windows.filter((window) => onStory(window.roomId));
  const openings = model.openings.filter((opening) => onStory(opening.roomId));
  const objects =
    options.showObjects === false ? [] : model.objects.filter((o) => onStory(o.roomId));

  const polygonOf = (roomId: string | null) =>
    roomId === null ? undefined : roomsById.get(roomId)?.floor.polygon;

  // --- View box -------------------------------------------------------------------------------
  const bounds = boundsOf([
    ...rooms.flatMap((room) => room.floor.polygon),
    ...walls.flatMap((wall) => wallEndpoints(wall)),
  ]) ?? { min: [-1, -1], max: [1, 1] };
  const minX = bounds.min[0] - padding;
  const minZ = bounds.min[1] - padding;
  const width = bounds.max[0] - bounds.min[0] + 2 * padding;
  const height = bounds.max[1] - bounds.min[1] + 2 * padding;

  const out: string[] = [];
  const sizeAttributes = options.size
    ? ` width="${options.size.width}" height="${options.size.height}"`
    : ' width="100%" height="100%"';
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${unit(minX)} ${unit(minZ)} ${unit(width)} ${unit(height)}"` +
      `${sizeAttributes} role="img" font-family="${escapeXml(theme.fontFamily)}">`,
  );
  if (options.title) out.push(`<title>${escapeXml(options.title)}</title>`);
  if (interactive) {
    out.push(
      '<style>.fp-room,.fp-hotspot{cursor:pointer}' +
        '.fp-room:hover{filter:brightness(0.96)}' +
        `.fp-room:focus-visible{outline:none;stroke:${theme.hotspot};stroke-width:6}` +
        `.fp-hotspot:focus-visible{outline:none}.fp-hotspot:focus-visible circle:first-child{stroke:${theme.text}}` +
        '</style>',
    );
  }
  if (theme.background !== null) {
    out.push(
      `<rect x="${unit(minX)}" y="${unit(minZ)}" width="${unit(width)}" height="${unit(height)}" fill="${theme.background}"/>`,
    );
  }

  // --- Walls ----------------------------------------------------------------------------------
  // Each wall is a line twice the wall thickness wide, centered on the scanned surface. The
  // floors are painted afterwards and cover the inner half, which leaves a band of the right
  // thickness on the outside of every room, with clean corners.
  out.push(
    `<g class="fp-walls" stroke="${theme.wall}" stroke-width="${unit(2 * thickness)}" stroke-linecap="square" fill="none">`,
  );
  for (const wall of walls) {
    const [a, b] = wallEndpoints(wall);
    out.push(`<line x1="${unit(a[0])}" y1="${unit(a[1])}" x2="${unit(b[0])}" y2="${unit(b[1])}"/>`);
  }
  out.push('</g>');

  // --- Floors ---------------------------------------------------------------------------------
  out.push('<g class="fp-floors">');
  for (const room of rooms) {
    const fill = room.id === options.selectedRoomId ? theme.floorSelected : theme.floor;
    const focus = interactive ? ' tabindex="0" role="button"' : '';
    const label = interactive && text ? ` aria-label="${escapeXml(text.roomName(room))}"` : '';
    out.push(
      `<polygon class="fp-room" data-room-id="${escapeXml(room.id)}" points="${points(room.floor.polygon)}" fill="${fill}"${focus}${label}/>`,
    );
  }
  out.push('</g>');

  // --- Furniture ------------------------------------------------------------------------------
  if (objects.length > 0) {
    out.push(
      `<g class="fp-objects" fill="${theme.objectFill}" stroke="${theme.objectStroke}" stroke-width="1.5" pointer-events="none">`,
    );
    for (const object of objects) {
      const { width: w, depth: d } = object.dimensions;
      if (w < 0.05 || d < 0.02) continue;
      const [x, , z] = object.transform.position;
      out.push(
        `<rect class="fp-object" data-category="${object.category}" transform="${place([x, z], object.transform.yaw)}"` +
          ` x="${unit(-w / 2)}" y="${unit(-d / 2)}" width="${unit(w)}" height="${unit(d)}" rx="3"/>`,
      );
    }
    out.push('</g>');
  }

  // --- Doors, windows, openings ---------------------------------------------------------------
  out.push('<g class="fp-apertures" pointer-events="none">');
  // A gap in the wall band: paint over it in the floor color.
  const gap = (aperture: Aperture) => {
    const [x, , z] = aperture.transform.position;
    const w = aperture.dimensions.width;
    const t = 2 * thickness + 0.02;
    return (
      `<rect transform="${place([x, z], aperture.transform.yaw)}" x="${unit(-w / 2)}" y="${unit(-t / 2)}"` +
      ` width="${unit(w)}" height="${unit(t)}" fill="${theme.floor}"/>`
    );
  };

  for (const opening of openings) out.push(gap(opening));

  const drawnDoors: Aperture[] = [];
  for (const door of doors) {
    out.push(gap(door));
    const [x, , z] = door.transform.position;
    const [dx, dz] = directionFromYaw(door.transform.yaw);

    // A door between two rooms was scanned from both sides. Draw its swing only once.
    const alreadyDrawn = drawnDoors.some((other) => {
      const [ox, , oz] = other.transform.position;
      const [odx, odz] = directionFromYaw(other.transform.yaw);
      return (
        Math.hypot(ox - x, oz - z) < DOOR_PAIR_DISTANCE_M && Math.abs(dx * odx + dz * odz) > 0.9
      );
    });
    const polygon = polygonOf(door.roomId);
    const inward = polygon ? inwardNormal([x, z], door.transform.yaw, polygon) : null;
    if (alreadyDrawn || !inward) continue;
    drawnDoors.push(door);

    // Door leaf standing open at 90 degrees into the room, and the arc it sweeps.
    const w = door.dimensions.width;
    const hinge: Vec2 = [x - (dx * w) / 2, z - (dz * w) / 2];
    const latch: Vec2 = [x + (dx * w) / 2, z + (dz * w) / 2];
    const open: Vec2 = [hinge[0] + inward[0] * w, hinge[1] + inward[1] * w];
    const sweep = dx * inward[1] - dz * inward[0] > 0 ? 0 : 1;
    out.push(
      `<path class="fp-door" d="M${unit(hinge[0])} ${unit(hinge[1])} L${unit(open[0])} ${unit(open[1])}` +
        ` A${unit(w)} ${unit(w)} 0 0 ${sweep} ${unit(latch[0])} ${unit(latch[1])}"` +
        ` fill="none" stroke="${theme.door}" stroke-width="2"/>`,
    );
  }

  for (const window of windows) {
    const [x, , z] = window.transform.position;
    const w = window.dimensions.width;
    const polygon = polygonOf(window.roomId);
    const inward = polygon ? inwardNormal([x, z], window.transform.yaw, polygon) : null;
    // The pane sits in the wall band, on the outside of the room. Local +Y is the wall
    // normal rotated into the drawing, so work out which side is "out".
    const [dx, dz] = directionFromYaw(window.transform.yaw);
    const localNormal: Vec2 = [-dz, dx];
    const outwardSign = inward
      ? inward[0] * localNormal[0] + inward[1] * localNormal[1] > 0
        ? -1
        : 1
      : 0;
    const top = outwardSign === 0 ? -thickness : outwardSign > 0 ? 0 : -thickness;
    const paneHeight = outwardSign === 0 ? 2 * thickness : thickness;
    out.push(
      `<g class="fp-window" transform="${place([x, z], window.transform.yaw)}">` +
        `<rect x="${unit(-w / 2)}" y="${unit(top)}" width="${unit(w)}" height="${unit(paneHeight)}"` +
        ` fill="${theme.windowFill}" stroke="${theme.wall}" stroke-width="1.5"/>` +
        `<line x1="${unit(-w / 2)}" y1="${unit(top + paneHeight / 2)}" x2="${unit(w / 2)}" y2="${unit(top + paneHeight / 2)}"` +
        ` stroke="${theme.wall}" stroke-width="1"/>` +
        '</g>',
    );
  }
  out.push('</g>');

  // --- Room labels ----------------------------------------------------------------------------
  if (text) {
    out.push('<g class="fp-labels" text-anchor="middle" pointer-events="none">');
    for (const room of rooms) {
      const center = visualCenter(room.floor.polygon);
      const name = text.roomName(room);
      // As large as possible, but the name must fit across the room (about 0.56 em per letter).
      const fitsWidth = (2 * center.clearance * 0.85) / Math.max(4, name.length * 0.56);
      const size = Math.min(0.3, Math.max(0.12, Math.min(fitsWidth, center.clearance * 0.4)));
      const [x, z] = center.point;
      out.push(
        `<text class="fp-room-name" x="${unit(x)}" y="${unit(z - size * 0.2)}" font-size="${unit(size)}"` +
          ` font-weight="600" fill="${theme.text}">${escapeXml(name)}</text>`,
        `<text class="fp-room-area" x="${unit(x)}" y="${unit(z + size * 1.05)}" font-size="${unit(size * 0.85)}"` +
          ` fill="${theme.textMuted}">${escapeXml(text.area(polygonArea(room.floor.polygon)))}</text>`,
      );
    }
    out.push('</g>');
  }

  // --- Photo hotspots -------------------------------------------------------------------------
  if (options.showHotspots !== false) {
    const placements = layoutHotspots(model).filter((placement) => onStory(placement.roomId));
    if (placements.length > 0) {
      out.push('<g class="fp-hotspots">');
      placements.forEach((placement, index) => {
        const room = roomsById.get(placement.roomId);
        const focus = interactive ? ' tabindex="0" role="button"' : '';
        const label =
          interactive && text?.photo && room
            ? ` aria-label="${escapeXml(text.photo(index + 1, room))}"`
            : '';
        out.push(
          `<g class="fp-hotspot" data-photo-id="${escapeXml(placement.photoId)}" data-room-id="${escapeXml(placement.roomId)}"` +
            ` transform="translate(${unit(placement.position[0])} ${unit(placement.position[1])})"${focus}${label}>` +
            `<circle r="${unit(0.17)}" fill="${theme.hotspot}" stroke="${theme.hotspotIcon}" stroke-width="2.5"/>` +
            // A small camera: body, lens.
            `<rect x="-8" y="-5" width="16" height="11" rx="2.5" fill="${theme.hotspotIcon}"/>` +
            `<rect x="-3.5" y="-7.5" width="7" height="4" rx="1" fill="${theme.hotspotIcon}"/>` +
            `<circle cy="0.5" r="3" fill="${theme.hotspot}"/>` +
            '</g>',
        );
      });
      out.push('</g>');
    }
  }

  out.push('</svg>');
  return out.join('');
}
