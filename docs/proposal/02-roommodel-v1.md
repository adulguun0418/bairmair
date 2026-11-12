# Proposal 2: RoomModel v1

The zod schema in `packages/room-model` is the source of truth; TypeScript types are inferred from it. The types below are what that schema will express.

## Conventions

- Units: meters and radians.
- Axes: right-handed, **+Y up**. Same as ARKit and three.js, so the viewer needs no axis flips.
- Plan view: a `Vec2` is `[x, z]`. For the floor plan, SVG `x = x` and SVG `y = z` gives a correct, non-mirrored top-down view.
- **Model frame:** the converter moves the scan into a canonical frame. Lowest floor at `y = 0`, plan bounding box centered on the origin, and the dominant wall direction rotated onto the X axis so floor plans come out square to the page. The applied matrix is stored in `frame.fromSource`.
- `yaw` is a right-handed rotation about +Y, identical to three.js `rotation.y`.
- `position` is the center of the element's bounding box.
- IDs are RoomPlan's own UUIDs. They are stable across re-conversions, which lets user data in the database (room labels, photo assignments) survive a schema change.
- Numbers are rounded to millimeters so output is deterministic and diff-friendly.

## Types

```ts
type Vec2 = [x: number, z: number];
type Vec3 = [x: number, y: number, z: number];
type Quat = [x: number, y: number, z: number, w: number];
type Mat4 = number[];                       // 16 numbers, column-major

interface RoomModelV1 {
  schemaVersion: 1;
  source: {
    kind: 'roomplan' | 'manual';            // manual = authored by hand (the sample files)
    converterVersion: string;               // version of our converter
    formatVersion?: number;                 // Apple's own "version" field, if present
  };
  frame: { fromSource: Mat4 };              // raw scan coordinates -> model coordinates
  rooms: Room[];
  walls: Wall[];
  doors: Aperture[];
  windows: Aperture[];
  openings: Aperture[];                     // doorless passages
  objects: RoomObject[];
  hotspots: Hotspot[];
}

interface Transform { position: Vec3; yaw: number }
interface Dimensions { width: number; height: number; depth: number }   // local X, Y, Z
type Confidence = 'low' | 'medium' | 'high';

interface Room {
  id: string;
  label: RoomLabel;
  name?: string;                            // free text, shown instead of the label
  story: number;                            // 0 = lowest
  floor: { polygon: Vec2[]; y: number };    // simple polygon, >= 3 points, not closed
}

type RoomLabel =
  | 'livingRoom' | 'bedroom' | 'kitchen' | 'bathroom' | 'diningRoom'   // RoomPlan's labels
  | 'toilet' | 'hallway' | 'balcony' | 'storage' | 'other';            // added for local layouts

interface Wall {
  id: string;
  roomId: string | null;
  transform: Transform;
  dimensions: Dimensions;                   // width = length along the wall; depth = 0
  outline?: Vec2[];                         // non-rectangular wall face, wall-local [u, v]
  confidence?: Confidence;
}

interface Aperture {                        // door, window or opening
  id: string;
  roomId: string | null;
  wallId: string | null;                    // the wall it cuts through
  transform: Transform;
  dimensions: Dimensions;
  isOpen?: boolean;                         // doors only
  confidence?: Confidence;
}

interface RoomObject {
  id: string;
  roomId: string | null;
  category: ObjectCategory;
  transform: Transform;
  dimensions: Dimensions;
  confidence?: Confidence;
}

type ObjectCategory =
  | 'storage' | 'refrigerator' | 'stove' | 'bed' | 'sink' | 'washerDryer' | 'toilet'
  | 'bathtub' | 'oven' | 'dishwasher' | 'table' | 'sofa' | 'chair' | 'fireplace'
  | 'television' | 'stairs' | 'other';

interface Hotspot {
  photoId: string;                          // listing_photos.id
  roomId: string;
  cameraPose?: CameraPose;                  // reserved for pose-pinned photos
}

interface CameraPose { position: Vec3; rotation: Quat }   // model coordinates
```

## Example (one 4 x 3 m room, trimmed)

```json
{
  "schemaVersion": 1,
  "source": { "kind": "roomplan", "converterVersion": "1.0.0" },
  "frame": { "fromSource": [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] },
  "rooms": [
    { "id": "room-1", "label": "bedroom", "story": 0,
      "floor": { "y": 0, "polygon": [[-2,-1.5],[2,-1.5],[2,1.5],[-2,1.5]] } }
  ],
  "walls": [
    { "id": "wall-n", "roomId": "room-1",
      "transform": { "position": [0, 1.3, -1.5], "yaw": 0 },
      "dimensions": { "width": 4, "height": 2.6, "depth": 0 } }
  ],
  "doors": [],
  "windows": [
    { "id": "win-1", "roomId": "room-1", "wallId": "wall-n",
      "transform": { "position": [0, 1.5, -1.5], "yaw": 0 },
      "dimensions": { "width": 1.5, "height": 1.4, "depth": 0 } }
  ],
  "openings": [],
  "objects": [
    { "id": "bed-1", "roomId": "room-1", "category": "bed",
      "transform": { "position": [-1, 0.25, -0.5], "yaw": 0 },
      "dimensions": { "width": 1.6, "height": 0.5, "depth": 2 } }
  ],
  "hotspots": [ { "photoId": "6f1c...", "roomId": "room-1" } ]
}
```

## Design choices to review

1. **Transform is `position + yaw`, not a 4x4 matrix.** RoomPlan output is gravity-aligned: walls are vertical, floors horizontal, furniture upright. Position + yaw is readable, easy to hand-write for the sample files, and directly usable by both renderers. If a real scan contains a tilted element, the converter flattens it and reports a warning; the raw file still has the original matrix.

2. **The stored file contains geometry only. User input lives in the database.**
   The brief lists hotspots inside RoomModel, and they are in the schema. But the stored `model.json` is written with `hotspots: []`, and room labels as detected by the scan. Photo-to-room assignments (`listing_photos.room_id`) and label corrections (`room_scans.room_labels`) are applied when the model is served, by one shared function:

   ```ts
   applyAnnotations(model, { roomLabels, photos }): RoomModelV1
   ```

   Why: the brief makes the raw file the source of truth so scans can be re-converted. Labels and photo assignments are not in the raw file. If they were baked into the JSON file, a re-conversion would erase them, and every photo edit would mean rewriting a file in Storage. With this split, `model.json` is always exactly `convert(raw)` and can be regenerated at any time.

3. **Pose-pinned photos later.** `cameraPose` is already an optional field, so v1 consumers ignore it safely. In the database the pose is stored in raw scan coordinates and mapped through `frame.fromSource`, so it stays valid if the canonical frame ever changes.

4. **Rooms come from floor polygons.** One room per scanned floor surface. The label is taken from the RoomPlan section whose center falls inside the polygon, then the user confirms it. Elements get their `roomId` from RoomPlan's per-room data if the export has it, otherwise by point-in-polygon.

5. **No derived values in the model.** Areas are computed by `computeMetrics(model)` (shoelace formula per floor polygon; total = sum). Results are stored in `room_scans.metrics` and `listings.area_scanned_m2`, always displayed as approximate. Scanned area is measured between inner wall surfaces, so it will normally be smaller than the certificate area.

6. **Forward compatibility rules for v1.** Unknown fields are ignored. Unknown `label` or `category` values are read as `'other'`. New optional fields may be added within v1. Anything else is v2.

7. **Not in v1:** wall thickness (a viewer style setting; RoomPlan walls are zero-thickness surfaces), curved walls as a primitive (the converter splits them into straight segments), RoomPlan object attributes, edge completeness flags. All remain available in the raw file.

8. **Validation limits.** Unique IDs, `roomId` / `wallId` must reference existing elements, finite numbers, positive dimensions, caps on array sizes and file size. The file is public, so the viewer validates before rendering.

## Converter

```ts
convertRoomPlan(raw: unknown): { model: RoomModelV1; warnings: ConversionWarning[] }
```

Pure and deterministic. Accepts both `CapturedStructure` (multi-room) and `CapturedRoom` JSON. The raw-input parser is deliberately tolerant, and gets finalized against the first real export in step 4 (see the open questions in `00-expo-roomplan-findings.md`).

## Step 1 deliverables

- Schema, geometry helpers, `computeMetrics`, `applyAnnotations`
- Hand-made samples: a studio, a typical "2 өрөө" apartment, and an L-shaped room with a doorless opening
- Tests for schema validation and area calculations
- Converter skeleton with tests against a synthetic RoomPlan-shaped fixture, replaced by real exports after step 4
