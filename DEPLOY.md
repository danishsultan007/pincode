# Deploying pincode: closed beta → Google Play

Ordered runbook. Steps marked **(you)** need your accounts, payments or identity; everything else is already in the repo.
Stack: Supabase Cloud (backend), EAS (Android builds), Cloudflare Pages (web), Play Console (distribution).

> Run commands from the repo root in PowerShell unless a step says `mobile/`. Use `npx.cmd` / `npm.cmd` if PowerShell blocks scripts.

---

## 0. Before anything else: security patches (done in code, **you** apply them)

The sign-in leak and account-deletion fixes need the SQL + Edge Functions deployed. See section 3 for the production project; for your current dev project:

1. Supabase SQL editor: run `supabase/PATCH_login_throttle.sql`, then `supabase/PATCH_terms_feedback.sql`.
2. `supabase login`, `supabase link --project-ref <ref>`, then:
   ```bash
   supabase functions deploy login-with-identifier --no-verify-jwt
   supabase functions deploy request-password-reset --no-verify-jwt
   supabase functions deploy delete-account
   ```
3. Test username sign-in and Settings → Delete account (on a throwaway account).
4. Then run `supabase/PATCH_login_lockdown.sql` (removes the email-leaking function).

---

## 1. Accounts to open (you)

| Service | Why | Cost |
|---|---|---|
| Expo (expo.dev) | EAS builds + OTA updates | free |
| Supabase | production backend | free → Pro $25/mo before public launch |
| Domain (Cloudflare Registrar) | legal pages URL, email sending | ~₹900/yr |
| Cloudflare | Pages hosting for web build | free |
| Resend (resend.com) | auth emails (Supabase default email is rate-limited to a handful/hour) | free (3,000/mo) |
| Firebase | FCM push on Android | free |
| Google Cloud | OAuth client + Maps API key | free tier |
| Sentry | crash reports | free |
| Google Play Console | already paid ✔ | one-time $25 |

---

## 2. Domain + support mailbox (you)

Buy a domain (e.g. `pincode.app` if available, or any). Then:

- Create a real mailbox for support (Cloudflare Email Routing forwards `support@yourdomain` to your Gmail for free).
- In `mobile/src/lib/constants.ts` set `SUPPORT_EMAIL`; in `mobile/src/lib/legal.ts` set `LEGAL_ENTITY` and `GRIEVANCE_OFFICER` (India's IT Rules require a named Grievance Officer).
- **Have the Terms/Privacy text in `mobile/src/lib/legal.ts` reviewed** — it is a draft, not legal advice.

---

## 3. Production Supabase project (you)

1. New project, region **Mumbai (ap-south-1)**, name `pincode-prod`. Save the DB password.
2. SQL editor: run `supabase/RUN_ALL_MIGRATIONS.sql` (includes everything through the login lockdown). **Never run `seed.sql` or `tests/` here** — they create fake users.
3. Deploy the functions (CLI linked to the *prod* ref):
   ```bash
   supabase link --project-ref <prod-ref>
   supabase functions deploy login-with-identifier --no-verify-jwt
   supabase functions deploy request-password-reset --no-verify-jwt
   supabase functions deploy delete-account
   ```
4. Dashboard → Advisors: clear every Security and Performance warning.
5. Authentication → Providers: Email on, **Confirm email on**.
6. Authentication → URL Configuration: Site URL `https://<your-domain>`; Redirect URLs `https://<your-domain>/**` and `pincode://**`. Remove localhost / `exp://` entries.
7. After you sign up in the production app, make yourself admin in the SQL editor:
   ```sql
   update profiles set role = 'admin' where username = 'your_username';
   ```

### 3a. Email via Resend
Resend → add domain → add the DNS records (SPF, DKIM) at Cloudflare → create API key. Supabase → Authentication → SMTP Settings: host `smtp.resend.com`, port 465, user `resend`, password = API key, sender `no-reply@<your-domain>`. Then Authentication → Rate Limits: raise "emails sent" to ~100/hour.

### 3b. Google sign-in
Google Cloud → APIs & Services → Credentials → OAuth client ID (type **Web**). Authorized redirect URI: `https://<prod-ref>.supabase.co/auth/v1/callback`. Paste client ID + secret into Supabase → Authentication → Providers → Google. OAuth consent screen: set publishing status to **In production** (basic scopes need no verification; in "Testing" only listed users can sign in).

---

## 4. Web build on Cloudflare Pages (you)

Cloudflare → Workers & Pages → Create → Pages → connect the GitHub repo `danishsultan007/pincode`:

- Root directory: `mobile`
- Build command: `npm install --no-audit --no-fund && npm run export:web` (not `npm ci`: the lockfile is written by npm 11 locally and Cloudflare's npm 10 reports an optional `react-native-worklets` peer as missing, so `npm ci` fails; `npm install` honors the lock and fills it in)
- Output directory: `dist`
- No `_redirects` file is needed: with no `404.html`, Pages serves `index.html` for unknown paths. After the first deploy, open `/privacy` and `/delete-account` directly to confirm.
- Environment variables (Production *and* Preview): `NODE_VERSION=22` (the Supabase client requires Node 22+), `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (prod values), `EXPO_PUBLIC_WEB_URL=https://<your-domain>`, `EXPO_PUBLIC_APP_ENV=production`.
- Attach your custom domain.
- Set the Pages **production branch** to `production` (Settings → Builds & deployments), not `main`. Release web with `git push origin main:production` after the prod DB step.

`EXPO_PUBLIC_*` values are baked in at build time — change one, redeploy.

Public URLs Play needs: `https://<domain>/privacy` and `https://<domain>/delete-account`.

---

## 5. Android: EAS, Firebase, Maps (you)

### 5a. EAS project
```bash
cd mobile
npm i -g eas-cli
eas login
eas init
```
`eas init` prints a project ID (it can't edit `app.config.ts` itself). **Paste it as a literal** into `mobile/app.config.ts` — `const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID || '<uuid>'` — and your Expo username into `EAS_OWNER` the same way. They can't come from EAS env vars (EAS needs them to find the project), and `.env` isn't uploaded to build workers. **Do this before the first build**, or updates and push won't work.

### 5b. Firebase (push)
Firebase console → new project → add Android app, package `com.pincode.app` → download `google-services.json`. Then:
```bash
eas env:create --environment production --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
eas env:create --environment preview    --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```
(Keep the file out of git — it's already in `mobile/.gitignore`.) Firebase → Project settings → Service accounts → generate a private key, then `eas credentials` → Android → production → Google Service Account Key for **FCM V1** → upload it.

### 5c. Maps key
Google Cloud → enable **Maps SDK for Android** → create an API key → restrict it to that API and to Android apps: package `com.pincode.app` with **two** SHA-1 fingerprints — the EAS upload key (`eas credentials` shows it) and, after your first Play upload, the **Play App Signing** key (Play Console → Setup → App signing). Without the second, maps are blank in Play builds.

### 5d. Environment variables
Plaintext (not secret) for both `preview` and `production`; swap the values for the prod project:
```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value https://<prod-ref>.supabase.co --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>                       --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_WEB_URL           --value https://<your-domain>            --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_APP_ENV           --value production                       --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SENTRY_DSN        --value <sentry-dsn>                     --visibility plaintext
eas env:create --environment production --name GOOGLE_MAPS_ANDROID_API_KEY   --value <maps-key>                       --visibility secret
eas env:create --environment production --name SENTRY_AUTH_TOKEN             --value <token>                          --visibility secret
eas env:create --environment production --name SENTRY_ORG                    --value <org>                            --visibility plaintext
eas env:create --environment production --name SENTRY_PROJECT                --value <project>                        --visibility plaintext
```
Repeat with `--environment preview` (use `EXPO_PUBLIC_APP_ENV=preview`). Sentry is optional: skip the Sentry lines to disable it.

### 5e. Builds
```bash
eas build -p android --profile preview      # APK — install link/QR for friends while Play verifies you
eas build -p android --profile production   # AAB — for Play Console
```
Smoke-test the preview APK: sign up, confirm email, Google sign-in, post with photo, map, push notification, DM, delete account.

---

## 6. Google Play Console (you)

1. **Create app**: name `pincode`, default language English (India), App, Free.
2. **Policy → App content** — all of these before the first track release:
   - **Privacy policy**: `https://<domain>/privacy`
   - **App access**: login required — add reviewer credentials (create a dedicated test account with a confirmed email) in the instructions.
   - **Ads**: none.
   - **Content rating**: questionnaire → Social/communication app; users interact and share content: **yes**; shares location: **yes**; no violence/gambling/drugs. Expect ~Teen.
   - **Target audience**: 18+ only.
   - **Data safety** (all: encrypted in transit, users can request deletion, *not sold*, *not shared for ads*):

     | Data type | Collected | Purpose |
     |---|---|---|
     | Approximate + precise location | yes | app functionality |
     | Name, email, phone number, user IDs | yes | app functionality, account management |
     | Photos | yes | app functionality (post/profile images) |
     | Messages, other user-generated content | yes | app functionality |
     | Crash logs, diagnostics | yes (Sentry) | analytics / fix crashes |
     | Device or other IDs (push token) | yes | app functionality (notifications) |
   - **Account deletion**: in-app (Settings → Delete account) + web `https://<domain>/delete-account`.
   - **User-generated content**: declare that the app has UGC with report/block/moderation (all built).
   - **Permissions**: location is foreground-only — no background-location declaration. Photos use the system picker (media permissions are blocked in `app.config.ts`).
3. **Store listing**: upload from `mobile/store/` — `play-icon-512.png` (icon) and `feature-graphic-1024x500.png`. Add 4–8 phone screenshots (1080×1920) taken on a real phone: feed, map, a post, DMs, communities. Category **Social**. Contact email = support mailbox.
   - Short (≤80): *Ask your neighborhood anything — posts, alerts and chats near you.*
   - Full: describe asks/offers/alerts, map, communities, DMs, moderation + safety, "built for Bengaluru neighborhoods, starting in Mahadevapura".
4. **Testing → Closed testing** (track "Alpha"): create a testers list from a **Google Group** (create one at groups.google.com, set "anyone can join" or add emails). Upload the first AAB **manually** (Create release → upload `.aab` from the EAS build page). Later builds can go through `eas submit -p android --profile production` once you create a Play service-account key (Play Console → API access).
5. After the first upload: copy the **App signing SHA-1** into the Maps key restriction (step 5c).
6. **The 12-testers rule.** Personal developer accounts created after Nov 2023 must run a closed test with **at least 12 testers opted in for 14 continuous days** before applying for production access. Recruit 25+ so drop-outs don't reset the clock. **Verify the current numbers in Play Console help.** Meanwhile this closed test *is* your 50–100 person beta.
7. After 14 days: Play Console → Production → Apply for access (answer the questionnaire), then release with a **staged rollout** (10% → 50% → 100%).

---

## 7. Running the beta

- **Seed the neighborhood** before inviting anyone: you + 3–5 helpers post 40–60 real posts across Hoodi, Whitefield, KR Puram, Brookefield, Mahadevapura.
- Collect feedback: Settings → Send feedback (read it in Settings → Admin → Feedback inbox), a WhatsApp group for the testers, a 5-question form on day 7 and 14.
- Moderate daily: Admin → Moderation queue. You committed to reviewing reports within 24 hours.
- Ship JS-only fixes without a Play review:
  ```powershell
  .\scripts\publish-ota.ps1 -Channel production -Message "fix: ..."
  ```
  The script runs the pre-release checks, keeps your local `mobile/.env` (the *dev* Supabase project) out of the bundle, and verifies the result. Native/config changes need a new build + version bump. See `RELEASING.md` for the full flow.
- Backups: add repo secrets `SUPABASE_DB_URL` (session-pooler URL) and `BACKUP_PASSPHRASE` (GitHub → Settings → Secrets → Actions); `.github/workflows/backup.yml` then dumps and encrypts nightly. **Keep the repo private.** Upgrade Supabase to **Pro** before the production rollout (the free plan has no backups and pauses after 7 idle days).

## 8. Known follow-ups

- `email_available()` (sign-up form) reveals whether an email is registered. Remove it before public launch and rely on the `signUp` response.
- The Nominatim geocoder is rate-limited (1 req/s); fine for the beta, cache results if usage grows.
- iOS is not part of this plan (needs an Apple Developer account, $99/yr).
