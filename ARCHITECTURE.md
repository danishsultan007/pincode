# pincode: how the whole project works

A plain-English guide for the owner. Everything here was checked against the code and config in this repo on 2026-10-12. Where something could not be checked from the repo (for example a dashboard setting), it says **not verified**. No secret values appear in this file; it only says where they live.

Contents: 1 What the app is | 2 Tech stack | 3 Folder map | 4 Backend (Supabase) | 5 Sign-in | 6 Services and accounts | 7 Key flows | 8 Releases | 9 Security and privacy | 10 Testing and tooling | 11 Open items | 12 Cheat sheet

---

## 1. What the app is

**pincode, your neighborhood** is a hyperlocal community app. It started in Mahadevapura, Bengaluru, and nearby areas (Hoodi, Whitefield, KR Puram, Bellandur). People see posts from around them, sorted by distance, on a list or a map.

What a user can do (all verified in `mobile/src/app` and the migrations):

| Feature | Details |
|---|---|
| Posts | Three types: **Ask**, **Alert**, **Event** (`post_type` enum). An Ask is either "Looking for" (`request`) or "Offering" (`offer`). A post can have an optional photo, a tag, a phone number shown only on tap, and a pin on the map. |
| Answers and comments | Threaded comments. The post author can mark one answer "This solved it", which gives the answerer +15 reputation. |
| Votes and reactions | Helpful votes on posts (+1 rep) and comments (+2 rep), emoji reactions, and "still happening" / "resolved" confirmations on alerts. |
| Communities | Join or leave, community feeds, owners and moderators. Starting a community needs at least 100 reputation, an account at least 30 days old and no recent strike (per SETUP.md; enforced by `can_create_community`). |
| Direct messages | A first message is a **message request**. The other person can accept, decline or block it. After accepting, people can send photos and delete messages. |
| Notifications | An in-app list, live toasts, and push notifications on Android. |
| Reputation and badges | Points come from database triggers. There are 9 badges, such as `first_answer`, `helper` and `trusted_neighbor`. |
| Moderation and admin | A word filter that holds or blocks content, user reports (3 reports hide a post automatically), strikes (warning, final warning, 7-day suspension, permanent ban), and an admin area (`/admin`). |
| Feedback, legal, deletion | Settings has Send feedback, an admin feedback inbox, Terms, Privacy and Guidelines screens, a terms-acceptance gate, and Delete account (also at `/delete-account` on web). |

**One codebase, three targets.** The same TypeScript code in `mobile/` runs as an Android app (live on Google Play closed testing), as an iOS app (configured with `com.pincode.app`, never built or shipped), and as a website (Cloudflare Pages).

> The repo root also holds the **original prototype**: `index.html`, `app.js`, `store.js`, `geo.js`, `pincodes.js`, `styles.css`, `serve.ps1`. It is a static page that stored data in localStorage and was called "Mohalla". It is history. `PLAN.md`, `CHANGES-v1.2.md` and `IMPL-v1.2.md` describe that prototype, not the current app.

---

## 2. Tech stack, and why

Versions come from `mobile/package.json`.

| Piece | Version | What it does here | Why it was chosen |
|---|---|---|---|
| **Expo SDK** | 57 (`expo ~57.0.27`) | Toolkit around React Native: builds, native modules, OTA updates | No Android Studio or Xcode needed. Builds run in Expo's cloud. |
| **React Native** | 0.86.3 | Draws real native screens on Android and iOS | One JavaScript codebase for phones |
| **React** | 19.2.3 | The UI library | Required by RN 0.86 |
| **TypeScript** | ~6.0.3 | Typed JavaScript; `npm run typecheck` runs `tsc --noEmit` | Catches mistakes before they ship |
| **Expo Router** | ~57.0.25 | File-based navigation: each file in `src/app` is a screen | Web URLs and deep links come for free |
| **react-native-web** | ~0.21 | Turns the RN components into HTML for the website | The same code serves the web |
| **TanStack Query** | ^5.104 | Caches server data and refetches it when it goes stale | Lists stay fast and refresh correctly |
| **@supabase/supabase-js** | ^2.117 | Client for the database, sign-in, storage, realtime and functions | The whole backend is Supabase |
| **expo-updates** | ~57.0.25 | Downloads new JavaScript over the air (OTA) | Fixes ship without a Play review |
| **expo-notifications** | ~57.0.22 | Push permission, push token, notification taps | Push on Android |
| **expo-image-picker** | ~57.0.20 | System photo picker (library only, camera turned off) | No broad media permissions needed |
| **expo-location** | ~57.0.20 | Device location while the app is in use | Nearby feed |
| **react-native-maps** | 1.27.2 | Google map on Android | Native map |
| **leaflet + react-leaflet** | 1.9.4 / 5 | Map on the web, with OpenStreetMap tiles | react-native-maps has no web version |
| **@sentry/react-native** | ~7.11 | Crash reporting | Optional; it only runs when a DSN is set (see section 6) |
| **Plus Jakarta Sans** | `@expo-google-fonts/plus-jakarta-sans` | App font, 5 weights (`src/theme/fonts.ts`) | Part of the "Radar" design (DESIGN-OVERHAUL.md) |
| Others | expo-web-browser, expo-linking, expo-clipboard, expo-device, expo-constants, expo-splash-screen, AsyncStorage, react-native-svg (icons), safe-area-context, screens, url-polyfill | Supporting pieces | |

**Design system.** Every color, spacing value and radius lives in `src/theme/tokens.ts`. The app follows the phone's light or dark setting (`userInterfaceStyle: 'automatic'`). The action color is iris, `#4B41D6`. Icons are a hand-made `Icon` component built on react-native-svg. Shared building blocks are in `src/components/ui` (Button, Card, Sheet, TextField and others).

### How routes map to files (Expo Router)

```
src/app/_layout.tsx            -> wraps every screen (providers + stack)
src/app/index.tsx              -> "/"  decides: /welcome, /onboarding, /accept-terms or tabs
src/app/(tabs)/index.tsx       -> "/"  Home tab   ((tabs) is a group; it is not part of the URL)
src/app/(tabs)/inbox.tsx       -> "/inbox"
src/app/post/[id]/index.tsx    -> "/post/abc123"   ([id] is a parameter)
src/app/chat/[id].tsx          -> "/chat/<conversation id>"
src/app/admin/_layout.tsx      -> wraps everything under /admin
```

The same paths work as web URLs (`https://pincode-a54.pages.dev/post/<id>`) and as phone deep links (`pincode://post/<id>`, from `scheme: 'pincode'`).

### Provider order in `app/_layout.tsx`

Providers are wrappers that give every screen shared things. The order matters because inner providers use outer ones.

```
SafeAreaProvider            screen notches/insets
 ThemeProvider              navigation colors from tokens
  QueryProvider             TanStack Query cache (retry 1, staleTime 30 s)
   AuthProvider             session + "me" (profiles + private_profiles); needs Query
    LocationProvider        current location / chosen area
     ToastProvider          small pop-up messages
      ActionSheetProvider   menus (custom on web)
       PushProvider         registers push token, handles taps; needs Auth
        UpdateRequiredGate  blocks very old app versions
         AppStack           the screens
         UpdateBanner       "Update ready - Restart"
```

If `EXPO_PUBLIC_SUPABASE_URL` and the anon key are missing, a "Setup needed" screen shows instead of `AppStack` (`lib/env.ts`). Fonts load before anything renders. Sentry wraps the root only when enabled.

`RealtimeProvider` is **not** in the root. It is mounted in `(tabs)/_layout.tsx`, so it only runs once the user is signed in, onboarded and has accepted the terms.

### The route guard (`Stack.Protected`)

On the web every address loads the same single page, so each screen must protect itself. `AppStack` puts the signed-in-only screens inside `<Stack.Protected guard={signedIn}>`: onboarding, compose, location, community/new, report, chat, profile/edit, community edit and all `settings/*` screens. A signed-out visitor who opens one is sent to `/`, which forwards to `/welcome`. While the session is still being restored, the guard stays open, so tapping a notification on a cold start is not bounced. Public pages (welcome, sign-in/up, password reset, legal pages, delete-account info, and read-only post, community and profile pages for shared links) stay outside the guard on purpose. `(tabs)`, `admin` and `accept-terms` also redirect by themselves.

### Caching and refreshing (`lib/invalidate.ts`)

Tab and stack screens stay mounted, so a list only refetches if something marks it stale. After each kind of change, `invalidateAfter(queryClient, kind)` marks the affected query keys stale. The kinds are `post-created`, `post-edited`, `vote`, `comment`, `comment-vote`, `community`, `profile`, `block` and `moderation`. Example: creating a post refreshes the feed lists, the alerts strip, search, author posts, community posts, and `me` and `profile` (the post counters there are kept up to date by database triggers). Screens that are visible refetch right away; the others refetch the next time they open.

---

## 3. Folder map

```
Mohalla/
├─ mobile/                      the real app (Expo)
│  ├─ app.config.ts             app name, version (1.1.0), package com.pincode.app, plugins, permissions
│  ├─ eas.json                  build profiles development / preview (APK) / production (AAB)
│  ├─ metro.config.js           bundler config (Sentry's wrapper, adds debug IDs)
│  ├─ package.json              dependencies and npm scripts
│  ├─ .env.example              template for mobile/.env (the real .env is gitignored)
│  ├─ public/_headers           Cloudflare Pages security headers (CSP etc.)
│  ├─ public/favicon.ico        favicon for the dev server
│  ├─ assets/                   icon, adaptive icon, splash, favicon source
│  ├─ store/                    Play listing art (512 icon, 1024x500 feature graphic)
│  ├─ scripts/                  fix-web-assets / check-web-assets (Cloudflare), icon generators
│  └─ src/
│     ├─ app/                   screens (Expo Router), see section 2
│     ├─ components/            ui/ post/ comments/ chat/ community/ map/ profile/ forms/ legal/ notifications/
│     │                         + UpdateBanner, UpdateRequiredGate
│     ├─ providers/             Auth, Query, Location, Toast, ActionSheet, Push, Realtime
│     ├─ api/                   thin Supabase calls per area (posts, chat, comments, communities, admin...)
│     ├─ hooks/                 TanStack Query hooks on top of api/ (useFeed, useInbox, usePost...)
│     ├─ lib/                   supabase client, auth, env, push, invalidate, legal text, location,
│     │                         prepareImage (.web), sentry, version, copy (all UI text), share...
│     ├─ theme/                 tokens.ts (colors/spacing), fonts.ts
│     └─ types/models.ts        hand-written data types (the Supabase client is untyped on purpose)
├─ supabase/
│  ├─ migrations/               26 SQL files: the whole database, applied in filename order
│  ├─ RUN_ALL_MIGRATIONS.sql    all migrations in one file (release-check verifies it is in sync)
│  ├─ functions/                4 Edge Functions + _shared helpers
│  ├─ config.toml               only sets verify_jwt per function
│  ├─ tests/                    smoke + 4 regression SQL tests
│  ├─ seed.sql                  demo data, DEV ONLY (26 posts, fake users)
│  └─ PATCH_*.sql               old one-off copies of migrations; history only
├─ scripts/
│  ├─ publish-ota.ps1           safe OTA publish
│  └─ release-check.ps1         read-only pre-release checks
├─ .github/workflows/           backup.yml (nightly DB dump), cleanup-attachments.yml (chat photo retention)
├─ .claude/launch.json          dev servers for Claude's browser preview ("mobile-web" on 8081, old prototype on 8080)
├─ run.ps1                      starts the web dev server, optionally with an ngrok tunnel
├─ .secrets/                    LOCAL ONLY, gitignored: DB passwords/URLs, backup passphrase, cleanup secret,
│                               maps key, Firebase service-account JSON, prod env copy
├─ SETUP.md / DEPLOY.md / RELEASING.md / CHANGELOG.md   how-to docs
├─ MOBILE-PLAN.md               original detailed design of the app and database
├─ DESIGN-OVERHAUL.md / UI-REDESIGN-PLAN.md   design specs
└─ index.html, app.js, ...      the old static prototype (not used by the app)
```

---

## 4. Backend: Supabase

Supabase is a hosted backend. It gives you a **Postgres database**, **Auth** (sign-in), **Storage** (files), **Realtime** (live updates over websockets) and **Edge Functions** (small server programs). The app talks to it directly with the public "anon" key. What a user may do is decided **inside the database** by Row Level Security rules and functions.

```
 Phone app / website
   │  HTTPS (REST + RPC), WebSocket (Realtime), anon key + user JWT
   ▼
 Supabase project (Mumbai)
   ├─ Auth (GoTrue) ── sends emails through Gmail SMTP
   ├─ Postgres ── tables, RLS, triggers, functions
   │     └─ pg_net ──HTTP──► Expo push service ──► FCM ──► Android phone
   ├─ Storage ── avatars, post-images (public), chat-attachments (private)
   ├─ Realtime ── messages, notifications, conversation_members, conversations
   └─ Edge Functions (Deno) ── login, password reset, delete account, photo clean-up
```

### Two projects

| Project | Ref | Used by |
|---|---|---|
| `pincode-dev` (Mumbai) | `dmbkyzdkmpyqgyyvcygs` | your laptop (`mobile/.env`), `run.ps1`, EAS `development`. The Supabase CLI is linked here (`supabase/.temp/project-ref`). |
| `pincode-prod` (Mumbai) | `jfvnahkskwhxgefmoiaz` | EAS `preview` and `production` builds, OTA updates, and the website. Every tester uses this one. |

Project refs are not secrets; they appear in URLs and in `_headers`. The region (Mumbai) comes from the docs and was **not verified** in the dashboard.

### Database extensions (migration 0100)

`postgis` (distance and map queries), `citext` (case-insensitive usernames), `pg_trgm` (fuzzy search), `pg_net` (HTTP calls from SQL, used for push). `gen_random_uuid()` is built into Postgres; `pgcrypto` is not enabled by name.

### Main tables, views and functions by feature

| Feature | Tables / views | Key functions (RPCs) |
|---|---|---|
| Profiles | `profiles` (public), `private_profiles` (email, phone, prefs, terms version; owner/admin only), `reserved_usernames`, `blocks` | `complete_onboarding`, `username_available`, `email_available`, `phone_available`, `suggest_usernames`, `change_username`, `update_phone`, `set_home_location`, `get_profile`, `accept_terms` |
| Posts and comments | `posts`, `comments`, `post_votes`, `post_reactions`, `comment_votes`, `comment_reactions`, `alert_confirmations`; views `post_cards`, `comment_cards` | `posts_near`, `mark_solved`, `delete_comment`, `reveal_post_phone` |
| Reputation | `reputation_events`, `badges`, `user_badges` | `award_rep`, `revoke_rep`, `award_badge` (internal) |
| Notifications and push | `notifications`, `push_tokens` | `notify`, `send_push`, `register_push_token`, `mark_all_notifications_read` |
| Messaging | `conversations`, `conversation_members` (readable by its own user only), `messages` (incl. `reply_to_id`, `reactions`), `message_hides`, `conversation_receipts` | `start_conversation`, `respond_to_request`, `mark_conversation_read`, `mark_chats_delivered`, `list_conversations`, `inbox_counts`, `hide_message`, `delete_message_for_everyone`, `set_message_reaction`, `can_attach` |
| Communities | `communities`, `community_members`, `community_bans`; view `community_cards` | `create_community`, `update_community`, `can_create_community`, `slug_available`, `set_community_role`, `remove_community_member`, `unban_community_member`, `mod_set_post_removed`, `communities_near` |
| Search | (uses the tables above) | `search_posts`, `search_users` |
| Moderation | `filter_terms`, `reports`, `moderation_queue`, `strikes`, `moderation_actions` | `submit_report`, `admin_resolve_item`, `admin_issue_strike`, `admin_lift_ban`, `admin_remove_content`, `admin_test_filter` |
| Sign-in safety | `login_attempts` | `login_throttle_hit`, `login_throttle_clear` (service role only) |
| Feedback and config | `feedback`, `app_config` (one row: `min_supported_version`, `message`) | |

### Row Level Security (RLS): who can see and change what

RLS adds a rule to every table that Postgres checks on every query. Migration `20260927001100_rls_grants.sql` first **revokes everything** from the `anon` (signed out) and `authenticated` roles. It then grants back only what is needed, often **per column**. Examples:

- `profiles`: anyone can read; you can update only your own `display_name, bio, avatar_url, interests, home_*`. You cannot write your role, reputation or ban fields.
- `private_profiles`: readable only by yourself or an admin.
- `posts`: visible if not held or removed, or if you are the author, an admin, or a moderator of that community. Inserts must be your own and pass `can_participate()` (not banned).
- `messages`: readable only by conversation members, minus messages you hid.

### SECURITY DEFINER functions

Many functions run **as the database owner** (`security definer`). They can do things the caller cannot do directly, and each one checks `auth.uid()` itself. Examples: `start_conversation` creates rows in two tables at once, and `admin_issue_strike` checks `is_admin()` first. Two later migrations hardened this:
- `20261010000100_fix_null_auth_checks.sql`: fixed checks where a signed-out caller (null `auth.uid()`) could slip through a comparison.
- `20261010000200_revoke_anon_rpc_execute.sql`: signed-out callers can no longer run 63 such functions. A short keep-list stays available for logged-out screens, such as `username_available`, `email_available` and `get_profile`.

### Triggers (automatic work inside the database)

Triggers are named `tNN_...`, and the number sets their order:
- **t10 prepare**: fills in and validates fields, for example setting `sender_id` to the caller, enforcing message-request rules, and checking chat photo paths.
- **t20 filter**: `moderate_text` runs the word filter on posts, comments and messages. A match either blocks the content or holds it as `pending`.
- **t50 counters**: post, answer and solved counts, community member and post counts, vote and reaction totals, and reputation (`award_rep`).
- **t60 notify**: creates notifications (comment replies, alerts within 2 km of your home area, new community posts). The trigger `t60_notifications_push` then sends each notification as a push.
- **t70 enqueue**: held content goes into `moderation_queue` and admins are notified.
- `on_auth_user_created`: creates the `profiles` and `private_profiles` rows when someone signs up.

### Storage buckets

| Bucket | Public? | Size limit | Types | Rules |
|---|---|---|---|---|
| `avatars` | yes (anyone can read) | 2 MB | jpeg, png, webp | you write only in the folder named after your user id |
| `post-images` | yes | 8 MB | jpeg, png, webp, gif | same folder rule |
| `chat-attachments` | **no** (private) | 3 MB (raised from 1.5 MB) | jpeg, png, webp | path `<conversation>/<sender>/<random>.<ext>`. Upload only into an **accepted** direct chat you belong to, with no block, at most 20 per hour and 60 per day, and only while the bucket holds less than 700 MB in total (a guard for the 1 GB free-plan limit). Readable by the uploader or by anyone who can read the message that uses the file. |

### Realtime

These tables are in the `supabase_realtime` publication: `messages`, `notifications`, `conversation_members`, `conversations`, `conversation_receipts`. The app listens on:
- `notif:<uid>`: new notifications. The Inbox and badge refresh and a toast shows.
- `cm:<uid>`: changes to your chat memberships, such as unread counts and new chats.
- `msg:<conversation>`: opened by the chat screen while it is visible (new and changed messages, plus the other person's delivered/read progress from `conversation_receipts`).

Channel names get a random suffix (`uniqueChannel` in `lib/supabase.ts`) to avoid a reuse bug.

### Edge Functions (`supabase/functions`)

| Function | JWT check | Why it exists |
|---|---|---|
| `login-with-identifier` | off | Sign in with a **username or phone**. Auth only accepts emails, and the old database lookup function leaked everyone's email. This function looks up the email with the service role and returns only a session. It is rate-limited (per IP 60, per identifier+IP 8, per identifier 50, per 15 min) and pads failures to about 600 ms, so the response does not reveal which accounts exist. |
| `request-password-reset` | off | Sends a reset email for a username or phone without revealing the email or whether the account exists. Limited to 20 per IP and 5 per identifier per 15 min. Only accepts redirect links that end in `reset-password`. |
| `delete-account` | on | Deletes your files in `avatars` and `post-images`, chat photos in your conversations, and your sent messages, then deletes the auth user (which cascades to the rest). |
| `cleanup-chat-attachments` | off, protected by a shared secret header `x-cleanup-secret` | Run daily by GitHub Actions. Deletes chat photos older than 90 days and uploads never attached to a message (older than 24 h). |

The secrets these functions use (service-role key, `CLEANUP_SECRET`) are stored as Supabase function secrets, never in the repo.

### SQL tests (`supabase/tests`)

| File | Checks |
|---|---|
| `smoke.sql` | Overall RLS and trigger behavior. **Needs `seed.sql`, so dev only.** |
| `security_rpc_access.sql` | Signed-out users cannot run protected functions, and the app's real calls still work |
| `null_auth_checks.sql` | The null-auth bypass fixes |
| `chat_attachments.sql` | Photo upload and read rules |
| `delete_messages.sql` | Delete for me / for everyone |
| `message_reactions.sql`, `single_reaction.sql` | One reaction per person (chat messages, posts, comments) |
| `message_replies.sql` | Reply targets: only live messages of the same chat; no re-pointing; block and pending rules |
| `read_receipts.sql` | Delivered/read progress, the read-receipts switch, privacy of membership rows |

Each test runs in a transaction and deliberately ends with an error such as `ALL ... PASSED (rolled back)`, so nothing is left behind.

---

## 5. Sign-in (Auth)

- **Email + password**: `supabase.auth.signUp` and `signInWithPassword` (`lib/auth.ts`). Confirmation and reset emails are sent by Supabase Auth through **Gmail SMTP** using `pincode.app.team@gmail.com` (stated in `lib/constants.ts` and RELEASING.md; the SMTP settings themselves are in the dashboard, **not verified**).
- **Username or phone + password**: goes through the `login-with-identifier` Edge Function. Indian phone numbers are normalized to `+91...` first.
- **Google**: OAuth with **PKCE** (a code exchange instead of tokens in the URL).
  - Web: the browser is redirected to Google, then back to `/auth/callback`; the Supabase client picks up the session from the URL.
  - Android: a browser sheet opens (`expo-web-browser`) and returns to `pincode://auth/callback`. `handleAuthUrl` exchanges the code exactly once, because both the browser result and the callback route may see it.
  - Only a **Web** OAuth client is used. Native Google Sign-In client ids are reserved but unused.
- **Password reset**: `/forgot-password` sends the email, either directly or through the Edge Function. The link opens `/reset-password`, which understands all three link shapes (`?code=`, `#access_token=`, `?token_hash=`). Signed-in users can change their password in `settings/password`.
- **Session storage**: AsyncStorage on phones, browser storage on web. Tokens refresh automatically while the app is open.
- **Order after sign-in** (`app/index.tsx`): no session → `/welcome`. Not onboarded → `/onboarding` (3 steps: About you, Phone number, Area and interests; consent is collected on the last step). Terms version differs from `TERMS_VERSION` (`2026-10-09` in `lib/legal.ts`) → `/accept-terms`. Otherwise → tabs. Changing `TERMS_VERSION` makes everyone accept the terms again.
- **Push token** is registered after onboarding and deleted on sign-out.

---

## 6. Every external service, account and tool

"Configured in" points to the repo file, or to the dashboard when the setting is not in the repo. Plan limits come from the docs or general knowledge. **Check the providers' pricing pages for current numbers.**

### Cloud services and accounts

| Service | What it is | Exactly what we use it for | Account / identifier | Cost and limits | Configured in |
|---|---|---|---|---|---|
| **Supabase Database** | Hosted Postgres | All app data, RLS, triggers | projects `pincode-dev`, `pincode-prod` | Free plan: no automatic backups, no point-in-time recovery, the project pauses after about 7 idle days. Free-tier sizes are roughly 500 MB database and 1 GB storage (**check pricing page**). Pro is about $25/month. | `supabase/migrations` |
| **Supabase Auth** | Sign-in service | Email/password, Google, sessions, reset emails | same projects | included | Dashboard: providers, redirect URLs, SMTP (**not verified**) |
| **Supabase Storage** | File storage | 3 buckets (section 4) | same | about 1 GB on free; the chat bucket stops accepting uploads at 700 MB | migrations 1000, 1300, 20261012* |
| **Supabase Realtime** | Live database changes | chat, inbox, notifications | same | free-tier connection limits apply | migration 1000 |
| **Supabase Edge Functions** | Deno server functions | 4 functions | same | free-tier invocation quota | `supabase/functions`, `config.toml` |
| **pg_net** (Postgres extension) | HTTP from SQL | `send_push` posts to the Expo push API | in-database | included | migration 0100, `send_push` |
| **Supabase CLI** | Command-line tool | push migrations, deploy functions, run SQL tests | run via `npx.cmd supabase` (not installed globally, not in package.json) | free | `supabase/.temp` (link to dev) |
| **Expo / EAS Build** | Cloud build service | Builds the APK (preview) and AAB (production) | Expo account `danishsultan007`, project `@danishsultan007/pincode`, id `2de7a6bf-80cd-4e00-9051-19ec6e3d9e75` (not secret) | Free plan: a small monthly build allowance, about 30 per RELEASING.md, with a slower queue | `eas.json`, `app.config.ts` |
| **EAS Update (OTA)** | Over-the-air JS updates | Ships JS fixes to installed builds | channels `preview`, `production` (also `development`) | Free plan counts monthly active users, about 1,000 per RELEASING.md | `app.config.ts` (`updates.url`, `runtimeVersion`) |
| **EAS environment variables** | Build-time settings on Expo's servers | `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`, `EXPO_PUBLIC_WEB_URL`, `EXPO_PUBLIC_APP_ENV`, `GOOGLE_MAPS_ANDROID_API_KEY` (secret), `GOOGLE_SERVICES_JSON` (file), optional Sentry vars | environments `development`, `preview`, `production` | included | expo.dev (values **not verified** from the repo) |
| **EAS credentials** | Signing keys + FCM key | Android upload keystore, FCM V1 service-account key | expo.dev → Credentials | included | dashboard |
| **eas-cli** | Command-line tool | build, update, rollback, env | `npx.cmd eas-cli`, login `danishsultan007` (checked by release-check) | free | |
| **Expo push service** | `exp.host` push relay | Receives pushes from `send_push` and forwards them to FCM | uses the EAS project id | free | `send_push` in migration 20261012000300 |
| **Google Play Console** | App store | Closed testing track "alpha", AAB uploads, listing, Data safety | app `com.pincode.app` | $25 one-time (paid) | `eas.json` submit (track alpha, draft) |
| **Play App Signing** | Google re-signs the app | Its SHA-1 must be added to the Maps key | Play Console → App signing | included | dashboard |
| **Firebase / FCM** | Google's push delivery | Delivers Android pushes; `google-services.json` is in the build | Firebase project `pincode-101ae` (from the service-account file name in `.secrets`) | free | `GOOGLE_SERVICES_JSON` EAS file var; FCM V1 key in EAS credentials |
| **Google Cloud: OAuth** | Google sign-in client | **Web** OAuth client used by Supabase Auth's Google provider. Android/iOS client ids are reserved and unused. | Google Cloud project "pincode" (per SETUP.md) | free | Supabase dashboard → Providers → Google |
| **Google Cloud: Maps SDK for Android** | Map tiles on Android | `react-native-maps` | API key restricted to `com.pincode.app` + EAS upload SHA-1 + Play signing SHA-1 | free tier (Maps SDK for Android mobile loads are typically free; **verify**) | `GOOGLE_MAPS_ANDROID_API_KEY` (EAS secret; local copy in `.secrets`) |
| **Gmail** | Email account | (1) SMTP sender for Supabase Auth emails, (2) support and grievance contact, (3) contact parameter sent to Nominatim | `pincode.app.team@gmail.com` | free; consumer Gmail has daily send limits (about 500/day, **verify**) | `lib/constants.ts`; SMTP in the Supabase dashboard |
| **Cloudflare Pages** | Static web hosting | Hosts the web build; reads `_headers` | `pincode-a54.pages.dev` (no custom domain found in the repo). Builds from the **`production`** branch, root `mobile`. | free (build count limits apply) | `mobile/public/_headers`; build command and variables in the Cloudflare dashboard (per DEPLOY.md: `npm install --no-audit --no-fund && npm run export:web:cf`, output `dist`, `NODE_VERSION=22`) |
| **GitHub** | Code hosting + CI | Private repo `danishsultan007/pincode`. Actions: nightly backup and daily photo clean-up. Secrets: `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `CLEANUP_URL`, `CLEANUP_SECRET`. | `danishsultan007` | Free; private repos get a monthly Actions minutes allowance | `.github/workflows` |
| **gh CLI** | GitHub command line | trigger and watch workflows, list secrets | installed (`C:\Program Files\GitHub CLI`) | free | |
| **Nominatim (OpenStreetMap)** | Free geocoder | Search for an area, and turn GPS into an area name | public `nominatim.openstreetmap.org`, sends `email=` support address | free, **max 1 request/second** (the app waits 1.1 s between calls) | `lib/location.ts` |
| **OpenStreetMap tiles** | Map images | Web map (Leaflet) only | `{s}.tile.openstreetmap.org` | free with fair use | `components/map/*.tsx`, CSP |
| **Google avatars** | Profile photos | Images from `*.googleusercontent.com` (Google sign-in photos) | | | CSP in `_headers` |
| **WhatsApp share** | Link | "Share on WhatsApp" opens `wa.me/?text=...` | | free | `lib/share.ts` |
| **Sentry** | Crash reporting | Wired in code but **only active if `EXPO_PUBLIC_SENTRY_DSN` is set**. It never runs on web. Source maps upload only if `SENTRY_ORG` is set at build time. | No DSN in the repo. Whether EAS has one is **not verified**. RELEASING.md says "once ... is set", which suggests it is not set yet. | free tier | `lib/sentry.ts`, `app.config.ts`, `metro.config.js` |
| **ngrok** | Public tunnel to your laptop | Optional `run.ps1 -Ngrok` for testing the dev web app from a phone | installed (WindowsApps) | free tier | `run.ps1` |

### Packages, runtimes and local tools

| Tool | Use | Notes |
|---|---|---|
| npm registry | all packages | `package-lock.json`. Cloudflare must use `npm install`, not `npm ci` (npm 10 vs 11 lockfile issue). `overrides` pins `react-native-worklets` 0.13.0. |
| Node.js / npm | runs Expo tools | local Node 24.19.0, npm 11.17.0. Cloudflare uses `NODE_VERSION=22`. Minimum 20.19.4. |
| Google Fonts package | Plus Jakarta Sans files bundled into the app | `@expo-google-fonts/plus-jakarta-sans`; nothing is loaded from Google at runtime (the CSP allows only `font-src 'self'`) |
| Docker image `postgres:17` | `pg_dump` inside the backup job (on GitHub's runner) | `.github/workflows/backup.yml` |
| GPG | AES-256 encryption of the backup dump | on the runner; also installed locally (`gnupg`) for decrypting |
| Git | version control | 2.53, branches `main` and `production` |
| PowerShell scripts | `run.ps1`, `serve.ps1` (old prototype), `scripts/publish-ota.ps1`, `scripts/release-check.ps1` | use `npx.cmd`/`npm.cmd` because of PowerShell script blocking |
| Android platform-tools (adb) | connect your phone over USB to install APKs and read logs | `C:\Users\Danish Sultan\android-platform-tools\platform-tools\adb.exe`; not on PATH; set-up and commands are in RELEASING.md section 7b |
| Testing frameworks | none | **Jest, Playwright, Maestro, Detox are not installed** |
| Analytics | none | no analytics SDK in `package.json` |

### Services NOT used

No AWS, Azure or GCP compute or servers (all server logic is Supabase). No custom domain and no domain email (DEPLOY.md plans one plus Resend, but neither is set up; the CSP and docs point at `pincode-a54.pages.dev`). No Resend/Brevo or other email provider. No analytics or ad SDKs. No Apple Developer account and no iOS builds. No native Google Sign-In SDK. No paid map or geocoding API on the web. No Supabase Pro (as of the docs).

---

## 7. How the key flows work

**Sign-up and onboarding**
1. On `/sign-up`, the email is checked live (`email_available`), then `signUp`. Or Google.
2. A database trigger creates the `profiles` and `private_profiles` rows.
3. `/onboarding`: name and username (live availability check and suggestions), phone, then area and interests, plus terms consent. `complete_onboarding` and `accept_terms` save them.
4. The tabs open. The push token is registered (Android build only).

**Creating a post, and how screens refresh**
1. `/compose`: an optional photo is uploaded to `post-images/<uid>/...` as an ArrayBuffer, then a `posts` insert.
2. Triggers: t10 prepare, t20 filter (may hold it), t30 community check, t50 counters (your `post_count`, the community count), t60 notifications (alert nearby, community subscribers), t70 queue if held.
3. The app calls `invalidateAfter('post-created')`, so the feed, alerts, search, profile lists and `me` stats refetch. Home shows the post; Profile shows the new count.

**Sending a chat message (realtime + push)**
1. `messages` insert → `messages_prepare` (checks membership, request state and blocks) → filter → `messages_after`.
2. `messages_after` raises the other person's `unread_count`. A pending request creates a `message_request` notification. An accepted chat calls `send_push` directly, unless the chat is muted or message push is turned off.
3. `send_push` uses `pg_net` to send a high-priority push to `exp.host`, which hands it to FCM and then the phone.
4. Realtime delivers the row to the open chat (`msg:<id>`) and updates the inbox (`cm:<uid>`). No banner shows for the chat you are already looking at.
5. Tapping a push opens `data.url`; only in-app paths starting with one `/` are allowed.

**Sending a photo**
1. Pick a photo. On a phone, the system picker returns quality 0.4 with EXIF stripped; files over 3 MB are refused. On web, it is resized to 1600 px and saved as JPEG at 0.75.
2. Upload to the private bucket at `<conv>/<uid>/<random>.jpg` (the `can_attach` gate applies).
3. Insert a message with `attachment_path`; the server checks the path, owner, size and that the chat is accepted.
4. To show a photo, the app requests a **signed URL valid for 10 minutes**.
5. Daily at 03:00 IST, GitHub Actions calls `cleanup-chat-attachments`: files older than 90 days and unused uploads older than 24 h are deleted. The chat then shows "Photo expired"; the text stays.

**Replying to a message**
- The new message stores only `reply_to_id`. `messages_prepare` rejects (`bad_reply`) a target in another chat, deleted, held or hidden by the sender; the column cannot be updated later.
- The chat screen resolves quotes from the loaded messages (so a realtime delete-for-everyone shows at once) and fetches originals older than the loaded pages in one query (`useQuotedMessages`); both go through the normal message read policy.
- Long-press > Reply, or on Android drag the message right (`SwipeToReply`, PanResponder, JS only; `SWIPE_REPLY` turns it off).

**Ticks (sent / delivered / read)**
- `mark_chats_delivered()` (called by the app on start, on returning to the foreground, and on a `cm:` event, debounced) records, per accepted direct chat, the newest incoming message the app has synced. `mark_conversation_read()` (opening the chat, also on returning to the foreground with it open) records read, unless the person turned read receipts off (then only `delivered_at` moves).
- The sender's chat screen compares each of its messages' `created_at` with the other person's `conversation_receipts` row. If the sender also has receipts off, read ticks are shown as delivered.
- Not possible: "delivered" while the other app is closed (Android shows the push itself and no app code runs).

**Deleting a message**
- *For me*: `hide_message` adds a row to `message_hides`; the read policy hides it for you only.
- *For everyone*: `delete_message_for_everyone` works only for the sender, within 24 hours. The **server** enforces the limit; the app only hides the button. The row stays as "This message was deleted", with text and photo reference cleared. The orphaned photo is removed by the daily clean-up.

**OTA update and the in-app banner**
1. `publish-ota.ps1` publishes a JS bundle to a channel for runtime version `1.1.0`.
2. `UpdateBanner` checks at launch and on each return to the app (at most every 10 minutes), downloads the update, and shows "Update ready - Restart". It does not appear while the keyboard is open or on form screens, so drafts are not lost. "Later" dismisses it for that update.
3. Separately, `UpdateRequiredGate` reads `app_config.min_supported_version`. If the app is older, it shows a blocking "Update required" screen with a Play link. If the check fails or takes over 3 s, the app works normally.

**Web deploy**
1. `git push origin main:production`.
2. Cloudflare Pages builds `mobile` with `npm run export:web:cf`. `fix-web-assets.cjs` moves `assets/node_modules` to `assets/vendor` (Pages drops `node_modules` folders), and `check-web-assets.cjs` verifies every `/assets/...` link.
3. `_headers` adds the security headers. Unknown paths serve `index.html` (single-page app).

---

## 8. Releases

```
 laptop ──► pincode-dev (test) ──► git push main ──► backup ──► prod DB/functions
                                                                   │
                         ┌─────────────────────────────────────────┤
                         ▼                                         ▼
                 OTA (publish-ota.ps1)                    native build (eas build)
                 channel production/preview               AAB → Play closed testing
                         │                                         │
                         └──────────► tag, smoke test, watch 24 h ◄┘
 web: git push origin main:production → Cloudflare Pages
```

- **Version = runtime version.** `version: '1.1.0'` in `app.config.ts` with `runtimeVersion: { policy: 'appVersion' }`. An OTA reaches only builds with the same version. Change the version **only** with a new native build. `versionCode` is managed by EAS (`appVersionSource: remote`, `autoIncrement`). The `version` in `package.json` (0.1.0) is unused.
- **Profiles and channels** (`eas.json`): `development` (dev client), `preview` (APK, internal), `production` (AAB). **Both preview and production use the PRODUCTION backend.**
- **OTA or new build?** Screens, logic, text, styles, JS-only libraries and `EXPO_PUBLIC_*` values ship by OTA. New native packages, any `app.config.ts` change (permissions, plugins, icon, keys, `google-services.json`) and SDK upgrades need a new build and a version bump.
- **Scripts**: `release-check.ps1 -Mode Ota|Build|Db` (read-only checks: branch, clean and pushed tree, typecheck, expo-doctor, `expo install --check`, audit, CLI linked to dev, pending migrations on dev and prod, RUN_ALL in sync, EAS login and env pointing at prod, version vs latest build, CHANGELOG heading). `publish-ota.ps1` runs the checks, hides `mobile/.env`, exports the bundle with the EAS environment, **scans it to make sure it points at prod and not dev**, then publishes that exact bundle.
- **Tags**: `v1.1.0` (native), `v1.1.0+ota.N` (OTA; the latest tag is `v1.1.0+ota.13`), `db-YYYYMMDD` (database only). Existing tags: `v1.0.0`, `v1.0.0+ota.1-2`, `v1.1.0+ota.1-13`. There is no `v1.1.0` tag itself.
- **Database order**: write the migration and append it to `RUN_ALL_MIGRATIONS.sql` → push to **dev** → test → **trigger the backup** → push to **prod** with `--db-url` → verify. Changes must be additive only ("expand/contract"), because old app versions stay in use.
- **Rollback**: a bad OTA is undone with `eas-cli update:rollback <GROUPID>` (or `update:republish`, or `update:roll-back-to-embedded`). A bad build means a new, higher build. A bad migration needs a forward-fix migration. A bad function is fixed by `git restore --source <tag>` and redeploying.
- **Branches**: `main` (all work, releases) and `production` (only what Cloudflare deploys). Hotfix branches are named `hotfix/*`.
- **Edge Function deploy**: `npx.cmd supabase functions deploy <name> [--no-verify-jwt] --use-api --project-ref <ref>`, dev first, then prod.

---

## 9. Security and privacy

- **RLS everywhere**, column-level grants, signed-out access removed from internal functions, `is_blocked_between` is not executable by app users, and `message_hides` has no grants at all.
- **The anon key is public by design.** The real protection is RLS and grants. The **service-role key** exists only in Edge Function secrets.
- **Secrets**: `mobile/.env` (dev values) and `.secrets/` are gitignored, as is `google-services.json`. Build secrets live in EAS environment variables. Backup and clean-up secrets are GitHub Actions secrets and Supabase function secrets. Never paste their contents anywhere.
- **Web headers** (`_headers`): the CSP is **Report-Only** for now (logs violations, blocks nothing). It allows only the prod Supabase, Google avatars, OSM tiles and Nominatim. `X-Frame-Options: DENY`, HSTS, nosniff, Referrer-Policy and a Permissions-Policy are enforced. To finish: check the browser console for "[Report Only]" messages, then rename the header to `Content-Security-Policy`.
- **Rate limits**: login and reset throttles (section 4), chat uploads limited to 20/hour and 60/day, the 700 MB bucket guard, and Supabase Auth's own limits.
- **Moderation**: word filter (block or hold), reports (3 reports auto-hide), strike ladder, community moderators, an admin queue, and a moderation notice delivered as a system chat message.
- **Backups**: nightly at 02:30 IST, `pg_dump` (with grants) encrypted with GPG AES-256 and kept as a GitHub artifact for **14 days**. Storage files are **not** in the backup. Restoring has **never been rehearsed** (RELEASING.md asks for a one-time decrypt drill).
- **Data retention**: chat photos 90 days, never-sent uploads 24 h, everything else until the account is deleted. The privacy text says backups roll over within about 30 days (the actual artifact retention is 14 days).
- **Privacy law (DPDP Act 2023)**: Terms and Privacy text is in `lib/legal.ts`. It is marked as a **draft needing legal review**. The operator and Grievance Officer are currently "Danish Sultan" + the Gmail address (TODO before launch). The app is 18+. Location is foreground only. Photos use the system picker, and broad media and mic permissions are blocked in `app.config.ts`.
- **Play Data safety** (planned table in DEPLOY.md §6): location, name/email/phone/IDs, photos, messages, crash logs (Sentry), and push token. All marked encrypted in transit, deletable, not sold. If Sentry stays off, the "crash logs" entry overstates what is collected (harmless, but worth matching).

---

## 10. Testing and tooling

| What | How | Automated? |
|---|---|---|
| Typecheck | `cd mobile; npm.cmd run typecheck` | inside release-check only |
| SQL tests | `npx.cmd supabase db query --linked --file supabase/tests/<file>.sql` (dev) | no, manual |
| Health checks | `npx.cmd expo-doctor`, `npx.cmd expo install --check` | inside release-check |
| Web preview | `.\run.ps1` or `.claude/launch.json` "mobile-web" → http://localhost:8081 (talks to **dev**) | manual |
| Phone testing | Install the preview APK or the Play build; `adb devices` / `adb logcat` with the adb path above | manual |
| Web asset check | `check-web-assets.cjs` during the Cloudflare build | yes (on build) |
| Backup, clean-up | GitHub Actions on a schedule | yes |

**Not automated:** no unit or UI tests (no Jest/Playwright/Maestro), no CI on push or pull requests (the only workflows are backup and clean-up), no automatic test run after migrations, no crash reporting unless Sentry is set, and no backup restore test.

---

## 11. Known gaps and roadmap

- **Next native build 1.2.0**: add `expo-image-manipulator` to shrink photos on the phone (the comment in `lib/prepareImage.ts` says this needs a new build; migration 20261012000300 raised the cap to 3 MB because of it). Camera capture (`cameraPermission` is `false` in `app.config.ts` today). After 1.2.0 is Available on Play, raise `min_supported_version` if needed.
- **Play**: keep 12+ testers (aim for 25+) opted in for 14 continuous days before applying for production access, then do the pre-launch report, listing screenshots and Data safety. Add the Play signing SHA-1 to the Maps key.
- **Sentry**: set `EXPO_PUBLIC_SENTRY_DSN` (+ org, project, auth token) in EAS, or remove Sentry from the privacy text and Data safety.
- **Supabase Pro** (about $25/month) before production access: backups, no pausing.
- **Legal**: real legal entity and named Grievance Officer in `lib/legal.ts`, and a lawyer review of the Terms and Privacy text.
- **Email**: move from Gmail SMTP to a domain sender (Resend/Brevo) before launch (RELEASING.md).
- **Backups**: do the decrypt/restore drill. Storage files have no backup.
- **CSP**: promote it from Report-Only to enforced.
- **Remaining audit items**: `email_available()` reveals whether an email is registered (DEPLOY.md follow-up); Nominatim has no result caching. Other medium and low audit items are not listed in the repo (**not verified**).
- **Docs**: the out-of-date docs were refreshed on 2026-10-12 (list below). Keep `CHANGELOG.md` (`Unreleased`) updated whenever you ship.
- **CHANGELOG**: updated on 2026-10-12 with everything shipped by OTA since 1.1.0 (chat photos, message deletion, update banner, menu and dialog fixes, route guard). The 1.2.0 plans are listed there too.

**Documentation fixed on 2026-10-12** (it disagreed with the code before):
- `supabase/README.md` and `SETUP.md` said "no Edge Functions" and "12 migrations". They now describe the 4 functions and the 26 migrations, and list the regression tests.
- `RELEASING.md` section 7 now includes `cleanup-chat-attachments` and the steps to set `CLEANUP_SECRET`. The `roll-back-to-embedded` example no longer hard-codes runtime `1.0.0`. New section 7b documents the adb phone link.
- `DEPLOY.md` has a status note: the real setup is `pincode-a54.pages.dev` and Gmail SMTP; the custom domain and Resend are marked "planned". Section 0 is marked historical.
- `mobile/README.md` now says the theme follows light/dark with the iris accent and Plus Jakarta Sans.
- `CHANGELOG.md` `Unreleased` now covers the OTA releases since 1.1.0.

**Still not matching (deliberately left):** `lib/legal.ts` says backups are "overwritten within about 30 days"; the nightly backup artifacts are actually kept 14 days. The statement is still true (14 is within 30), so it was left as is. Revisit it when Supabase Pro adds its own backups.

---

## 12. Cheat sheet

Run from the repo root in PowerShell unless noted. The secret files are read into variables and never printed.

```powershell
# 1. Dev web server (dev backend) -> http://localhost:8081
.\run.ps1

# 2. Typecheck
cd mobile; npm.cmd run typecheck; cd ..

# 3. Pre-release checks, then publish an OTA
.\scripts\release-check.ps1 -Mode Ota
.\scripts\publish-ota.ps1 -Channel production -Message "fix: short description"

# 4. Apply migrations to DEV (dry run first)
$devpw = (Get-Content .secrets\pincode-dev-db-password.txt -Raw).Trim()
npx.cmd supabase db push --linked --dry-run -p $devpw
npx.cmd supabase db push --linked -p $devpw

# 5. Run SQL security tests on dev (success = error "ALL ... PASSED")
npx.cmd supabase db query --linked --file supabase/tests/security_rpc_access.sql
npx.cmd supabase db query --linked --file supabase/tests/null_auth_checks.sql

# 6. Trigger the backup and wait for it (do this before every prod DB change)
gh workflow run backup.yml --repo danishsultan007/pincode
gh run watch --repo danishsultan007/pincode

# 7. Apply migrations to PROD
$produrl = (Get-Content .secrets\prod-db-url.txt -Raw).Trim()
npx.cmd supabase db push --db-url $produrl --dry-run
npx.cmd supabase db push --db-url $produrl

# 8. Roll back a bad OTA (group id from the publish output or update:list)
cd mobile; npx.cmd eas-cli update:list; npx.cmd eas-cli update:rollback <GROUPID> --message "rollback: why" --non-interactive; cd ..

# 9. Release the website
git push origin main:production

# 10. Check the phone is connected over USB
& "C:\Users\Danish Sultan\android-platform-tools\platform-tools\adb.exe" devices
```
