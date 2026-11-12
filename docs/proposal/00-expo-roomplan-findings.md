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
