# bairmair scan — build plan (draft for review, 2026-11-20)

A second iOS app in this monorepo (`apps/scan`): sign in, LiDAR-scan an apartment, get a private
web link with the 3D model and floor plan on our host (`bairmair.vercel.app` for now). 2 scans
are free; more need a subscription, bought with Apple In-App Purchase in the app or with QPay on
the website. A scan can later become a bairmair listing.

Progress for this app goes to `docs/scan/PROGRESS.md` (created in step 1), not to
`docs/PROGRESS.md`.

## Decisions (yours, 2026-11-20)
- Payment: **both** Apple IAP (in the app) and QPay (on the website), one shared entitlement.
- Paywall: **2 free scans, then a subscription.**
- Accounts: **the bairmair account** (phone + SMS code, Sign in with Apple), same Supabase users.
- Web page: **private unlisted link** per scan, not indexed, no seller info; **can be turned into
  a listing** later.
- Code: **in this monorepo as `apps/scan`** (`@bairmair/scan`), using the shared packages
  directly.

## Rules for this app
- Inside the app, never mention or link to QPay or the website price (App Store rule 3.1.3).
- Say whenever a step needs a new EAS build of the scan app.
- I test on a physical iPhone Pro: say exactly what to run and what to check.

## Why both payment routes (App Store rules)
- 3.1.1: unlocking features (more scans) inside an iOS app must use In-App Purchase. A QPay
  paywall inside the app would be rejected. No exception exists for the Mongolia storefront
  (only the US, and the EU from 2026-10-01).
- 3.1.3(b) "Multiplatform Services": an app may unlock what was bought on our website,
  **provided the same items are also sold as IAP in the app**. That is exactly "both".
- Inside the app: no mention of QPay, the website price, or a link to pay there (outside the
  US that is a forbidden call to action). The app only shows the IAP paywall and "Pro until …"
  for a subscription bought anywhere.
- An auto-renewing subscription screen must show price, period, renewal terms, Terms (EULA) and
  Privacy links, and "Restore purchases" (3.1.2). Account deletion in the app is required (we
  have `DELETE /api/account`).

## Architecture
One repo, one backend:

| Where | What |
|---|---|
| `apps/scan` | The iOS app (Expo SDK 58, Expo Router, EAS), package `@bairmair/scan`. |
| `apps/web` | The `/s/[slug]` page and embed, `/scan-pro` (QPay), processing and Apple IAP routes. |
| `supabase/` | Tables, Storage, RLS, the scan limit. Same project as the marketplace. |
| `packages/*` | `room-model` (on-phone review), `i18n`, `db`, `browse` (phone, auth errors, captcha, payments), used as they are. |

**Monorepo rules (all apps):**
- Every Expo app stays on the same Expo SDK (one lockfile, one React Native). SDK upgrades
  move all apps together.
- Native modules are installed by the apps. Shared React Native packages (`@bairmair/native-ui`,
  `@bairmair/scanner/native`) list them as peer dependencies (plus the same versions as dev
  dependencies for their own typecheck). Expo's "autolinking module resolution", on by default
  in a monorepo, resolves every import of a native module or React Native to the app's own copy
  (checked in the scan app's bundle: one copy of each package).
- Each app has its own EAS project, `app.json`, `runtimeVersion` and channels; `eas build` and
  `eas update` run from the app's folder.
- Vercel: check that the web project skips deployments when neither `apps/web` nor the packages
  it uses changed, so scan-only commits do not redeploy the website.
- Root scripts: add `dev:scan`, and `@bairmair/scan` to the `lint` filter list.

**App identity.** Bundle id `mn.bairmair.scan`, scheme `bairmairscan`, its own EAS project,
`runtimeVersion` `"1.0.0"` (fixed string, as in `apps/mobile`), channels `development` /
`preview` / `production`. iOS only, iPhone only, deployment target 17.0 (RoomPlan needs 17).

**Data (draft, new migration):**
- `user_scans`: `id` (client UUID), `owner_id`, `title` (≤ 80), `share_slug` (random ~10
  characters, unique; the link uses it, never the UUID), `link_enabled`, `status`
  (`scan_status`: uploaded | processing | ready | failed), raw JSON / USDZ / model paths,
  `metrics`, `room_labels`, `room_dividers`, `entrance_door_id`, `processing_error`, device /
  iOS / app version, `listing_id` (set once published), timestamps. RLS: the owner reads and
  writes their own rows; nobody else reads the table; the web page loads by slug on the server.
- Storage: new private buckets `user-scan-raw` and `user-scan-models` under
  `<owner_id>/<scan_id>/`. Models are private (unlisted ≠ public): the page gets the model
  through the server.
- `scan_subscriptions`: `user_id`, `source` (apple | qpay), `product_id`, `starts_at`,
  `expires_at`, `status` (active | expired | refunded | revoked), Apple
  `original_transaction_id` (unique) + environment, or `payment_id` (QPay). Written by the
  server only.
- `private.scan_limit(user)`: 2 without an active subscription, else a fair-use cap (proposed
  100). An insert trigger on `user_scans` refuses past the limit with `scan_limit_reached`.
  The database is the judge, so a reinstall or a forged request changes nothing.
- Account deletion (`server/delete-account.ts`) also removes the user's scan files.

**Processing.** `processScan` already takes an injected store; add a `user_scans` store and
`POST /api/user-scans/{id}/process` (Bearer token), same rules as listings (409 / 422 / ready).

**Web.**
- `/s/[slug]` (and `/en/s/[slug]`): 3D model, floor plan, rooms with areas ("approximate,
  scanned"), `noindex`, OG image with the plan. No contact or seller info. A disabled link or
  a deleted scan shows "not available".
- `/embed/s/[slug]`: the same for the app's WebView (as `/embed/listings/[id]`).
- `/scan-pro`: subscription with QPay (signed in), plan and expiry on `/account`.

**Payments.**
- QPay (website): products `scan_pro_30d` (and maybe `scan_pro_365d`) in `PAYMENT_PRODUCTS`.
  QPay has no automatic renewal, so it sells a **prepaid period**: fulfilment adds a
  `scan_subscriptions` row starting at the later of now and the current expiry.
- Apple (app): an auto-renewing subscription in App Store Connect. The app passes the user id as
  `appAccountToken`; the server verifies the signed transaction
  (`POST /api/iap/apple/transactions`, Apple's `@apple/app-store-server-library`) and receives
  App Store Server Notifications v2 (`POST /api/iap/apple/notifications`: renewals, expiry,
  grace period, refunds, revocations). IAP library: **`expo-iap` 6.5.1** (StoreKit 2 through
  OpenIAP, an Expo module, `appAccountToken` supported, needs iOS 15+) with our own server
  verification, so one entitlement table holds both sources. RevenueCat was the alternative
  (less server code, but a third copy of the entitlement and another processor).

## Build steps
Each step ends with a summary and a `docs/scan/PROGRESS.md` update. "Build" = a new EAS build
of the scan app.

1. **App shell — EAS development build 1.** Done in code (see `docs/scan/PROGRESS.md`); the
   build itself is yours.
2. **Backend.** Done (see `docs/scan/PROGRESS.md`). Was: migration (`user_scans`, buckets, RLS, limit trigger with a stub entitlement),
   the process route, `/s/[slug]`, the embed, the OG image, captcha return URL per app (it is
   hard-coded to `bairmair://captcha` today), Apple client id `mn.bairmair.scan` added to
   Supabase Auth, account deletion covering scans. Unit + integration tests on the dev project.
3. **App core (JS only).** Sign-in (shared with `apps/mobile` where it can move into a package),
   "Миний сканууд" with "1 / 2 үнэгүй", scanner (whole-apartment flow and error messages from
   `apps/mobile`), review (plan, areas, room names, front door), local draft + background upload
   with retry (create row → raw JSON → USDZ → process), scan screen (embed WebView, share link
   with a Mongolian text, copy, link on/off, rename, delete), account (sign-out, delete, terms,
   privacy). Scanner code used by both apps moves into a shared place rather than being copied.
   You: scan, share the link, open it on another phone and on a computer.
4. **Subscriptions on the server + QPay on the website.** `scan_subscriptions`, the real limit,
   QPay products and `/scan-pro`, plan on `/account`; the app shows "Pro until …". Tests incl.
   a real small test payment.
5. **Apple IAP.** App Store Connect: app record, Paid Apps Agreement, bank and tax (NEXUS
   KAIROS), subscription group and product, sandbox tester. Server verification and
   notifications, paywall, restore, "manage subscription". You: buy, renew (sandbox renews in
   minutes), cancel, and restore on the iPhone.
6. **Scan → listing.** "Зар болгох": the server copies the raw files into a new draft listing's
   scan and processes it; then opens the website editor (or the bairmair app). Proposed: a
   published scan stops counting toward the limit.
7. **Release.** Production Supabase project, Vercel Pro (Hobby forbids commercial use) and the
   domain **before the first real sale**; terms and privacy for subscriptions (Apple, QPay,
   refunds); e-barimt for QPay sales; App Store privacy labels, screenshots, review notes (demo
   account, a video of a scan since reviewers may not have a LiDAR iPhone, the 3.1.3(b)
   explanation); TestFlight, then submission.

## Open questions for you
1. **Price and period**: monthly only, or monthly + yearly? Price in ₮ for QPay; Apple uses its
   own price points (I check what the Mongolia storefront charges in).
2. **What Pro gives**: unlimited scans (with a fair-use cap such as 100), or a fixed number?
3. **When Pro ends**: proposed: links of existing scans keep working; no new scan until the user
   is back under 2 (by deleting) or renews. Alternative: links of scans beyond 2 stop working.
4. **"2 free"**: 2 scans saved at once (delete one to scan again; proposed) or 2 ever?
5. **Review scope in the app**: room names and front door (proposed for the MVP); room dividers
   and photos later?
6. **Phones without LiDAR** can install from the App Store (Apple has no LiDAR-only switch):
   show "this iPhone cannot scan" and let them view their scans (proposed), or block?
7. **App Store name**: "bairmair scan" in English, Mongolian subtitle?

## Risks
- App Review: a reviewer may still question the website purchase; the review notes must say the
  same subscription is sold as IAP in the app (3.1.3(b)) and the app never points to the website.
- expo-roomplan 1.3.2 drops the whole capture past ~9 × 9 m (`exceedSceneSizeLimit`); bigger
  apartments need the native patch noted in `docs/PROGRESS.md`.
- Apple payouts to a Mongolian company (bank, tax forms) take time: start step 5's paperwork early.
- Two sources of entitlement (Apple, QPay): a refund at one must not cancel time bought at the
  other (rows per source; the limit looks at any active row).
