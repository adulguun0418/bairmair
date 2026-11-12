# Progress

## Current state (2026-11-12)
**Step 1 done:** monorepo scaffolded, `@bairmair/room-model` built and tested. Waiting for your go-ahead on step 2.

Nothing is committed yet (`git init` only).

## Done
- Proposal approved (`docs/proposal/`).
- Workspace: pnpm 12 + Turborepo, TypeScript 6.0 strict (the version the Expo SDK 58 template pins), ESLint, Prettier, Vitest.
- `packages/room-model`:
  - RoomModel v1 zod schema + types, with reference checks and size limits
  - geometry helpers (areas, point-in-polygon, wall endpoints, aperture cutouts)
  - `computeMetrics` (per-room and total area) and `applyAnnotations` (labels + photo hotspots from the database)
  - RoomPlan converter: tolerant reader (`roomplan/capture.ts`) + geometry (`roomplan/convert.ts`)
  - 3 samples in `samples/`: `studio`, `two-room` ("2 өрөө", 54.96 m²), `l-shaped`
  - 99 tests

## Commands
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`
- `pnpm --filter @bairmair/room-model samples` regenerates the sample JSON from `samples/definitions.ts`

## Decisions made
- Dev environment: native Windows + hosted Supabase project. No WSL, no Docker. Overrides the "WSL2" line in the brief.
- Seller phone: tap to reveal, no login, through a rate-limited RPC. No phone column in `public`.
- Name `bairmair`, scope `@bairmair/*`, bundle id `mn.bairmair.app`.
- Expo SDK 58. `expo-roomplan` pinned at exactly 1.3.2; use `RoomPlanView` / `useRoomPlanView`.
- SMS gateway: parked. Needed at step 3.
- Samples are generated from compact definitions, not typed by hand. A test fails if a JSON file drifts from its definition.
- In the samples, a door between two rooms appears twice, once on each room's wall, the way a room-by-room scan would see it.
- `source.kind` also allows `'manual'` (used by the samples).
- No `packages/config`; shared config lives at the repo root.
- esbuild's install script is denied in `pnpm-workspace.yaml`; nothing needs it.

## Provisional until a real scan exists (step 4)
- `roomplan/capture.ts` reads Apple's JSON by its expected shape. Only this file should need changes.
- Converter tests use synthetic exports. Replace them with real exports as fixtures.
- Not handled yet: curved walls (flattened with a warning), non-rectangular wall outlines.

## Next
Step 2: 3D viewer and floor-plan renderer on web, using the samples. Creates `apps/web` (Next.js) and `packages/viewer`.

## Open decisions
- Where server-side scan processing runs (Next.js route handler recommended), needed at step 5.
- Map library, needed at step 6.
- Web hosting.
