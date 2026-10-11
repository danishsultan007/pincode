# pincode · your neighborhood (mobile)

Expo (SDK 57) + Expo Router app for pincode. Native (iOS/Android via Expo Go or a dev
build) and web share one codebase. See `../MOBILE-PLAN.md` for the full design and
build sequence, and `../SETUP.md` for the one-time setup steps (Supabase project,
env vars, Google OAuth).

## Requirements

- Node.js 20.19.4+ (Node 24 is fine).
- A Supabase project with the SQL in `../supabase` applied (see `../supabase/README.md`).

## Getting started

```bash
cd mobile
npm install
cp .env.example .env     # then fill in EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY
npm run start             # then press w for web, or scan the QR code with Expo Go
```

Until `.env` is filled in, the app boots to a "Setup needed" screen instead of the
normal navigation stack (see `src/app/_layout.tsx`).

## Scripts

- `npm run start` — Expo dev server (press `a`/`i`/`w` to open a platform).
- `npm run android` / `npm run ios` / `npm run web` — start directly on one platform.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run export:web` — static web export (SPA, `web.output: "single"`).

## Project layout

```
src/
├─ app/          Expo Router routes (screens, layouts, modals)
├─ components/   ui/ post/ comments/ map/ chat/ community/ profile/ notifications/ forms/
├─ providers/    AuthProvider, LocationProvider, QueryProvider, ToastProvider, RealtimeProvider, PushProvider
├─ api/          thin Supabase calls, one file per domain
├─ hooks/        react-query hooks built on api/
├─ lib/          env, supabase client, formatting, geo, pincodes, copy, errors, etc.
├─ theme/        design tokens (colors, spacing, type)
└─ types/        hand-written models for the Supabase views/tables
```

## Notes

- Router: Expo Router only, no `@react-navigation/*` (SDK 56+ dropped it).
- Icons: a small hand-rolled `Icon` component on `react-native-svg` (no `@expo/vector-icons`).
- Theme: follows the phone's light/dark setting, one iris accent (`#4B41D6`), Plus Jakarta Sans font. No hex colors outside `src/theme/tokens.ts`.
- Maps: `react-native-maps` on native, `leaflet`/`react-leaflet` on web, behind a shared
  `PostsMapProps` interface (`components/map/PostsMap.native.tsx` / `PostsMap.tsx`).
- Data access: an untyped Supabase JS client plus hand-written types in `src/types/models.ts`.
