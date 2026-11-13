# expo-roomplan: source review

Reviewed: `expo-roomplan@1.3.2` (npm tarball, published 2026-11-03), Swift + JS source read in full.
Pin exactly `1.3.2` (no `^`). MIT, single maintainer, 39 stars, no open issues, no changelog or GitHub releases.

## What it does

- Two API surfaces:
  - `useRoomPlan()` presents a full-screen native view controller with its own buttons.
  - `RoomPlanView` / `useRoomPlanView()` / `RoomPlanProvider` embed Apple's `RoomCaptureView` in a React Native view; we draw the controls and drive it with props (`running`, `finishTrigger`, `addAnotherTrigger`, `exportTrigger`).
- Multi-room (iOS 17+): each "add room" stops the capture with `pauseARSession: false` (keeps one coordinate space), builds a `CapturedRoom` with `RoomBuilder`, and appends it to an array. Export merges the array with `StructureBuilder.capturedStructure(from:)`.
- Export writes two files to the app's temp folder:
  - `tmp/Export/<scanName>.json` = `JSONEncoder().encode(CapturedStructure)`
  - `tmp/Export/<scanName>.usdz` = `CapturedStructure.export(to:exportOptions:)` (parametric by default)
- With `sendFileLoc: true`, `onExported` returns `{ scanUrl, jsonUrl }` (file URLs).

## The exported JSON

The package does not define the JSON. It is Apple's own `Codable` encoding of `CapturedStructure`, written with default encoder settings. Apple does not document that format, and nothing in the package or its README shows a sample.

Consequences:
- The exact key names and enum encodings can only be confirmed from a real export (build step 4). Apple forum posts report an undocumented `coreModel` blob in the JSON, and one report says merged-structure JSON lacked per-room data.
- Expected content, from Apple's `CapturedStructure` / `CapturedRoom` API: `walls`, `doors`, `windows`, `openings`, `floors`, `objects`, `sections`, possibly `rooms`. Surfaces carry `identifier`, `category`, `confidence`, `dimensions`, `transform` (4x4), `parentIdentifier`, `polygonCorners`, `completedEdges`, `curve`, `story`.
- The format can change with iOS versions. Keeping the raw file as source of truth and converting through a versioned schema (your plan) is the right protection.

Questions only a real export answers:
1. Does the structure JSON contain `rooms[]` (per-room membership), or only merged arrays?
2. Are floors polygons (`polygonCorners`) or bounding rectangles?
3. Are walls between two scanned rooms duplicated (one per room) or merged?
4. How are `category` and `confidence` encoded (string vs keyed object)?
5. How big is the `coreModel` blob (upload size)?
6. Does every scanned room get a `sections` label?

## Answers from real exports (2026-11-12)

Two single-room scans from the step 4 test screen (iPhone, expo-roomplan 1.3.2), kept byte for byte in `packages/room-model/test/fixtures/roomplan/` and tested in `real-scans.test.ts`.

1. **Yes, `rooms[]` is there.** Each entry is a full `CapturedRoom`: `walls`, `doors`, `windows`, `openings`, `floors`, `objects`, `sections`, `story`, `version` (2), `coreModel`, `referenceOriginTransform`. The top-level arrays repeat the rooms' walls, doors and objects with the **same identifiers** (transforms equal up to float noise). **Floors are the exception:** the top-level floor has a **new identifier** and a different local frame, with the same outline. The converter now drops such merged copies; before the fix, each scan came out as two overlapping rooms with double the area.
2. **Polygons.** `polygonCorners` in the floor's local XY plane (z ≈ 1e-7), 4 corners for a rectangle, 8 for the L-shaped room. `dimensions` is a bounding size and can be larger than the polygon (6.20 × 3.12 for a 6.20 × 1.95 outline), so it must not be used when corners exist.
3. **Answered by a whole-apartment scan (2026-11-13, see below): one wall.** Walked through in one continuous capture, the wall between two rooms is a single surface.
4. **Keyed objects** for `category` (`{"wall":{}}`, `{"door":{"isOpen":false}}`, `{"table":{}}`) and `confidence` (`{"high":{}}`). Section `label` is a **plain string** (`"unidentified"`). Transforms are flat arrays of 16 numbers, column-major. Optional values are written as explicit `null` (`"curve": null`, `"parentIdentifier": null`). Objects also carry `attributes` (e.g. `ChairType`, `TableShapeType`, `StorageType`) and chairs have their table as `parentIdentifier`.
5. **Small.** `coreModel` is base64 inside each room only: 31,036 and 82,628 characters. Whole files: 42 KB and 91 KB. Far below the 50 MB `scan-raw` limit, even for a large apartment.
6. **One section per room, but unlabelled.** Both rooms came back as `"unidentified"` (read as `other`). Room labels cannot be relied on; the user's label step stays essential.

Also seen:
- An incomplete scan (only 2 of the walls captured) still has a floor, cut off at the captured walls; the table sticks out of it. The converter now reports `incomplete-room` for a room with fewer than 3 walls, so the review step can ask for a rescan.
- Walls hidden behind tall furniture are measured lower: 2.39 m behind the shelves vs 2.82 m elsewhere in the same room, so the 2.5 m shelves rise above those walls in the 3D view.
- expo-roomplan 1.3.2 builds and scans on Expo SDK 58: the first EAS development build installed, and scanning and export worked (gap 10 below).

## Several rooms (2026-11-13)

**"Add room" does not work in 1.3.2.** On the iPhone, the scanner stayed on "Өрөөг боловсруулж байна…" after "Дараагийн өрөө" while the camera kept scanning. The package's `handleAddAnotherTrigger` calls `captureSession.stop(pauseARSession: false)` and then `run()` on the next main-queue tick, without waiting for `captureSession(_:didEndWith:)`. Apple's multi-room sample waits for the room before running again; here the finished room is never delivered, so no `OK` arrives. Fixing it would mean patching the Swift (custom native code + a new build).

**One continuous capture instead.** The app now scans the whole apartment in one session (start → walk through every room → "Finish"). Fixture `apartment-living-corridor.json` (a living room with a dining area and the corridor next to it) shows what that exports:
- **One floor** for everything (10 corners, 20.80 m²), one `rooms[]` entry.
- **The walls separate the rooms.** The corridor's five walls end on the living room's west wall (T-junctions), and the door between them sits in that wall. The shared wall is one surface, not two.
- **Sections are points, not outlines**: `livingRoom` and `diningRoom` inside the living room, `unidentified` inside the corridor.

The converter (0.3.0) therefore splits a floor along its walls: the areas the walls close off become rooms (17.53 + 3.27 m² here) when together they cover the floor to within 5%; otherwise the floor stays one room with a `rooms-not-split` warning. Split rooms get ids from the floor id and their walls, so they are stable across re-conversions.

## Gaps and how I plan to handle them

| # | Gap | Plan |
|---|-----|------|
| 1 | **No support check in the JS API.** `RoomCaptureSession.isSupported` is only called natively when the view starts, and surfaces as an `Error` status. `useRoomPlan()` does not check at all. | Gate the scan entry in JS: iOS only, iOS major version >= 17, and a LiDAR model allowlist using `expo-device` (`modelId`). Keep the native error as a backstop for models not in the list. A one-line native `isSupported` export would be cleaner but is custom native code, so not in MVP. |
| 2 | `useRoomPlan()` has **hardcoded English buttons and alerts** ("Finish", "Add Another Room to Scan", "Export Results"). | Use `RoomPlanView` + `useRoomPlanView()` and render our own localized controls. Apple's in-scan coaching text follows the iOS system language and is outside our control. |
| 3 | **`OK` status is not a completion signal.** It fires after every room is processed and again before export finishes. `autoCloseOnTerminalStatus: true` would stop the scanner after the first "add room". | Leave `autoCloseOnTerminalStatus` off. Treat `onExported` as "done". |
| 4 | The native view **never clears its captured rooms**. Reusing a mounted view for a second scan would merge old rooms into the new export. | Mount a fresh view per scan session (React `key`). |
| 5 | Export goes to **temp storage with a fixed filename** from `scanName`. | Unique `scanName` per draft; copy both files into the app's document directory immediately after `onExported`. |
| 6 | **No intermediate results.** Only the final merged export reaches JS. If the merge fails or the app is killed mid-scan, all rooms are lost. | A draft exists only after a successful export. Tell the user this in the scan UI. |
| 7 | **No privacy manifest** is shipped (the plugin comment says otherwise; the example README confirms it is not injected). | Add `ios.privacyManifests` in app config. |
| 8 | The **Android view throws** in its constructor. | Never render it on Android; keep the scanner in iOS-only files. |
| 9 | No access to capture configuration, builder options (fixed `.beautifyObjects`), or camera poses. | Accepted for MVP. Pose-pinned photos need custom native code, as the brief already says. |
| 10 | **Built against Expo SDK 53 / RN 0.79.** Peer deps are `*`. Current Expo is SDK 58 / RN 0.88 (built for iOS 27). | Use SDK 58. Compatibility is unproven until the first EAS build in step 4; that build is the test. If it fails, the fallback is a `pnpm patch` of the package, which I will flag before doing. |

Config plugin: sets `NSCameraUsageDescription` only if missing (accepts `cameraPermissionText`) and raises the Podfile platform to 16.0. No other native changes.
