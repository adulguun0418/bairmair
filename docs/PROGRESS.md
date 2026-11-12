# Progress

## Current state (2026-11-12)
**Step 4 done**, except one check that needs a multi-room scan (see Next).
- Part 1 is merged to `main` (branch `step-4-roomplan`).
- Part 2 is in a pull request (branch `step-4-part-2`) for your review. From now on, each step goes up as a pull request and you merge it on GitHub.

The SMS gateway adapter (step 3) still waits on your gateway details.

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
- Step 4, part 1:
  - `apps/mobile`: Expo SDK 58 from the official template, Expo Router, i18n through `@bairmair/i18n`. Screens: device check + saved scans (`/`), scanner (`/scan`), scan review (`/scans/[id]`) with the shared converter, floor plan (SVG in a WebView), areas, warning codes, and share buttons for the raw JSON, USDZ and RoomModel JSON.
  - Scanner: `RoomPlanView` with our own controls; a pure state machine (`scan-state.ts`) handles expo-roomplan's quirks (OK is not completion; wait for the pending room before next/finish; export captured rooms after an error). Files are copied from `tmp/Export` to `Documents/scans/<id>/` with `meta.json` (model + iOS version).
  - Converter: `curve` made optional. Defensive only: real exports turned out to write `"curve": null`.
  - Verified on Windows: `expo export` bundles to Hermes bytecode, `expo-doctor` 20/20, Info.plist and entitlements via `expo config --type introspect`. On the iPhone: first EAS development build installed, scanning and export work.
- Step 4, part 2:
  - Two real single-room exports as byte-for-byte fixtures (`packages/room-model/test/fixtures/roomplan/`), tested in `real-scans.test.ts`. Answers to the format questions are in `docs/proposal/00-expo-roomplan-findings.md`.
  - Converter 0.2.0 fixes: drops the top-level floor copy, which carries a new identifier (each scan had become two rooms, double area); adds an `incomplete-room` warning for rooms with fewer than 3 walls.
  - The complete L-shaped room is a web sample: `/samples/scan-l-room`.
- Tests: 211 unit (room-model 158, mobile 21, i18n 16, send-sms 12, db 4) + 37 integration tests against the dev project.

## Commands
- `pnpm dev:web`, then open http://localhost:3000/samples
- `pnpm dev:mobile` (Metro for the development build). Runs with `--max-workers 2`: with one worker per CPU thread, Metro crashed out of memory on this PC (exit code -1073740791 = 0xC0000409).
- In `apps/mobile`: `pnpm eas <command>` (EAS CLI 27.7.2 via `pnpm dlx`), `pnpm doctor`
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
- Mobile build 1 native modules: dev-client, roomplan, device, file-system, sharing, location, image-picker, apple-authentication (+ entitlement), crypto, localization, secure-store, keep-awake, webview, AsyncStorage (Supabase session storage per its Expo docs), plus the template's. **Not in build 1** (each needs a new build later): maps (step 6), native Google sign-in (needs a Google Cloud iOS client ID at build time; a browser OAuth flow needs no rebuild).
- iOS: deployment target 16.4 (SDK 58 default), so buyers on 16.4+ can install; scanning needs 17+. SDK 58's template uses the scene life cycle that iOS 27 requires. iPhone only (`supportsTablet: false`).
- Scan gate: LiDAR iPhone allowlist by model ID (`src/scanner/support.ts`). Unknown IDs from a newer generation than the last fully known one are "unverified" and may try; the native check is the backstop. iPads are rejected, per the brief.
- Mobile UI starts in Mongolian whatever the phone language (iOS has no Mongolian UI language). English through an in-app toggle (not persisted yet). iOS permission prompts are Mongolian only.
- Permission prompts limited to camera, photo library, location when in use (+ temporary precise). Microphone, Face ID, background location and motion are switched off in the plugins.
- `app.json` stays static, so `eas init` can write the project id. EAS project `@adulguun0418/bairmair`; development builds use internal (ad hoc) distribution, so a newly registered iPhone needs a new build. `eas.json` pins Node 24.14.1, pnpm 12.18.0 and image `sdk-58` (the default image has Node 22 / pnpm 11).
- EAS CLI runs through `pnpm dlx`, not as a devDependency: it added ~8,000 lockfile lines and build scripts pnpm 12 refuses until approved.
- No `.easignore`: EAS then uses `.gitignore`, which keeps `.env` files off the build servers. An `.easignore` would have to exclude them itself.
- pnpm adds packages younger than its minimum release age to `minimumReleaseAgeExclude` when they are installed explicitly (all of today's Expo patch releases). Prune the list later.

## Notes for later steps
- Wall height: RoomPlan measures walls behind tall furniture lower (2.39 m vs 2.82 m in the same room). Option: raise walls of a room that are almost as tall as its tallest wall to that height. Not done yet; needs your call.
- Step 5 review screen: show the `incomplete-room` warning and offer a rescan. Raw exports are small (42–91 KB per room), far under the 50 MB `scan-raw` limit.
- Step 5: mobile auth. Apple: add the bundle id to Supabase's Apple client IDs, then `signInWithIdToken`. Google: choose native (rebuild) or browser OAuth. Add `bairmair://**` to the Auth redirect URLs. Record the GPS position during a scan (expo-location is in build 1). Uploads: `File.createUploadTask` (expo-file-system) supports background sessions.
- Step 5: supabase-js sends a Blob's own `type` and ignores `contentType`. Deleting a listing leaves its storage objects; add cleanup.
- Before an App Store build: real app icon and splash (the Expo placeholders are still in `apps/mobile/assets`).
- Before production: separate project, remove the test OTP number, turn off the email provider (kept on in dev for the tests).

## To review
- Mongolian UI copy (`packages/i18n/src/messages/mn.ts`), e.g. "Төлөвлөлт" for floor plan.
- OTP SMS text: "Bairmair код: 123456. Хэнд ч бүү хэлээрэй." (`supabase/functions/send-sms/handler.ts`).
- Scanner copy (`scanSupport`, `scan`, `scanResult` in `mn.ts`) and the iOS permission prompts (`apps/mobile/app.json`).
- Sample name "Бодит скан: Г хэлбэрийн өрөө" and the updated `samples.intro`.

## Next
- You: review and merge the step 4 part 2 pull request.
- You, when convenient: one scan of two neighbouring rooms in a single session (tap "Дараагийн өрөө" between them). It answers the last format question (are shared walls duplicated or merged?) and checks the merged-floor handling with several rooms. No code waits on it.
- Then step 5: listing creation and upload flow (decide first where server-side scan processing runs).

## Open decisions
- SMS gateway: which one, its API doc (endpoint, auth, sender ID), and whether it needs IP allowlisting (Edge Functions have no fixed IP). Only `send-sms/gateways.ts` changes.
- Where server-side scan processing runs (Next.js route handler recommended), needed at step 5.
- Map library: MapLibre vs Mapbox, compare Ulaanbaatar coverage first (brief "Additions"), needed at step 6.
- Web hosting.
