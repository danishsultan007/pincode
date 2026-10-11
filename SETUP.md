# SETUP.md — pincode (mobile app)

Step-by-step setup for a Windows machine with no prior Supabase/Expo experience.
Follow the steps in order. Each step says what "it worked" looks like.

Node.js is already installed (this guide assumes Node 24 — check with `node -v`
in a fresh PowerShell window; anything ≥ 20.19.4 works).

Everywhere below that says **PowerShell**, you can use the same PowerShell window
you already have open, unless a step says to reopen it.

> If a command below prints `'npx' is not recognized` or similar, your PATH
> hasn't picked up Node yet in this window. Prefix the command with:
> `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User');`
> then run the real command right after it (`;` separated, same line).

---

## 1. Create the Supabase project

1. Go to https://supabase.com, sign in (or create a free account).
2. Click **New project**.
   - Name: `pincode`.
   - Database password: generate a strong one and **save it somewhere** — you
     may need it later for the CLI option.
   - Region: **South Asia (Mumbai)** (closest to the app's users).
   - Plan: **Free**.
3. Wait for the project to finish provisioning (1–2 minutes).
4. Go to **Project Settings → API** (or **API Keys** in newer dashboards) and
   copy two values — you'll paste them into `mobile/.env` in step 7:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **anon / publishable key**

**Success looks like:** the project dashboard loads without a "setting up"
banner, and you have the URL and key copied somewhere safe.

## 2. Enable the Postgres extensions

The first migration enables these itself, so this step is a safety net —
do it if the migration in step 3 errors on `create extension`.

1. In the Supabase dashboard, go to **Database → Extensions**.
2. Search for and enable each of: **postgis**, **pg_trgm**, **citext**, **pg_net**.

**Success looks like:** each of the four shows as "Enabled" in the list.

## 3. Run the database migrations

The database is plain SQL, so you can set it up from the SQL editor with no install. There are also
four small Edge Functions (sign-in by username/phone, password reset by username/phone, account
deletion, chat photo clean-up). They need the Supabase CLI to deploy: see `RELEASING.md` section 7.

### Option A — SQL Editor (recommended, no install needed)

Two combined files do this in two pastes instead of fourteen. They're
generated from `supabase/migrations/*.sql`, `seed.sql` and `tests/smoke.sql`
in the exact order below — if you ever change an individual file, regenerate
these (or just fall back to running the individual files one at a time, same
order):
  1. `20260927000100_extensions_helpers.sql`
  2. `20260927000200_profiles.sql`
  3. `20260927000300_posts_comments.sql`
  4. `20260927000400_reputation_badges.sql`
  5. `20260927000500_notifications_push.sql`
  6. `20260927000600_messaging.sql`
  7. `20260927000700_communities.sql`
  8. `20260927000800_feed_search.sql`
  9. `20260927000900_moderation.sql`
  10. `20260927001000_storage_realtime.sql`
  11. `20260927001100_rls_grants.sql`
  12. `20260927001200_p9_fixes.sql`

1. In the Supabase dashboard, open **SQL Editor → New query**.
2. Copy the full contents of `supabase/RUN_ALL_MIGRATIONS.sql`, paste it in,
   click **Run**, and confirm it says "Success. No rows returned" (or
   similar) with no red error. This is a one-time run — running it again
   later will error on the `create table` statements (that's expected; it
   just means the schema is already there).
3. Copy the full contents of `supabase/RUN_ALL_SEED_AND_TEST.sql`, paste it
   in, click **Run**. **Success looks like:** a result row with a count of
   **26** (the seeded Mahadevapura/Bellandur demo posts), and no error after
   it — the second half is the self-test, which runs inside its own
   transaction and rolls itself back, so it leaves no test data behind. If
   any check inside it fails, the whole script raises an exception instead
   of finishing cleanly.

### Option B — Supabase CLI

```powershell
cd "C:\Users\Danish Sultan\Documents\Mohalla"
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Then still run `seed.sql` and `tests/smoke.sql` from the SQL Editor (steps 4–5
above) — the CLI's `db push` only applies `migrations/`.

**Troubleshooting:** see the "Troubleshooting" section near the end of this
file if any migration errors.

## 4. Configure Auth

1. In Supabase, go to **Authentication → Sign In / Providers**.
2. **Email** provider: enabled.
   - Turn **"Confirm email" off** for development — Supabase's built-in
     mailer is heavily rate-limited and will block repeated test sign-ups.
     Turn it back on (with your own SMTP configured) before a real launch.
   - Minimum password length: 8.
3. Go to **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:8081`
   - **Redirect URLs** (add all three, one per line):
     - `http://localhost:8081/**`
     - `pincode://**`
     - `exp://**`

**Success looks like:** the three redirect URLs are all listed and saved.

## 5. Google OAuth

The app only needs a **Web** OAuth client (auth uses the browser-based PKCE
flow via `expo-web-browser`, which works in Expo Go, dev builds, and the web).

1. Go to https://console.cloud.google.com and create a new project named
   `pincode`.
2. **APIs & Services → OAuth consent screen**:
   - User type: **External**.
   - App name: `pincode`. Support email: your email.
   - Scopes: `openid`, `email`, `profile` (the defaults are fine).
   - **Test users**: add your own Google account (required while the app is
     in "Testing" publishing status).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `http://localhost:8081`
   - **Authorized redirect URIs**: `https://<project-ref>.supabase.co/auth/v1/callback`
     (use your real project ref from step 1 — this is the exact URI Supabase
     expects, found on the same Providers → Google screen in Supabase).
   - Click **Create**, then copy the **Client ID** and **Client secret**.
4. Back in Supabase: **Authentication → Providers → Google** → toggle it on,
   paste the Client ID and Client secret, **Save**.

**Success looks like:** the Google provider shows as enabled in Supabase, and
later (step 9) tapping "Continue with Google" in the app opens a real Google
sign-in page instead of an error.

Optional, not used by v1 (native Google Sign-In is deferred — see
MOBILE-PLAN.md §10): you can also create an **Android** OAuth client (package
`com.pincode.app` + a SHA-1 from `npx eas-cli credentials`) and an **iOS**
client (bundle id `com.pincode.app`), and paste their client IDs into
`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in
`.env`. Nothing in the app reads them yet.

## 6. Fill in `mobile/.env`

```powershell
cd "C:\Users\Danish Sultan\Documents\Mohalla\mobile"
copy .env.example .env
```

Open `mobile/.env` in a text editor and fill in, at minimum, the two required
variables (from step 1):

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon/publishable key>
```

The rest of `mobile/.env` can stay blank for now:

| Variable | Required? | What it's for |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL (step 1). |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase anon/publishable key (step 1). |
| `EXPO_PUBLIC_WEB_URL` | No | Only if you deploy the web build somewhere public, for share links. |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | No | Only for push notifications on a real device — see step 11. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | No | Reserved for future native Google Sign-In; unused in v1. |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | No | Same, reserved. |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | No | Same, reserved. |
| `GOOGLE_MAPS_ANDROID_API_KEY` | No | Only for Android dev/production builds — see step 12. Expo Go needs no key. |

Until the two required variables are filled in with real values, the app
boots to a "Setup needed" screen instead of its normal navigation (this is
intentional — see `mobile/src/app/_layout.tsx` and `mobile/src/lib/env.ts`).

## 7. Make yourself admin

You'll do this **after** you've signed up once in the running app (step 9)
and finished onboarding, so your profile row exists.

1. Sign up in the app, pick a username, finish onboarding.
2. In Supabase → SQL Editor, run (replace `YOUR_USERNAME`):

```sql
update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';
```

**Success looks like:** re-opening (or reloading) the app shows an **Admin**
link in Settings, and `/admin` no longer redirects you away.

Optional, to test community creation (needs reputation ≥ 100, account age ≥
30 days, no strike in 90 days — see MOBILE-PLAN.md §0):

```sql
update public.profiles set reputation = 150, created_at = now() - interval '40 days'
  where username = 'YOUR_USERNAME';
```

## 8. Install dependencies

```powershell
cd "C:\Users\Danish Sultan\Documents\Mohalla\mobile"
npm install
npx expo install --check
```

If `expo install --check` flags anything, run:

```powershell
npx expo install --fix
```

**Disk note:** `node_modules` is roughly 600–800 MB. No Android Studio or
Xcode is required for anything in this guide.

## 9. Run the app

```powershell
npx expo start
```

- Press **w** to open it in your web browser at `http://localhost:8081`.
- Or install **Expo Go** (Play Store / App Store) on your phone, make sure
  the phone is on the **same Wi-Fi** as this computer, and scan the QR code
  printed in the terminal. If your network blocks that (e.g. a locked-down
  Wi-Fi), run `npx expo start --tunnel` instead and scan again.

**Success looks like:** the app opens to the Welcome screen (or, if you kept
a session from a previous run, straight to the feed). "Continue with Google"
opens a real Google page; email sign-up sends you to onboarding.

## 10. Verify

Run from `mobile/`:

```powershell
npx tsc --noEmit
npx expo export --platform web --output-dir dist
```

**Success looks like:** `tsc` prints nothing (zero errors) and `expo export`
finishes with a `dist/` folder containing an `index.html`. You can delete
`dist/` afterwards — it's just a build check.

Then walk through this checklist, which combines the runtime checks from
every phase in `MOBILE-PLAN.md` §9 (a phase's checks assume the earlier
phases' data — for example P3–P8 assume the seed data from step 3 above):

**Database (P1)**
- [ ] All migration files ran without error, in order (26 at the time of writing; `RUN_ALL_MIGRATIONS.sql` has them all).
- [ ] `seed.sql` returned a single row with count **26**.
- [ ] `tests/smoke.sql` completed with no error (and left no data behind).

**Auth & profile (P2)**
- [ ] Google sign-in works on web (`localhost:8081`) and in Expo Go.
- [ ] Email sign-up works.
- [ ] Onboarding blocks the tabs until it's completed.
- [ ] A taken username, email, or phone shows "Taken" live while typing.
- [ ] Username suggestions are all available and fill the field on tap.
- [ ] The avatar uploads and displays.
- [ ] Reloading the app keeps the session (you stay signed in).

**Feed, map, composer, post detail (P3)**
- [ ] With location denied, the app opens in Mahadevapura with ≥ 8 posts and
      the alerts strip.
- [ ] Distance rings appear at radius 1.
- [ ] Feed filters work; "Unanswered" excludes offers.
- [ ] The List/Map toggle works; a marker tap opens the post detail; a
      long-press on the map opens the composer pinned at that spot.
- [ ] An Ask can be posted, upvoted from a second account, and removing the
      vote reverts the count.
- [ ] On an alert, "Still happening" extends the expiry; two "Resolved"
      confirmations resolve it.
- [ ] WhatsApp share and "Copy link" both work.
- [ ] `pincode://post/<seed id>` (native) and `/post/<id>` (web) open the post.
- [ ] A signed-out web visitor can open a shared post link and read it.

**Threads, reactions, reputation, badges (P4)**
- [ ] Replies nest; a reply at depth 3+ shows "Continue this thread".
- [ ] Reply notifications reach the parent comment's author (and the post
      author once).
- [ ] Each reaction emoji can be toggled on/off, one per user per emoji.
- [ ] Helpful votes count; voting on your own post/comment is refused with
      "You can't vote on your own post."
- [ ] "This solved it" pins the answer, shows "Answered in N min", and adds
      +15 reputation to the answerer. Un-solving reverts all of that.
- [ ] The `first_answer` badge appears on the answerer's profile.

**DMs, notifications, push (P5)**
- [ ] "Message" on a profile creates a message request.
- [ ] The recipient sees "Requests (1)" with Accept / Decline / Block; the
      sender cannot send a second message before it's accepted.
- [ ] After accepting, messages arrive in realtime on both accounts/devices.
- [ ] Unread counts and the Inbox tab badge update live.
- [ ] Tapping a notification deep-links to the right screen.
- [ ] (Optional, needs EAS — step 11) push arrives on a backgrounded app.

**Communities (P6)**
- [ ] The list is nearby-first, with working category/distance/sort filters.
- [ ] Join and leave update the member counts.
- [ ] A post made inside a community shows up both in that community and in
      the nearby feed.
- [ ] A brand-new account sees the eligibility checklist on "Start a
      community" and is refused server-side if it tries anyway.
- [ ] The seeded/eligible admin account (step 7's optional SQL) can create a
      community.
- [ ] The owner can make and remove a moderator; a moderator can remove a
      post and remove a member, who can't rejoin while banned from it.

**Search (P7)**
- [ ] Searching "carpenter" finds `seed-mdp-03` near Mahadevapura, first.
- [ ] Searching "plumber" finds the expired Bellandur ask, labelled
      "From 5 weeks ago".
- [ ] Users are found by username prefix and by display name.
- [ ] Communities are found by name or category.
- [ ] Blocked users are excluded from results.

**Moderation & admin (P8)**
- [ ] A comment containing "registration fee" is held: its author sees
      "Under review", other users don't see it at all, and it appears in the
      admin queue (`/admin`).
- [ ] Posting a slur is blocked outright, with the "isn't allowed" error copy.
- [ ] Three separate reports on the same post hide it automatically.
- [ ] An admin can remove it with a strike — the user gets a system-chat
      warning. Repeating the violation escalates: warning → final warning →
      7-day suspension (posting then fails, and the UI shows a suspended
      banner) → permanent ban.
- [ ] "Lift ban" restores a suspended/banned account.
- [ ] `/admin` is invisible and redirects away for non-admin accounts.

**Polish (P9)**
- [ ] Empty states show on every list that can be empty (feed, search,
      inbox, communities, admin queue, etc.), with distinct wording from
      error states.
- [ ] Pull-to-refresh works on the feed, inbox, communities, admin queue, and
      community member lists.
- [ ] Loading skeletons show while first-page data is fetching.
- [ ] Icon-only buttons have accessibility labels (screen-reader testable on
      web with a browser accessibility inspector, or on-device with
      VoiceOver/TalkBack).
- [ ] On the post detail, thread, and chat screens, the keyboard doesn't
      cover the composer on iOS.
- [ ] On a wide desktop browser, page content is centered in a readable
      column rather than stretching edge-to-edge.

## 11. Optional: push notifications on a real device

Push needs a real Expo project id and, for Android, a dev build (Expo Go on
Android does not support push since SDK 53). iOS push works in Expo Go.

```powershell
cd "C:\Users\Danish Sultan\Documents\Mohalla\mobile"
npx eas-cli login
npx eas-cli init
```

Copy the project id it prints into `EXPO_PUBLIC_EAS_PROJECT_ID` in `.env`.

For Android:
1. Create a Firebase project, add an Android app with package
   `com.pincode.app`.
2. Upload the FCM V1 service-account key at expo.dev → your project →
   **Credentials**.
3. Build a dev client in the cloud (avoids installing Android Studio):
   ```powershell
   npx eas-cli build --profile development --platform android
   ```
4. Install the resulting APK on your Android phone/emulator, then run:
   ```powershell
   npx expo start --dev-client
   ```

If you skip this step entirely, the app still works normally — it just
skips push registration and relies on in-app realtime updates (which work
fine in Expo Go).

## 12. Optional: Android maps in a dev/production build

Expo Go needs no key at all for maps. Only do this if you build a standalone
or dev-client Android app (step 11):

1. In Google Cloud Console, enable the **Maps SDK for Android** and create an
   API key restricted to package `com.pincode.app` and your build's SHA-1.
2. Put it in `.env` as `GOOGLE_MAPS_ANDROID_API_KEY` (no `EXPO_PUBLIC_`
   prefix — it's build-time only, read by `app.config.ts`, not by the app at
   runtime).
3. Rebuild with `npx eas-cli build --profile development --platform android`.

---

## Troubleshooting

**`npx : File C:\Program Files\nodejs\npx.ps1 cannot be loaded because running scripts is disabled`**
Windows PowerShell blocks npm's `.ps1` shims by default. Either run `npx.cmd` / `npm.cmd`
instead (e.g. `npx.cmd expo start`), use Command Prompt or Git Bash, or allow local
scripts once with `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

**A migration errors with `extension "postgis" does not exist` (or similar)**
Run step 2 (enable extensions manually), then re-run the migration that failed.

**A migration errors with `function st_… does not exist` / `function similarity(...) does not exist`**
You likely ran the migrations out of order, or skipped one. Every function in
this schema sets `search_path = public, extensions`; check you ran
`20260927000100_extensions_helpers.sql` first and didn't skip a file.

**`seed.sql` doesn't return 26, or errors partway through**
Re-run the migrations from scratch on a clean project (`Database → Reset` or
a new project) — seed data assumes an empty schema right after the 12
migrations, with nothing else inserted.

**"Continue with Google" opens an error page, or redirects to a blank screen**
- Check the redirect URI in Google Cloud matches **exactly**:
  `https://<project-ref>.supabase.co/auth/v1/callback` (no trailing slash,
  correct project ref).
- Check Supabase → Authentication → URL Configuration has all three redirect
  URLs from step 4.
- Check you added yourself as a **test user** on the OAuth consent screen
  (required while the app is in "Testing" status).

**The app is stuck on "Setup needed"**
`mobile/.env` is missing, still has the placeholder `YOUR-PROJECT-REF`
values, or Metro was started before you saved `.env`. Fill in the two
required variables (step 6) and restart `npx expo start` (env vars are only
read at server start).

**`npx expo install --check` or `npx tsc --noEmit` reports errors right after
`npm install`**
Run `npx expo install --fix`, then `npx tsc --noEmit` again. If errors remain,
delete `node_modules` and `package-lock.json` and run `npm install` again.

**Expo Go on your phone can't reach the dev server ("Something went wrong")**
Your phone and computer must be on the same Wi-Fi network, and that network
must allow device-to-device traffic (some public/office/guest Wi-Fi blocks
this). Use `npx expo start --tunnel` as a fallback — it's slower but works
over any network.

**Push notifications never arrive**
Expected on Android + Expo Go (unsupported since SDK 53) — see step 11 for a
dev build. On iOS Expo Go, confirm `EXPO_PUBLIC_EAS_PROJECT_ID` is set and
the app was backgrounded (not force-closed) when the push was sent.

**Maps don't render on a real Android build (but work fine in Expo Go)**
You need `GOOGLE_MAPS_ANDROID_API_KEY` — see step 12.

**Admin link never appears after step 7's SQL**
Reload the app fully (not just navigate back) so the profile is re-fetched,
or sign out and back in. Double-check the `username` in the `update`
statement matches exactly (usernames are case-sensitive as stored, though
sign-up lowercases them).
