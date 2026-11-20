# bairmair scan — progress

Plan: `docs/scan/PLAN.md`. Marketplace progress stays in `docs/PROGRESS.md`.

## Current state (2026-11-20)
Steps 1 (app shell) and 2 (backend) are done. Development build 1 is installed on your iPhone
(checks below not reported yet). Next: step 3 (the app signs in, uploads scans and shows their
links), which needs your answer on non-LiDAR iPhones.

## Done
- Step 1, app shell:
  - `apps/scan` (`@bairmair/scan`): Expo SDK 58, Expo Router, iOS only (`platforms: ["ios"]`),
    bundle id `mn.bairmair.scan`, scheme `bairmairscan`, iOS 17.0 minimum
    (`expo-build-properties`), `runtimeVersion` `"1.0.0"`, version `0.1.0`. EAS project
    `@adulguun0418/bairmair-scan` (id `8317c6a8-…`), updates on, channels `development` and
    `preview` (`eas.json` as `apps/mobile`'s).
  - Screens: "Миний сканууд" (blueprint invitation, or "this iPhone cannot scan" with the reason;
    scans saved on the phone), the scanner, the scan report (plan, rooms with areas, warnings,
    share raw JSON / USDZ / RoomModel, delete), "Туршилт" (wrench in the header: phone, scan
    support, StoreKit connection, version and update).
  - Native modules in build 1 (so later steps stay JS-only): dev-client, roomplan 1.3.2, device,
    file-system, webview, sharing, web-browser, apple-authentication, secure-store, AsyncStorage,
    localization, crypto, keep-awake, updates, image, image-picker, image-manipulator, location,
    build-properties, **expo-iap 6.5.1**. Location and photos are not used yet: they are for
    "scanned on-site" and photos when a scan becomes a listing (step 6); their permission prompts
    only appear when used.
  - Same package versions as `apps/mobile` (what runs on your iPhone today). `expo-doctor` 19/20:
    Expo has newer patch releases since; both apps move to them together at `apps/mobile`'s next
    build.
  - Shared code, moved out of `apps/mobile` (no copies):
    - `@bairmair/scanner`: LiDAR/iOS support check, scan state machine and error classes, scan
      ids, conversion of an export (`analyzeExport`), support messages, with their tests (20).
      `@bairmair/scanner/native`: the scan screen (`ScanSession`), its intro and error page, the
      on-phone storage (`Documents/scans/<id>/`), and `ScanReport` (new; `apps/mobile`'s RoomPlan
      test report now uses it too).
    - `@bairmair/native-ui`: theme tokens, Onest `Text`, `Icon`, `Button`, blueprint grid and
      panel, floor plan WebView, the language provider (`I18nProvider`, `useI18n`).
  - Copy: `scanApp` in `mn.ts` / `en.ts`; the scanner keeps the existing `scan`, `scanSupport`,
    `scanResult` copy.
  - Verified: typecheck, lint, tests (scanner 20, mobile 98, i18n 29), prettier; `expo export`
    for iOS of both apps; the scan app's source map has one copy of every package (React Native,
    React, expo-modules-core, roomplan, …) and the iOS scan screen; `expo config --type
    introspect`: deployment target 17.0, Mongolian permission prompts, Sign in with Apple
    entitlement, updates URL and runtime 1.0.0. Not verified: anything on the iPhone.
- Step 2, backend (website + dev Supabase project; nothing in the app yet):
  - Migration 21 (`20261125100000_user_scans.sql`, pushed): `user_scans` (id from the app,
    `owner_id` defaults to the caller, `title`, `share_slug`, `link_enabled`, server-written
    `status`/`metrics`/versions/`processing_error`, owner-written `room_labels`/`room_dividers`/
    `entrance_door_id`, device info, `listing_id` for step 6). Owner-only RLS; column grants keep
    server fields away from clients. The insert trigger (security definer) sets a random
    12-character slug (from `gen_random_uuid`, ~71 bits) and enforces `private.scan_limit()`
    (returns 2 for now; step 4 adds subscriptions): `scan_limit_reached`; a per-user advisory lock
    stops parallel inserts slipping past; a repeated insert of the same id stays a duplicate
    (23505, which the app treats as success). Scans with `listing_id` do not count.
    Migration 22 (`20261125100100_user_scans_slug_default.sql`): `share_slug` default `''`
    (always replaced by the trigger), so the generated types do not require it on insert.
  - Storage: private `user-scan-raw` (`{owner}/{scan}/capture.json|usdz`; uploads need the
    scan row; delete needs only the own folder, so files can go after the row) and private
    `user-scan-models` (server writes; owner reads and deletes their own).
  - `POST /api/user-scans/{id}/process`: the listing route's logic, now generic. `processScan`
    takes the raw and model paths from the store (`supabaseScanStore` for listings,
    `supabaseUserScanStore` for scans; both rebuild paths from ids); both routes share
    `server/process-route.ts`.
  - The private link `/s/<slug>` (and `/en/s/<slug>`): title (or the area), scan date, 3D +
    plan + rooms (the samples' `ListingScene`), "only people with the link…", "made with
    bairmair scan". `noindex, nofollow`; no owner data. Not available (unknown slug, link off,
    not processed): a message, still 200 + noindex. `/embed/s/<slug>` for the app's WebView
    (`ListingEmbed`, whose `listingId` prop is now `id`; messages carry the slug). Preview
    image `/api/og/s/<slug>` (plan + title + area + date; the OG helpers moved to
    `lib/og-image.tsx`). Data via `getSharedScan` (secret key, cached 1 minute: turning the
    link off or deleting takes up to a minute).
  - `@bairmair/db`: buckets `userScanRaw`/`userScanModels`, `userScanRawPaths`,
    `userScanModelPath`, `processUserScanPath`, `sharedScanPath`, `isShareSlug`, error key
    `scan_limit_reached`. `@bairmair/browse`: `sharedScanEmbedPath`; captcha return per app
    (`?return=scan` → `bairmairscan://captcha`; `?return=app` unchanged for installed bairmair
    builds; `parseCaptchaReturn(url, base)`).
  - Auth (pushed): Apple client ids `mn.bairmair.app,mn.bairmair.scan`; redirect
    `bairmairscan://**`.
  - Account deletion also removes the user's `user-scan-raw` and `user-scan-models` folders
    (rows cascade).
  - Copy: `sharedScan` in `mn.ts` / `en.ts`.
  - Verified: typecheck, lint, prettier, unit tests (web 86 incl. the loader and generic
    processing, browse 145, db 8); integration tests on the dev project: db 11 new (insert, slug,
    server columns refused, limit + duplicate, listing scans not counted, owner-only reads and
    writes, shape check, every storage rule), web 6 new (401/409/200/404/422 on the route, the link
    with room names, link off), and the whole suite (db 81, web 23, mobile 12); production build +
    a real processed scan (the 58 m² apartment) through the local server: `/s` mn and en, embed,
    unknown and malformed slugs, preview images (200 PNG; 404 wordmark), screenshots of the page,
    the image and the phone embed. Demo data deleted.
  - Noticed, not fixed: at 390 px the embed's "Анхны харагдац" button runs past the right edge
    (shared viewer, so bairmair's listing embed too).

## Decisions
- `expo-iap` for Apple In-App Purchase, our own server verification (see the plan).
- Shared React Native code lives in packages with native modules as peer dependencies (see the
  plan's monorepo rules), instead of copying `apps/mobile`'s files.
- App icon and splash: bairmair's for now; a scan-specific icon before the store.

## Commands
- `pnpm dev:scan` (Metro for the scan app's development build). Metro for `apps/mobile` and for
  `apps/scan` both use port 8081: run one at a time.
- In `apps/scan`: `pnpm eas <command>`, `pnpm run doctor`, `pnpm update:preview -m "..."` (once a
  preview build exists).

## Next
- You, if not done yet, the build 1 checks (you installed it on 2026-11-20). In `apps/scan`:
  1. `pnpm eas build --profile development --platform ios`. It is the first build for
     `mn.bairmair.scan`: sign in to Apple when asked, let EAS create the bundle id (with Sign in
     with Apple) and the ad hoc profile, and pick your registered iPhone.
  2. Install it from the link / QR code EAS shows.
  3. From the repo root: `pnpm dev:scan` (stop `pnpm dev:mobile` first), open "bairmair scan" on
     the iPhone and connect to the PC.
  4. Check:
     - "Миний сканууд" shows the blueprint card "Байраа 3D-ээр скан хийгээрэй" with "Шинэ скан".
     - Wrench → "Туршилт": your iPhone model, the green "Энэ төхөөрөмжөөр 3D скан хийж болно.",
       "App Store-ын төлбөр: Холбогдлоо" (StoreKit answers; no products are set up yet), and
       "Хувилбар 0.1.0 · суулгасан хувилбар".
     - "Шинэ скан": the camera prompt in Mongolian, the blueprint intro, scan a room or two,
       "Дуусгах": the report shows the plan, rooms and total area; sharing the raw JSON works.
     - Back on "Миний сканууд" the scan is listed; deleting it from its report removes it.
  5. If the build fails, send me the EAS build log link (most likely spot: the OpenIAP Swift
     package `expo-iap` fetches during `pod install`).
- Optional, `apps/mobile` (its scanner and UI code moved into packages; JS only, no OTA published):
  with `pnpm dev:mobile`, open Бүртгэл → RoomPlan туршилт, scan once, and open a listing's
  "3D скан". Everything should look as before.
- Step 3 (JS only): sign-in, upload with retry, processing, the link (share, copy, on/off),
  "1 / 2 үнэгүй" and the limit message. Needs: what non-LiDAR iPhones see (plan question 6).
- Open questions in the plan (price, what Pro gives, what happens when it ends, "2 free" meaning,
  non-LiDAR phones, store name) are needed by step 4, except non-LiDAR phones (step 3).
