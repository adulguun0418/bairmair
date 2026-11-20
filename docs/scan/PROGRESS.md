# bairmair scan — progress

Plan: `docs/scan/PLAN.md`. Marketplace progress stays in `docs/PROGRESS.md`.

## Current state (2026-11-20)
Steps 1–4 are done: the app signs in, uploads scans, shows each scan's link and the user's plan;
Pro is sold with QPay on the website (`/scan-pro`, testers only until the release step).
Development build 1 is on your iPhone; steps 3 and 4 are JS only (`pnpm dev:scan`). Your part of
step 4: one real 100₮ test payment (below). Next: step 5 (Apple In-App Purchase).

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
- Step 3, the app uses the backend (JS only, no new build):
  - Shared sign-in, moved out of `apps/mobile` into `@bairmair/native-auth` (no copies):
    `AuthProvider` takes the app's config (client, URLs, captcha return `app` | `scan`, error
    reporter), phone / Apple / Google actions (client as a parameter), captcha when Supabase asks
    (system browser sheet on iOS, inline on Android), `SignInForm` and `VerifyForm` (navigation
    through callbacks), `openSitePage`. `apps/mobile`'s sign-in and code screens are now thin
    routes around them; behaviour unchanged. `TextField` and the 3D embed WebView (`ModelEmbed`,
    used by bairmair's listing 3D screen and the scan app) moved to `@bairmair/native-ui`.
  - Uploads (`apps/scan/src/uploads/`): one record per scan next to its files on the phone
    (`upload.json`, a scanner "sidecar"); steps row → raw JSON → USDZ → process → done, one at a
    time, every step repeatable; backoff 5 s → 5 min; `limit` (over the free limit) and
    `failed` (unreadable export, or row/files missing 3 rounds in a row) wait for "Дахин
    оролдох". Runs while the app is open: launch, foreground, sign-in, after "Холбоос үүсгэх".
    Files go up with `File.upload` (background URL session), like bairmair's photos.
  - Screens:
    - "Миний сканууд": no LiDAR → "Энэ iPhone скан хийх боломжгүй" + reason + "bairmair вэбсайт
      руу орох" (your call); signed out → sign in; signed in → "Шинэ скан" (or the limit notice
      when 2 are kept), "Үнэгүй скан: n / 2", the list: unsent scans, uploads with their status
      and retry, server scans with area / "Холбоос хаалттай". Pull to refresh.
    - After a scan: "Скан шалгах" (plan, rooms, total area from the same converter, optional
      name, "Холбоос үүсгэх" or delete; the raw files stay reachable for reporting).
    - A scan: plan and rooms (the server's model with the owner's labels), the link with
      "Холбоос хуваалцах" (iOS share sheet: text + link) and an on/off switch, "3D-ээр үзэх"
      (`/embed/s/<slug>` full screen; hidden while the link is off), rename (header), delete
      (files, then the row, then the phone's copy).
    - "Бүртгэл" (person icon): who is signed in, "this is your bairmair account", terms,
      privacy, Туршилт, sign out, delete account (`DELETE /api/account`, then this user's scans
      leave the phone), version.
  - `@bairmair/db`: `USER_SCAN_FREE_LIMIT` (2, mirrors `private.scan_limit()`). Copy: `scanApp`
    grew (status, review, detail, website, limit); the step-1 "test version" note is gone.
  - `apps/scan/.env` (gitignored): the dev project's public keys, `EXPO_PUBLIC_API_URL` =
    `https://bairmair.vercel.app`.
  - Verified: typecheck, lint, prettier, unit tests (scan 16: model, engine, remote answers;
    native-auth 3; mobile 95), integration tests on the dev project (scan 3: a scan to a ready
    row with a slug, the third stopped at the limit and sent after a delete, a repeated insert
    makes no second row; processing runs this branch's `processScan`), `expo export` for iOS of
    both apps (scan bundle: one copy of every package). Not verified: anything on the iPhone.
  - Fix after the first iPhone test: opening a saved scan always said "Сканыг ачаалж чадсангүй".
    The plan model was read with `storage.download()` + `Blob.text()`, and React Native's Blob has
    no `text()`. Now `loadScanModel` (`src/scans/scan-model.ts`) reads it through a 60-second
    signed URL and `fetch`, and never throws (the screen works without its plan). Integration test:
    the owner gets the model, another user gets nothing.

- Step 4, subscriptions on the server + QPay on the website (your answers, 2026-11-20: monthly
  19,900₮ and yearly 199,000₮; unlimited with a fair-use cap of 100 scans kept; links keep
  working after Pro ends):
  - Migration 23 (`20261126100000_scan_subscriptions.sql`, pushed with your OK):
    `scan_subscriptions` (one row per purchase: `source` qpay | apple, product, `starts_at`,
    `expires_at`, `status` active | refunded | revoked, the QPay `payment_id` or Apple's
    `original_transaction_id` + environment). Users read their own rows; only the server writes.
    `private.scan_pro_until(user)` (end of Pro, or null), `private.scan_limit` now 2 free / 100 Pro
    (the insert trigger already used it). `scan_plan()` (signed in): limit, scans kept, Pro end.
    `add_scan_pro_period(user, payment, product, days)` (service role only): starts now, or when
    the current Pro ends; the same payment twice returns the first row (no double time); a
    per-user lock keeps two payments from starting at the same moment. Expiry is a time, not a
    status: a row counts only between its start and end.
  - Products (`PAYMENT_PRODUCTS` + `SCAN_PRO_PLANS` in `@bairmair/db`): `scan_pro_30d` 19,900₮ /
    30 days, `scan_pro_365d` 199,000₮ / 365 days, `scan_pro_test` 100₮ / 1 day (your real-money
    check). All **testers only** (`PAYMENT_TESTERS`) until the release step: terms, privacy and
    hosting are not ready for sales. `USER_SCAN_PRO_LIMIT` = 100.
  - Server: `server/scan-pro.ts` (`scanProFulfilments`): a paid scan Pro payment adds its period
    through the existing payment delivery (`fulfil`, retried on the next read if it failed); a
    payment whose account was deleted adds nothing.
  - Website: `/scan-pro` (and `/en/...`, `noindex` for now; signed out → sign-in): the plan
    ("Үнэгүй: 1 / 2 скан" or "Pro: … хүртэл"), what Pro gives (with the fair-use line), monthly and
    yearly cards ("2 сар үнэгүй"), "Төлөх" / "Сунгах" → the existing `QPayCheckout` → "Pro
    идэвхжлээ: … хүртэл". `?test=1` adds the 100₮ test card. A non-tester gets "Pro удахгүй
    нээгдэнэ…". `/account` has a "bairmair scan" card (plan + "Pro болох" / "Pro сунгах"), shown only
    to accounts with a scan or Pro.
  - App (JS only): home reads `scan_plan` with the scan list: "Pro · … хүртэл" instead of the free
    count, the Pro limit message at 100; becoming Pro resends uploads the server had refused over
    the free limit. Бүртгэл shows "Багц: Үнэгүй · n / 2 скан" or "Pro · … хүртэл". No word about
    where Pro is sold (App Store rule 3.1.3).
  - `@bairmair/browse` `scan-plan.ts`: `fetchScanPlan`, `scanFits`, `formatProUntil` (the end
    day in the device's time zone). Copy: `scanPro`, `account.scanPlan`, `scanApp.pro*`/`plan*`.
  - Verified: typecheck, lint, unit tests (web 90: fulfilments; browse 148: plan), integration
    tests on the dev project (db 11 new: rights, stacking, repeat delivery, limit 100 while Pro
    and back to 2 with the scans kept, expired and future periods; web 2 new: a paid monthly then
    yearly payment delivered through `GET /api/payments/{id}` with the real store; whole suite db
    92, web 25, mobile 12, scan 4), production build + headless Chrome with a throwaway user:
    `/scan-pro` free (desktop), "Төлөх" as a non-tester → "Pro удахгүй нээгдэнэ…", Pro after a
    delivered period (desktop, 390 px without sideways scroll, English with `?test=1`), the
    account card; test data deleted. `expo export` for iOS of the scan app. Not verified: a real
    QPay payment for a Pro product (yours), the app screens on the iPhone.

## Decisions
- `expo-iap` for Apple In-App Purchase, our own server verification (see the plan).
- Shared React Native code lives in packages with native modules as peer dependencies (see the
  plan's monorepo rules), instead of copying `apps/mobile`'s files.
- App icon and splash: bairmair's for now; a scan-specific icon before the store.
- iPhones without LiDAR are sent to the website (your call, 2026-11-20).
- Scanning needs sign-in first (the scan is uploaded to the account; the limit is the account's).
- "2 free" is counted as scans kept (delete one to scan again), the plan's proposal; the
  database enforces it. Step 4 adds the subscription.
- Pro bought with QPay is a prepaid period (QPay cannot renew); periods stack. One table holds
  both sources, so a refund at one never cancels time bought at the other.
- Pro products stay testers only until the release step (production project, Vercel Pro, terms).
- Room names and the front door are not editable in the scan app yet (the server and the link
  pages already apply them); a later step, together with the paywall screens.

## Commands
- `pnpm dev:scan` (Metro for the scan app's development build). Metro for `apps/mobile` and for
  `apps/scan` both use port 8081: run one at a time.
- In `apps/scan`: `pnpm eas <command>`, `pnpm run doctor`, `pnpm update:preview -m "..."` (once a
  preview build exists).

## Next
- You, step 3 on the iPhone (development build 1, no new build): stop `pnpm dev:mobile` if it
  runs, then `pnpm dev:scan` from the repo root and open bairmair scan.
  1. Signed out, the home screen asks you to sign in. Sign in with your phone (code by SMS) or
     Apple. The person icon → Бүртгэл shows your number and "Энэ бол bairmair-ийн бүртгэл…".
  2. "Шинэ скан" → scan → "Дуусгах" → "Скан шалгах" shows plan, rooms, total; type a name →
     "Холбоос үүсгэх". Home shows it uploading, then processing, then with its area.
  3. Tap it: the plan, the link, "Холбоос хуваалцах" (share to Messenger or Notes and open the
     link on a computer: the 3D page), "3D-ээр үзэх", the switch off (the link then says not
     available within a minute) and on, rename, pull to refresh.
  4. Make a second scan: "Үнэгүй скан: 2 / 2" and the limit notice instead of "Шинэ скан".
     Delete one: "Шинэ скан" is back.
  5. Airplane mode during an upload: the row says it waits for the network; turn it off and
     the upload finishes by itself (or tap "Дахин оролдох").
  6. Optional, bairmair app (`pnpm dev:mobile`): sign in / out and the add-phone flow still
     work (they now come from the shared package); a listing's "3D-ээр үзэх" still opens.
- Before the next bairmair OTA update: it would carry this refactor of its sign-in; publish only
  after check 6.
- You, step 4 (website after Vercel deploys `main`; app with `pnpm dev:scan`, no new build):
  1. https://bairmair.vercel.app/scan-pro?test=1 signed in with your tester account: "Таны багц"
     shows your free count. Pay the 100₮ "Туршилт" card → the page says "Pro идэвхжлээ: <tomorrow>
     хүртэл". `/account` shows the bairmair scan card with the same date.
  2. In bairmair scan (pull down on Миний сканууд): "Pro · <date> хүртэл" instead of "Үнэгүй скан",
     and "Шинэ скан" even with 2 scans kept. Бүртгэл shows the plan. Make a third scan: it uploads.
  3. The next day (Pro over): the scans and their links stay; home shows "Үнэгүй скан: 2 / 2" and
     the limit notice until you delete down to one.
  4. Do not buy the 19,900₮ card unless you want 30 days of Pro on the dev project.
- Step 5 (Apple IAP): start the App Store Connect paperwork early (Paid Apps Agreement, bank, tax
  for NEXUS KAIROS). Open: Apple's price points for the Mongolia storefront; App Store name.
- Before release: `testersOnly: false` for `scan_pro_30d`/`scan_pro_365d`, remove
  `scan_pro_test` (and the `?test=1` card), index `/scan-pro`, terms and privacy for
  subscriptions.
