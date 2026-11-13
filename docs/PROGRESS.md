# Progress

## Current state (2026-11-13)
**Step 6a merged. Step 6b done** (pull request `step-6b-search`, merged): search RPC, web search with filters and a MapLibre map, new home page, agent pages, freshness ("still available" in the app; unconfirmed listings leave search). No mobile rebuild needed (the mobile changes are JS only).

Step 6 is split in three:
- 6a: public listing page (web). Done.
- 6b: search, map, agent pages, freshness. Done.
- 6c: mobile browse/search/map + favorites + report (**EAS build 3**: MapLibre native module).

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
- Step 5a:
  - `apps/web`: `POST /api/scans/{id}/process` (Bearer access token). Rebuilds the raw paths from the listing and scan ids (never trusts the row's paths), converts with the shared converter, writes `model.json` to `scan-models`, sets `ready` + metrics (with warning counts). Missing upload → 409, scan untouched; unconvertible → 422, `failed` + `processing_error`. Logic in `src/server/process-scan.ts` with an injected store, unit-tested on the real fixtures; route tested end to end on the dev project (`test-remote/`).
  - Migration 8: `room_scans.processing_error` (server-written).
  - `@bairmair/db`: API contract (`processScanPath`, `ProcessScanResponse`) and API error keys.
  - `apps/mobile`: Supabase client (AsyncStorage, refresh only in the foreground), `AuthProvider`, `/account` (phone status, name, sign-out), `/sign-in` (phone; Apple and Google buttons only when the project enables them, read from `/auth/v1/settings`), `/verify` (6-digit code, 60 s resend). Apple/Google users add a phone through `updateUser` + `phone_change` OTP. Home screen links to the account.
  - Auth config pushed: Apple on (client id `mn.bairmair.app`, native only, no secret), redirect `bairmair://**`.
- Step 5b:
  - `apps/mobile/src/listings/`: local-first listings. Each listing is a folder `Documents/listings/<id>/` (`listing.json` + resized photos). Pure modules (unit-tested): `form.ts` (form ↔ `listings` row, validation mirroring the CHECK constraints, number parsing such as `250 000 000` and `65,5`, publish checklist), `model.ts` (edits and sync progress), `sync-plan.ts` (next operation), `sync-engine.ts` (one operation at a time, backoff 5 s → 5 min, refused changes wait for the next edit), `sync-errors.ts`. Native: `remote.ts` (Supabase), `files.ts`, `photos.ts`, `location.ts`; `listings.ts` wires them up.
  - Screens: home is now "Миний зарууд" (local listings with sync status, server-only listings with "download to edit", links to account and the RoomPlan test, which moved to `/scan-test`); `/listings/[id]` editor (type, basics, price, property, location, photos, publish checklist, delete).
  - Photos: system picker (multi-select, no library permission) or camera; resized to 2048 px long edge, JPEG 0.8, all metadata (GPS) dropped; uploaded with `File.upload` (background URL session) straight to Storage with `x-upsert`.
  - Location: "use my current location" (precise only, inside Mongolia) → `listing_private`; district chips, khoroo, complex name, directions, unit number (private), exact-pin toggle.
  - `@bairmair/db`: `CITIES`/`DISTRICTS` constants (remote test checks them against the tables), `LISTING_LIMITS`, `isInMongolia`. `@bairmair/i18n`: `formatMoney`, `formatMoneyCompact` (`250 сая ₮`), `listings` and `listingForm` catalogs.
  - Integration test `apps/mobile/test-remote/listing-sync.test.ts`: the real engine + Supabase remote against the dev project (create, private row insert/update, uploads, reorder, removal, repeats, other user refused, download, delete with files).
- Step 5c:
  - Migration 9 (`20261114100000_scan_location.sql`): `room_scans.scan_lat/scan_lng/scan_accuracy_m` (insert-only for sellers, Mongolia check). `private.refresh_listing_scan()` now derives `has_3d`, `area_scanned_m2` and `scan_verified` in one place, called from the `room_scans` and `listing_private` triggers.
  - `apps/mobile`: a listing holds one scan (`LocalScan`: row, raw uploads, processing, room labels) plus scan ids to clean up; photos carry a room; the listing has a desired `status` and the `serverStatus`. Old 5b files are normalized on load. New sync operations, in order: create scan row → room labels → photo rooms → raw JSON → USDZ → process → remove replaced scans. Status: leaving the live states is sent first; publishing waits for fields, location and photos (and for the processed scan when the area comes from it). Process answers: 409 re-uploads (after a backoff), 404 recreates the row, 422 marks the scan failed; a scan from another phone without files becomes failed.
  - Screens: editor sections "3D скан" (floor plan, area, progress, incomplete-room warning, location note, review rooms, assign photos, rescan, remove) and "Нийтлэх" (checklist, verified-phone check, publish / mark sold or rented / hide / publish again, refused change with try again or cancel). `/listings/[id]/scan` (scanner + GPS watch, best fix kept), `/listings/[id]/rooms` (labels and names, opened after a scan), `/listings/[id]/photo-rooms`. The editor moved to `listings/[id]/index.tsx`. Home shows the server status and a 3D badge.
  - Status-aware validation: while live, an edit that empties a required field waits (`incompleteForLive`) instead of failing at the database.
  - Integration tests run the web server's real `processScan` behind a fake `fetch`.
- Step 6a:
  - Migration 10 (`20261115100000_listing_pages.sql`): **privacy fix**: `room_scans` had a table-wide SELECT grant, so 5c's `scan_lat/scan_lng/scan_accuracy_m` (the phone's position during the scan, i.e. the exact location) were readable by anyone for live listings. Now a column grant without them; the owner reads them through `scan_location(scan_id)` (mobile "download to edit" uses it). Plus view `district_price_stats` (median price per official m² of fresh live listings by type/district/currency).
  - `@bairmair/db`: `LISTING_FRESHNESS` (14 days), `isListingFresh`, `daysSince`, `DISTRICT_STATS_MIN_LISTINGS` (3). `@bairmair/room-model`: `parseRoomLabelOverrides` (moved from mobile). `@bairmair/i18n`: `formatListingPrice` (`1.8 сая ₮/сар`), `formatPricePerArea` (`3.8 сая ₮/м²`), `formatListingPost` (share text), `listingPage` catalog.
  - `apps/web`: `/listings/[id]` (and `/en/...`): badges (type, 3D, scanned on-site), price + per m² + district median, summary, "updated X days ago", stale notice, sold/rented banner, photo mosaic + viewer, 3D/floor plan (`ListingScene` with the seller's room labels and photo rooms), description, location (no map yet), details, seller card, tap-to-reveal phone with call/SMS, share (system sheet, copy post, Facebook), view counter. Data via the publishable key (RLS decides), one cached loader (`'use cache'`, 1 min, tag `listing:<id>`) shared by page, metadata and image.
  - Open Graph image at `/api/og/listings/[id]` (`?lang=en`): floor plan (or cover photo) + price, rooms, area, district; Noto Sans from `@fontsource/noto-sans` (one family per subset, otherwise Satori drops ₮ and bold Cyrillic). Under `/api` so the URL gets no `/mn` redirect.
  - Verified on a production build against the dev project: OG tags, image, missing listing → not-found with `noindex`, phone not in the HTML.
- Step 6b:
  - Migration 11 (`20261116100000_search.sql`): `search_listings(...)`, security invoker (RLS still applies). Only published listings confirmed within 14 days. Filters: type, districts, rooms (exact counts), price in one currency, area (official, else scanned), 3D only, text phrase (trigram `LIKE`, wildcards escaped), owner, map viewport (GiST `&&` + exact lat/lng check). Sorts: recommended (3D first, then newest), newest, price up/down (requested currency first). Paging (limit ≤ 1000, offset ≤ 10000) with `total_count`. Returns the public pin and the cover photo id, never the exact location.
  - `@bairmair/db`: `SearchListingRow` (real nullability), `SEARCH_SORTS`, `SEARCH_LIMITS`, `MAP_PIN_COLUMNS`, `ULAANBAATAR_CENTER`, `daysLeftInSearch`. `@bairmair/i18n`: `formatPinPrice` (`250 сая`, `1.8 сая/сар`), `formatPinPricePerArea` (`3.8 сая/м²`); `search`, `map`, `listingCard`, `agentPage` catalogs, account agent and freshness copy.
  - `apps/web`:
    - `/search` (and `/en/search`): filters in the URL (`lib/search-params.ts`, unit-tested: districts by slug, rooms 1–5+, price in millions of ₮ or in $, area, 3D, text, sort, page, `view=map`). A GET form that also works before JavaScript loads; list with paging, or the map.
    - Map (`maplibre-gl` 6.18.0, OpenFreeMap "liberty"): price pins as a symbol layer (3D listings amber), GeoJSON clustering, pins loaded per viewport (+25% margin, ≤ 1000, aborts stale requests), price ↔ price per m² toggle, a tap opens the card (several listings at one approximate spot open as a list). Labels in Cyrillic (`name:nonlatin`) or English; the traditional-script glyph range is not loaded (see notes).
    - Home: sale/rent entry points, district shortcuts, newest 3D listings, newest listings. Header links: sale, rent, map. The language switch keeps the query.
    - `/agents/[id]`: agency, name, verified badge, bio, live listings (up to 96). Listing pages link to it and gained a location map (marker if exact, a 200 m circle if approximate).
  - `apps/mobile` (JS only): published listings show how many days they stay in search and a "Байр боломжтой хэвээр байна" button (`confirm_listing_available`); the home list flags listings out of search or within 3 days of leaving it. Account screen: register as an agent (agency name, bio); `agent_profiles` makes the account an agent.
  - Fix after merge (map stuck on "Ачаалж байна…"): MapLibre 6 loads its worker from `maplibre-gl-worker.mjs` next to its module, which does not exist once bundled into a Next.js chunk. `setUpWorker()` (`components/map/map-style.ts`) points it at a copy the bundler emits (`new URL(..., import.meta.url)`). Checked in headless Chrome on dev and production builds: map, pins, pin tap, listing-page map.
  - The remote rate-limit test now tolerates anonymous reveals made from the same network in the last hour (it failed after someone tried the 6a page).
- Tests: 368 unit (room-model 160, mobile 125, web 37, i18n 27, send-sms 12, db 7) + 74 integration tests against the dev project (db 57, mobile 11, web 6).
- Tests before 6b: 344 unit + 66 integration.

## Commands
- `pnpm dev:web`, then open http://localhost:3000/samples
- `pnpm dev:mobile` (Metro for the development build). Runs with `--max-workers 2`: with one worker per CPU thread, Metro crashed out of memory on this PC (exit code -1073740791 = 0xC0000409).
- In `apps/mobile`: `pnpm eas <command>` (EAS CLI 27.7.2 via `pnpm dlx`), `pnpm doctor`
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm format`
- `pnpm --filter @bairmair/room-model samples` regenerates the sample JSON
- `pnpm test:remote`: integration tests on the dev project (needs `packages/db/.env` and `apps/web/.env.local`; mobile's reads `packages/db/.env`; creates and deletes test users)
- Env files (gitignored, copy from each `.env.example`): `packages/db/.env`, `apps/web/.env.local`, `apps/mobile/.env` (`EXPO_PUBLIC_API_URL` = your PC's Wi-Fi IP, port 3000; restart Metro after changes)
- `pnpm run doctor` in `apps/mobile` (plain `pnpm doctor` runs pnpm's own check)
- Route types for the mobile app (`.expo/types/router.d.ts`) are regenerated only by starting Metro; start it once after adding a screen, before `pnpm typecheck`.
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
- Map (your choice, step 6): **MapLibre** on web (`maplibre-gl`) and mobile (`@maplibre/maplibre-react-native`), tiles from **OpenFreeMap** (free, commercial use, no key). OSM `name` in Mongolia also carries traditional script, so the style must label from `name:mn` / strip it; before launch, consider our own Mongolia PMTiles with `name:mn`. OSM has district boundaries in Ulaanbaatar but no khoroo boundaries: khoroo stays a seller-filled field.
- Freshness: a published listing is "fresh" for 14 days after publish or the last `confirm_listing_available()`. Unfresh listings stay reachable by link (with a notice) but are hidden from search.
- Price per m² always uses the official area; the district median is shown only with ≥ 3 listings.
- Web listing pages stream: a missing listing renders the not-found page with HTTP 200 + `noindex` (Next 16 Cache Components behaviour). A real 404 would need a DB lookup in the proxy.
- Web images use `next/image` with `unoptimized` (no `sharp`: `allowBuilds: sharp: false`). Photos are 2048 px JPEGs; thumbnails need an optimizer once hosting is chosen.
- Step 6b choices (mine, for your review):
  - One RPC for list, map and agent pages; the map selects only the pin columns. Search results are cached for 1 minute per filter set.
  - "Recommended" = 3D listings first, then newest (the brief's "better placement"). Simple and predictable; a softer boost is possible later.
  - A price filter keeps only listings in the chosen currency (no exchange rate). Price inputs are in millions of ₮ (`priceMax=300` = 300 сая ₮) or in dollars for rents.
  - Search, district medians and agent pages share the freshness rule; unconfirmed listings stay reachable by link with a notice.
  - Agent pages need no admin step: an agency name makes the account an agent. "Verified" stays an admin flag in the dashboard.
  - "Still available" is an online action, not a queued sync operation.
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
- Step 5 choices (yours): scan processing in a Next.js route handler; photos resized on the phone (`expo-image-manipulator`, build 2); Google through browser OAuth for now (no rebuild, no Google Cloud iOS client); location in 5b from GPS + district fields, the map pin picker in step 6.
- The floor-plan PNG for Open Graph is not made during processing; step 6 renders it in Next.js on request. `floor_plan_path` stays empty until then.
- Mobile auth follows Supabase's Expo guide: implicit flow, `setSession` from the redirect fragment, `react-native-url-polyfill`. Apple sign-in passes no nonce (as in the guide).
- Mobile config comes from `EXPO_PUBLIC_*` variables inlined by Metro. Development builds need no EAS env setup; release builds will (step 7 or before launch).
- Listings are local-first: every edit is saved on the phone at once and synced after 1.5 s. The listing id is a client UUID, so photo paths exist before the row does. A draft reaches the server once it has a valid title. Last write wins between phones (no conflict detection in the MVP).
- Sync runs while the app is open (start, after edits, back in the foreground, sign-in, backoff timer). Every operation is idempotent (duplicate insert = success, uploads upsert), so an interrupted one is repeated. A temporary error retries with backoff; a refusal (constraint, RLS) waits until the seller edits.
- `listing_private` is written as update-then-insert: a PostgREST upsert would also update `listing_id`, which has no update grant.
- Deleting a listing removes its photos and raw scan files from Storage first, then the row. `scan-models` files stay (server-written; clean up server-side later).
- Mobile `tsconfig.json` has `"types": []`; `test-remote/` has its own tsconfig with Node types.
- Step 5c choices (mine, for your review):
  - "Scanned on-site" = current ready scan within 150 m of the exact listing location, GPS accuracy ≤ 100 m (`SCAN_ON_SITE`). The fix comes from the seller's phone: a trust signal, not proof.
  - One scan per listing. A rescan replaces it; the old scan (row + raw files) is deleted only after the new one is processed, so a live listing keeps its 3D view meanwhile. Photo rooms are cleared on a rescan (room ids belong to one scan).
  - Status changes go through the sync queue like other edits; the database stays the judge. The Publish button needs a verified phone and a complete checklist (a scan still processing counts for the area).
  - Room names are stored as typed; `applyAnnotations` trims them.
  - The raw scan files move from `Documents/scans/` into the listing folder; scans the converter cannot read stay in the RoomPlan test list for sharing.

## Notes for later steps
- Wall height: RoomPlan measures walls behind tall furniture lower (2.39 m vs 2.82 m in the same room). Option: raise walls of a room that are almost as tall as its tallest wall to that height. Not done yet; needs your call.
- supabase-js sends a Blob's own `type` and ignores `contentType`.
- The location permission prompt text changed in `app.json` (it now also mentions the listing pin); it shows up with the next build, together with the new icon.
- A refused status change (rare: the Publish button checks the same rules) holds back the listing's later sync operations until "Дахин оролдох" or "Өөрчлөлтийг болих".
- Map labels: OpenFreeMap tiles have no `name:mn`. A few OSM names carry the traditional script after the Cyrillic ("Улаанбаатар ᠤᠯᠠᠭᠠᠨ…"); the web maps load Basic Latin in place of that glyph range (`skipTraditionalScript`), so those characters are skipped. Our own Mongolia tiles with `name:mn` would remove the workaround. The mobile map (6c) needs the same treatment.
- No reminder reaches a seller whose listing is about to leave search (no push yet); the app shows it on the home list and in the editor.
- Step 6 serves the model with `applyAnnotations(model, { roomLabels, photos })` from `room_scans.room_labels` and `listing_photos.room_id`; replaced scans' `scan-models` files still need a server-side cleanup.
- Google sign-in: needs a Google Cloud OAuth web client (ID + secret) in `[auth.external.google]`; the button appears by itself once the provider is on. storage-js `exists()` returns `data: false` *with* an error for a missing object.
- Before an App Store build: real app icon and splash. The current icon (mobile icon, Android adaptive foreground, splash, web favicon/icon/apple-icon) is a placeholder character image that cannot ship (third-party copyright; App Review rejects it). Regenerate all sizes from one 1024 px source when the real logo exists.
- Before production: separate project, remove the test OTP number, turn off the email provider (kept on in dev for the tests).

## To review
- Mongolian UI copy (`packages/i18n/src/messages/mn.ts`), e.g. "Төлөвлөлт" for floor plan.
- OTP SMS text: "Bairmair код: 123456. Хэнд ч бүү хэлээрэй." (`supabase/functions/send-sms/handler.ts`).
- Scanner copy (`scanSupport`, `scan`, `scanResult` in `mn.ts`) and the iOS permission prompts (`apps/mobile/app.json`).
- Sample name "Бодит скан: Г хэлбэрийн өрөө" and the updated `samples.intro`.
- Sign-in and account copy (`auth`, `account` in `mn.ts`).
- Listing form copy (`listings`, `listingForm` in `mn.ts`), e.g. "Цутгамал" for monolithic, "Байршлын цэг" for the map pin, "Тоот" for the apartment number.
- 5c copy (`listingScan`, `roomReview`, `photoRooms`, `listingStatus` in `mn.ts`), e.g. "Зарыг нуух" for archive.
- The 150 m / 100 m thresholds for "scanned on-site".
- 6a copy (`listingPage` in `mn.ts`) and the share post format (`packages/i18n/src/listing-post.ts`), e.g. "Зарна: 2 өрөө байр, Хан-Уул дүүрэг".
- 6b copy (`search`, `map`, `listingCard`, `agentPage`, `home`, `account.agent`, `listingStatus.freshness` in `mn.ts`), e.g. "Зарагдах байр" / "Түрээсийн байр", "Санал болгох", "Байр боломжтой хэвээр байна".

## Next
- You: try 6b in a browser: `pnpm dev:web`, then http://localhost:3000/ and http://localhost:3000/search?view=map (pins, clusters, the ₮/м² toggle, tapping a pin; Mongolian street labels without traditional script). On the iPhone (build 2, Metro): a published listing's editor shows the days left in search and "Байр боломжтой хэвээр байна"; Account → Агент creates an agent page at `/agents/<your user id>`.
- You, still open from 5c: test 5c on the iPhone (build 2 + `pnpm dev:web` on the same Wi-Fi).
- You, when convenient: one scan of two neighbouring rooms in a single session (tap "Дараагийн өрөө" between them). Answers whether shared walls are duplicated or merged. No code waits on it.
- Then 6c: mobile browse/search/map, favorites, report listing (**EAS build 3** for `@maplibre/maplibre-react-native`).

## Open decisions
- SMS gateway: which one, its API doc (endpoint, auth, sender ID), and whether it needs IP allowlisting (Edge Functions have no fixed IP). Only `send-sms/gateways.ts` changes.
- Google sign-in credentials (Google Cloud OAuth web client), whenever you want Google on.
- Web hosting. Until then the phone reaches the scan-processing API on your PC (`pnpm dev:web`, same Wi-Fi).
