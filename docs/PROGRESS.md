# Progress

## Current state (2026-11-12)
**Step 2 done:** 3D viewer and floor plan work on web with the samples. Waiting for your go-ahead on step 3.

Nothing is committed yet (`git init` only).

## Done
- Step 1: monorepo + `@bairmair/room-model` (schema, geometry, areas, annotations, RoomPlan converter, 3 samples).
- Step 2:
  - `room-model`: floor plan as an SVG string (`renderFloorPlanSvg`), label/hotspot layout, wall splitting around doors and windows.
  - `@bairmair/i18n`: mn (primary) + en catalogs on i18next with typed keys; area formatting (`55 м²`); locale URL helpers.
  - `@bairmair/viewer`: `FloorPlan` (interactive SVG) and, in `@bairmair/viewer/3d`, `RoomViewer3D` (react-three-fiber).
  - `apps/web` (Next.js 16): `/samples` gallery and `/samples/[sample]` with 3D view, floor plan, room list and photo dialog, in sync.
  - 153 tests (room-model 138, i18n 15). Verified in headless Chrome at desktop and phone sizes.

## Commands
- `pnpm dev:web`, then open http://localhost:3000/samples
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`
- `pnpm --filter @bairmair/room-model samples` regenerates the sample JSON

## Decisions made
- Dev environment: native Windows + hosted Supabase project. No WSL, no Docker. Overrides the "WSL2" line in the brief.
- Seller phone: tap to reveal, no login, through a rate-limited RPC. No phone column in `public`.
- Name `bairmair`, scope `@bairmair/*`, bundle id `mn.bairmair.app`.
- Expo SDK 58. `expo-roomplan` pinned at exactly 1.3.2; use `RoomPlanView` / `useRoomPlanView`.
- SMS gateway: parked. Needed at step 3.
- Samples are generated from `samples/definitions.ts`; a test fails if the JSON drifts.
- i18n: i18next with bundled catalogs, synchronous, shared by web and (later) mobile. Numbers are formatted by hand, not with `Intl`, so server, browsers and Hermes print identical strings.
- URLs: Mongolian has no prefix (`/samples`), English is `/en/samples`; `/mn/...` redirects to the unprefixed URL. Browser language is ignored on purpose, so shared links always open in Mongolian.
- 3D: walls get thickness outward from their room, so interior sizes stay as scanned. Walls between the camera and their room fade. Renders on demand only (battery). Each room's photo buttons sit under its label.
- The 3D viewer loads lazily in the browser only; the floor plan is server-rendered SVG.
- `react-hooks/immutability` is off for `packages/viewer/src/3d` (three.js objects are mutated by design).

## Provisional until a real scan exists (step 4)
- `roomplan/capture.ts` reads Apple's JSON by its expected shape. Only this file should need changes.
- Converter tests use synthetic exports. Replace them with real exports as fixtures.
- Not handled yet: curved walls (flattened with a warning), non-rectangular wall outlines.

## To review
- Mongolian UI copy (`packages/i18n/src/messages/mn.ts`), e.g. "Төлөвлөлт" for floor plan.

## Next
Step 3: Supabase schema, RLS, auth and storage, per `docs/proposal/03-database.md`.

## Open decisions
- Where server-side scan processing runs (Next.js route handler recommended), needed at step 5.
- Map library: MapLibre vs Mapbox, compare Ulaanbaatar coverage first (brief "Additions"), needed at step 6.
- Web hosting.
