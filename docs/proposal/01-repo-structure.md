# Proposal 1: repo structure

## Layout

```
bairmair/
├─ apps/
│  ├─ mobile/                 Expo SDK 58 + Expo Router. One app for iOS and Android.
│  └─ web/                    Next.js (App Router). Listing pages, search, /embed/listings/[id].
├─ packages/
│  ├─ room-model/             Pure TypeScript. No React, no DOM, no native APIs.
│  │   ├─ src/schema/         RoomModel v1 (zod + inferred types)
│  │   ├─ src/roomplan/       Tolerant parser for Apple's raw JSON + converter to RoomModel
│  │   ├─ src/geometry/       Polygon area, point-in-polygon, wall/aperture math
│  │   ├─ src/floorplan/      RoomModel -> SVG string (no React)
│  │   ├─ samples/            Hand-made RoomModel JSON; later real exports as fixtures
│  │   └─ test/               Vitest: conversion + area tests
│  ├─ viewer/                 React DOM. <RoomViewer3D> (react-three-fiber) and <FloorPlan>.
│  ├─ db/                     Generated Supabase types + typed client helpers
│  └─ i18n/                   mn (primary) and en catalogs, formatters (₮, m², "2 өрөө")
├─ supabase/
│  ├─ migrations/             Hand-written SQL: schema, RLS, functions
│  ├─ functions/              Edge Functions (send-sms auth hook)
│  └─ seed.sql                Cities, districts
├─ docs/
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json  eslint.config.mjs
```

Shared TypeScript and ESLint settings live at the repo root (`tsconfig.base.json`, `eslint.config.mjs`) rather than in a `packages/config` package: with only two files to share, a package added nothing.

Package scope: `@bairmair/*`. Proposed bundle id: `mn.bairmair.app` (confirm before the first EAS build).

## Decisions

- **Internal packages ship TypeScript source.** No per-package build step. Next.js consumes them with `transpilePackages`; Metro handles them through Expo's automatic monorepo support (SDK 52+). pnpm's default isolated install is supported by Expo since SDK 54, so no `nodeLinker: hoisted` unless we hit a problem.
- **`room-model` has zero runtime dependencies except zod.** That is what makes the conversion testable without a device, and usable in the browser, in React Native and on a server.
- **`viewer` is web-only.** Mobile shows it through the WebView embed route, as the brief specifies. The viewer takes its labels as props so it does not depend on `i18n`.
- **Floor plan as an SVG string builder in `room-model`.** The same function feeds the React component, the listing page, and PNG rendering for Open Graph previews (Facebook does not accept SVG).
- **Versions are pinned from the official templates at scaffold time**, not from memory: `create-expo-app --template default@sdk-58` and `create-next-app`. One React version across the workspace (Expo requires this).
- **Tooling:** Vitest for packages, ESLint + Prettier, TypeScript strict via a shared base config.
- **Secrets:** `.env.local` per app, gitignored, with a committed `.env.example`. The Supabase secret key lives only in server-side env and Edge Function secrets.

## Environment (decided: native Windows, hosted Supabase)

Found on this machine: Node 24.14.1, npm, git. Missing: pnpm, EAS CLI, Supabase CLI, WSL, Docker.

- pnpm: installed globally and pinned with `packageManager` in the root `package.json`.
- Supabase CLI: a root dev dependency, run as `pnpm supabase ...`. Used for `link`, `db push`, `gen types`, `functions deploy` against your hosted project. No Docker needed for these. `supabase start` and `db diff` need Docker, so we do not use them; migrations are hand-written.
- EAS CLI: run with `pnpm dlx eas-cli` from `apps/mobile`. EAS needs a git repo, so `git init` happens at scaffold.
- Your existing Supabase project is treated as the **dev** project. A separate production project comes before launch.

## EAS development builds

Every new native module needs a new build. To keep builds rare, all native dependencies known for the MVP go into build 1 at step 4: `expo-dev-client`, `expo-roomplan`, `expo-device`, `expo-file-system`, `expo-secure-store`, `expo-localization`, `expo-image-picker`, `expo-apple-authentication`, `react-native-webview`, plus the Google sign-in, maps and background-upload libraries once chosen. I will say so explicitly whenever a later change forces another build.

## Open decisions (not blocking this review)

1. **Where server-side scan processing runs** (needed at step 5). A scan should become "3D-ready" only after trusted code re-converts the raw file, validates it and renders the floor-plan PNG. Recommended: a Next.js route handler, because it imports the workspace packages directly. Alternative: a Supabase Edge Function, which needs a bundling step for Deno.
2. **Map library** (step 6): MapLibre with an OpenStreetMap tile provider (same on web and mobile, no Google key) vs `react-native-maps` + Google Maps.
3. **i18n library:** recommend i18next on both apps with shared JSON catalogs.
4. **Web hosting** (needed once the mobile app loads the embed route from a real URL).
