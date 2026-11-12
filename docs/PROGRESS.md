# Progress

## Current state (2026-11-12)
**Step 3 done**, except the SMS gateway adapter, which waits on your gateway details (see Open decisions). Waiting for your go-ahead on step 4.

Step 3 is committed and merged to `main` (branch `step-3-supabase`).

## Done
- Step 1: monorepo + `@bairmair/room-model` (schema, geometry, areas, annotations, RoomPlan converter, 3 samples).
- Step 2:
  - `room-model`: floor plan as an SVG string (`renderFloorPlanSvg`), label/hotspot layout, wall splitting around doors and windows.
  - `@bairmair/i18n`: mn (primary) + en catalogs on i18next with typed keys; area formatting (`55 м²`); locale URL helpers.
  - `@bairmair/viewer`: `FloorPlan` (interactive SVG) and, in `@bairmair/viewer/3d`, `RoomViewer3D` (react-three-fiber).
  - `apps/web` (Next.js 16): `/samples` gallery and `/samples/[sample]` with 3D view, floor plan, room list and photo dialog, in sync.
- Step 3:
  - Dev project `bairmair` (ref `xjfqbgwobpudqgjmnaod`, Postgres 17, Seoul) linked; 7 migrations applied: schema, districts, triggers, RPCs (`reveal_listing_contact`, `record_listing_view`, `confirm_listing_available`), grants + RLS, storage buckets and policies.
  - Auth from `supabase/config.toml`: phone OTP through the `send-sms` Edge Function (Send SMS hook). Test number +976 00000001, code 123456 (skips the hook).
  - `@bairmair/db`: generated types, storage paths, database error keys.
  - Verified on the live project: Cyrillic trigrams work (ICU en-US locale); phone auth needs no built-in SMS provider; the caller IP reaches SQL; CLI works on Windows without Docker.
- Tests: 169 unit (room-model 138, i18n 15, send-sms 12, db 4) + 37 integration tests against the dev project.

## Commands
- `pnpm dev:web`, then open http://localhost:3000/samples
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`
- `pnpm --filter @bairmair/room-model samples` regenerates the sample JSON
- `pnpm test:remote`: integration tests on the dev project (needs `packages/db/.env`; creates and deletes test users)
- `pnpm db:push` (new migrations), then `pnpm db:types`; `pnpm functions:deploy`
- Auth settings: `pnpm supabase config diff --remote`, then `pnpm supabase config push --remote`
- SQL: `pnpm supabase db query --read-only "<sql>" --remote`

## Decisions made
- Dev environment: native Windows + hosted Supabase project. No WSL, no Docker. Overrides the "WSL2" line in the brief.
- Seller phone: tap to reveal, no login, through a rate-limited RPC. No phone column in `public`.
- Name `bairmair`, scope `@bairmair/*`, bundle id `mn.bairmair.app`.
- Expo SDK 58. `expo-roomplan` pinned at exactly 1.3.2; use `RoomPlanView` / `useRoomPlanView`.
- Samples are generated from `samples/definitions.ts`; a test fails if the JSON drifts.
- i18n: i18next with bundled catalogs, synchronous, shared by web and (later) mobile. Numbers are formatted by hand, not with `Intl`, so server, browsers and Hermes print identical strings.
- URLs: Mongolian has no prefix (`/samples`), English is `/en/samples`; `/mn/...` redirects to the unprefixed URL. Browser language is ignored on purpose, so shared links always open in Mongolian.
- 3D: walls get thickness outward from their room, so interior sizes stay as scanned. Walls between the camera and their room fade. Renders on demand only (battery). Each room's photo buttons sit under its label.
- The 3D viewer loads lazily in the browser only; the floor plan is server-rendered SVG.
- `react-hooks/immutability` is off for `packages/viewer/src/3d` (three.js objects are mutated by design).
- Supabase CLI pinned at 3.1.0. In v3, hosted commands need `--remote` (last) and `--yes` when non-interactive. `supabase/.env` (gitignored) must exist: config.toml reads the hook URI and secret from it.
- Migrations are append-only once applied.
- Changes from proposal 03:
  - exact location is `lat`/`lng` in `listing_private`; the public pin is snapped to the centre of a 0.0025° cell unless the owner opts in
  - added `unit_number`, `last_confirmed_at` (+ `confirm_listing_available()`), `scan_verified`
  - extra integrity: district belongs to city, a photo's scan is from the same listing, max 40 photos, no draft → sold
  - districts live in a migration, not `seed.sql`
  - one SELECT policy per role (advisor fix)
- Database errors are stable keys (`packages/db/src/errors.ts`) for the apps to localize; RPCs return HTTP 404/429.
- Rate-limit IP: `cf-connecting-ip` (Cloudflare rejects client-supplied ones), else the last `x-forwarded-for` entry.
- `send-sms`: errors on signed requests are HTTP 200 + error body, because Auth hides the reason for any other status. Only +976 numbers get SMS; foreign numbers can sign in with Apple/Google but cannot publish.
- Advisors: 5 accepted warnings. The 3 RPCs are `security definer` and callable on purpose.

## Notes for later steps
- Step 4: Apple and Google sign-in (bundle id, deep-link scheme, Apple/Google developer accounts). Add the app scheme to the redirect URLs. Check the raw RoomPlan JSON size: `scan-raw` allows 50 MB (free plan limit).
- Step 5: supabase-js sends a Blob's own `type` and ignores `contentType`. Deleting a listing leaves its storage objects; add cleanup.
- Before production: separate project, remove the test OTP number, turn off the email provider (kept on in dev for the tests).

## To review
- Mongolian UI copy (`packages/i18n/src/messages/mn.ts`), e.g. "Төлөвлөлт" for floor plan.
- OTP SMS text: "Bairmair код: 123456. Хэнд ч бүү хэлээрэй." (`supabase/functions/send-sms/handler.ts`).

## Next
Step 4: integrate expo-roomplan in a minimal test screen (first EAS development build).

## Open decisions
- SMS gateway: which one, its API doc (endpoint, auth, sender ID), and whether it needs IP allowlisting (Edge Functions have no fixed IP). Only `send-sms/gateways.ts` changes.
- Where server-side scan processing runs (Next.js route handler recommended), needed at step 5.
- Map library: MapLibre vs Mapbox, compare Ulaanbaatar coverage first (brief "Additions"), needed at step 6.
- Web hosting.
