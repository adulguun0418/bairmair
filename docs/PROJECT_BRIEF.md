# [bairmair] — 3D apartment marketplace for Mongolia

I'm a software developer with a backend and systems-integration background. Help me build a real estate marketplace where sellers scan apartments with an iPhone Pro's LiDAR sensor and buyers explore them in 3D.

## Development environment
- I develop on Windows (WSL2). I have no Mac and can't run Xcode.
- iOS builds are made only with EAS Build in the cloud. I install development builds on a physical iPhone Pro registered with EAS.
- Keep custom native code at zero in the MVP, and tell me whenever a step requires a new EAS development build.

## Product
- Two-sided marketplace for apartment SALE and RENT listings, Ulaanbaatar first.
- Sellers are owners and real estate agents. Agents have a public profile and manage many listings.
- A listing = details + photos + optional 3D scan. A scan produces:
  1. a clean 3D model (walls, doors, windows, furniture as simple shapes),
  2. an auto-generated 2D floor plan with room areas,
  3. user-taken photos shown as hotspots in the room they belong to.
- Buyers browse on iOS, Android, and web. Every listing has a shareable link that opens the 3D view in any browser (listings get shared on Facebook and unegui.mn).
- Scanning works only on LiDAR iPhones. Everyone else can post photo-only listings. Scanned listings get a "3D" badge and better placement in results.

## Localization and local context
- Mongolian Cyrillic is the primary UI language, English secondary. Use i18n from day one, no hardcoded strings.
- Prices default to MNT (₮). Rent listings may also use USD.
- Addresses are often landmark-based. Location = city → district (дүүрэг) → khoroo (хороо) → building/complex name (хотхон) + map pin + free-text directions. The public pin is approximate unless the owner chooses to show the exact location.
- Room count follows the local convention ("2 өрөө" includes the living room).
- Auth: phone number + SMS OTP as the primary method, plus Sign in with Apple and Google. SMS goes through a local Mongolian SMS gateway using Supabase's Send SMS auth hook.
- Contact in MVP: call/SMS buttons to the seller. In-app chat comes later.

## Tech stack
- Monorepo: pnpm workspaces + Turborepo, TypeScript strict everywhere.
- Mobile: React Native with Expo (development builds via EAS Build, Expo Router). One app for iOS and Android.
- Scanning: the `expo-roomplan` package (Apple RoomPlan wrapper, iOS 17+). No custom Swift in the MVP. Before relying on the package, read its source and the exact JSON it exports, pin the version, and list any gaps. Show the scan flow only on LiDAR iPhones with iOS 17+; if the package has no support check, flag it.
- Backend: Supabase — Postgres + PostGIS (map/radius search) + pg_trgm (Cyrillic text search), Auth, Storage, Edge Functions. Row Level Security on every table.
- Web: Next.js (App Router), server-rendered listing pages with Open Graph previews (floor-plan image) so shared links look good on Facebook.
- 3D viewer: one shared package (three.js via react-three-fiber), used by the web app and embedded in the mobile app through a WebView pointing at a `/embed/listings/[id]` route. The 3D experience is built once.

## 3D data approach (important)
Do NOT build a USDZ→glTF conversion pipeline. Instead:
1. After a scan, read RoomPlan's exported JSON and convert it to our own versioned schema, "RoomModel v1", in TypeScript inside the shared schema package, so the conversion is testable without a device. RoomModel v1 contains:
   - walls, doors, windows and openings (transform + dimensions)
   - objects (category + transform + dimensions)
   - floor polygons and room labels
   - photo hotspots (photo id + room id)
2. Define the schema once in the shared package (TypeScript types + zod) and use it in mobile, web and backend.
3. Upload the raw RoomPlan JSON and USDZ alongside the RoomModel JSON. The raw file is the source of truth, so scans can be re-converted when the schema changes.
4. The viewer builds the scene procedurally from RoomModel JSON with consistent styling: walls, floor, door/window cutouts, furniture boxes, tappable photo hotspots placed in their room. The 2D floor plan is rendered as SVG from the same data.
5. Compute per-room and total area from the floor polygons and always label it "approximate (scanned)". Listings also have a separate "official area" field from the property certificate.
6. In the MVP, each photo is assigned to a room by the user. Exact pose-pinned photos come later and need a custom native module, so design the schema so a photo can later carry a camera pose without breaking v1 consumers.

## Scanning flow (iOS)
- Use expo-roomplan's multi-room flow: scan room by room, then export.
- After export: show the converted model and floor plan for review, let the user confirm room labels, then a photo step where each photo is assigned to a room.
- Save drafts locally. Upload in the background with retry, since mobile connections can be slow.
- RoomPlan does not run in the simulator. I test scanning on a physical iPhone Pro.

## Initial data model
- `profiles`: role (owner | agent | admin), display name, phone, avatar
- `agent_profiles`: agency name, bio, verified flag
- `listings`:
  - owner, type (sale | rent), status (draft | published | sold_or_rented | archived), title, description
  - price, currency, negotiable flag
  - area_official_m2, area_scanned_m2, rooms, floor, total_floors, building_year, building_material (panel | brick | monolithic | other), new_building flag, heating, balconies, parking/garage, furnished
  - sale-only: mortgage_eligible (ипотек)
  - rent-only: deposit, min_term_months, utilities_included
  - location fields + PostGIS point, has_3d
- `listing_photos`: listing, storage path, sort order, optional room id (from the scan), nullable camera pose reserved for later
- `room_scans`: listing, schema_version, raw RoomPlan JSON path, USDZ path, RoomModel JSON path, floor-plan image path, computed metrics
- `favorites`, `listing_views` (simple counts), `reports`
- Leave room for, but do not build: boosts, agent subscription plans, payments (QPay later)

## MVP scope
In:
- auth and profiles, including agent profile pages
- create/edit listing (photo-only or with scan) and the scanning flow
- listing detail page with photo gallery, 3D viewer and floor plan
- search with filters (sale/rent, district, price, rooms, area, has_3d) and map view
- favorites, share links, report listing

Out for now: payments, in-app chat, mortgage calculator, a custom admin panel (use the Supabase dashboard), AR "view in your room", pose-pinned photos.

## How to work
- Check expo-roomplan, Expo/EAS and Supabase details against their current docs and source before relying on them. Don't trust memory for version-specific APIs.
- First, propose the repo structure, the RoomModel v1 schema, and the database schema with RLS policies. Wait for my review before implementing.
- Then build in this order:
  1. shared RoomModel schema + a few hand-made sample JSON files
  2. 3D viewer and floor-plan renderer working on web with the samples
  3. Supabase schema, auth and storage
  4. integrate expo-roomplan in a minimal test screen (first EAS development build), then convert a real exported scan to RoomModel JSON and add it to the sample files
  5. listing creation and upload flow
  6. search, map and listing pages
  7. WebView embed in the mobile app
- Write tests for the RoomPlan JSON → RoomModel conversion and the area calculations. Use real exported scans as test fixtures once available.