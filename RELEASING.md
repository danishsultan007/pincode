# Releasing pincode

How a change gets from your laptop to testers' phones, every milestone. For the one-time setup (accounts, Play Console, Firebase, etc.) see `DEPLOY.md`.

## The two Supabase projects

| Project | Ref | Used by |
|---|---|---|
| `pincode-dev` (Mumbai) | `dmbkyzdkmpyqgyyvcygs` | your laptop (`mobile/.env`), `run.ps1`, ngrok. Experiments are fine here. |
| `pincode-prod` (Mumbai) | `jfvnahkskwhxgefmoiaz` | EAS `preview` and `production` builds, i.e. testers. Don't experiment here. |

The Supabase CLI is linked to **dev** by default. Anything aimed at prod names the project explicitly (`--project-ref` or `--db-url`).

## The milestone flow

```
 1 PLAN        Opus plans the milestone: scope, files, risks
 2 BUILD       Sonnet writes the code
 3 REVIEW      Opus reviews; Sonnet fixes what it finds
 4 TEST ON DEV app -> pincode-dev (run.ps1 / ngrok); DB changes and functions go to dev first
 5 SAVE        git commit + push; tag the milestone (e.g. v1.1.0)
 6 DECIDE      JavaScript-only change?  -> 7A OTA update
               native change?           -> 7B new build for Play
 8 PROD        database / functions to pincode-prod, BEFORE the app update
 9 WATCH       feedback inbox, moderation queue, Sentry
10 TELL        short note to testers: what's new, what to try
```

### 6. Which path? OTA update vs new build

The app has two layers. The **native shell** (Android code, permissions, icon, native libraries) is installed from Play and only changes with a new build. The **JavaScript layer** (everything in `mobile/src`) runs inside the shell and can be swapped over the air.

| Change | Path |
|---|---|
| Screens, logic, text, styles, bug fixes, images imported in code, JS-only libraries | **OTA update** |
| Supabase URL / keys (`EXPO_PUBLIC_*` are baked into the bundle) | **OTA update**, with the right `--environment` |
| New package with native code, `app.config.ts` changes (permissions, plugins, icon, splash, package name, scheme, `google-services.json`, Maps key), Expo SDK / React Native upgrade | **New build** |
| Database migration or Edge Function only | Deploy to Supabase (step 8); no app update unless the app code changed too |
| Play Console forms (listing, Data safety, content rating), tester list | Play Console only |

### 7A. OTA update

No Play review, no reinstall, no build quota used.

```powershell
cd "C:\Users\Danish Sultan\Documents\Mohalla\mobile"
npx.cmd eas-cli update --channel production --environment production --message "what changed"
```

- **Always pass `--environment production`.** Without it the bundle is built with your local `mobile/.env` (the *dev* project).
- To update the preview APK instead: `--channel preview --environment preview`.
- How it reaches phones: the update is published to a **channel** (`production`); each build is tied to a channel in `eas.json`. A build also has a **runtime version** (our app `version`, via `runtimeVersion: { policy: 'appVersion' }`); an update only goes to builds with a matching runtime version. When a tester opens the app it checks for an update, downloads it in the background, and applies it on the **next start**. Testers often see the change after opening the app twice.

### 7B. New build for Google Play

1. **Bump `version`** in `mobile/app.config.ts` (e.g. `1.0.0` -> `1.1.0`). Do this *only* for native changes: OTA updates only reach builds with the same version, so an old build never receives code written for a newer native shell. EAS raises the build number (`versionCode`) itself.
2. Build a **preview APK** and check it on your phone:
   ```powershell
   cd "C:\Users\Danish Sultan\Documents\Mohalla\mobile"
   npx.cmd eas-cli build -p android --profile preview
   ```
3. Build the production bundle (AAB):
   ```powershell
   npx.cmd eas-cli build -p android --profile production
   ```
4. Upload the `.aab` to Play Console -> Testing -> Closed testing -> Create new release (or `eas submit -p android --profile production` once a Play service-account key exists). It reaches testers after Play's review (hours to a couple of days).
5. Add release notes ("What's new") in the release.

### 8. Database and functions to production

Do this **before** the app update that needs it. Old app versions are still on testers' phones, so changes must be **additive** (add a column or table; don't rename or drop one). A rename or removal takes two releases: add the new thing and ship the app that uses it, then remove the old thing in a later release.

- Migrations: new file in `supabase/migrations/` (also append to `RUN_ALL_MIGRATIONS.sql` and add a `PATCH_*.sql` copy, as before). Apply to dev first, test, then prod: `supabase db push` against each project.
- Edge Functions: `supabase functions deploy <name> --project-ref <ref> --use-api` (add `--no-verify-jwt` for `login-with-identifier` and `request-password-reset`). Dev first, then prod.
- **Before a risky migration:** run the backup (GitHub -> Actions -> Nightly database backup -> Run workflow).

### 9. Watch

For a day after each release: Settings -> Admin -> **Feedback inbox**, the **Moderation queue**, and **Sentry** (once `EXPO_PUBLIC_SENTRY_DSN` is set).

### 10. Tell testers

One short message in the testers' group: what's new, what to try, how to send feedback (Settings -> Send feedback). Remind them periodically that beta data may be reset.

## If something goes wrong

| Problem | Fix |
|---|---|
| Bad OTA update | Publish the previous good version again with `eas update` (or `eas update:rollback`); phones recover on their next start |
| Bad database migration | Restore from the latest backup, or ship a fix migration |
| Bad Play build | Halt the rollout in Play Console, upload a fixed build; OTA can often patch faster |
| A tester can't sign in | Check Supabase -> Authentication -> Users and Logs -> Auth |

## EAS free-tier limits (check expo.dev -> Usage for the real numbers)

- **Builds:** a small monthly allowance (around 30), in a slower shared queue. This is the limit you can feel, so use OTA for fixes and keep full builds for native changes.
- **OTA updates:** counted by monthly active users (around 1,000 on the free plan). 50-100 testers is far below it.

## Supabase free-plan notes (long closed beta)

- A free project pauses after about 7 days with no activity; testers' use normally prevents that. If it pauses, resume it in the dashboard.
- No automatic backups on free: keep the nightly backup workflow running (repo secrets `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`).
- Upgrade to Pro (about $25/month) when testers' data matters or before the public launch.
- Gmail SMTP is fine at beta volume. Move to a proper sender (Resend/Brevo with your own domain) before launch.

## Tools: Expo CLI vs EAS CLI

- **Expo CLI** (`npx.cmd expo ...`, and `run.ps1`): runs on your laptop. Dev server, `expo install`, `expo-doctor`.
- **EAS CLI** (`npx.cmd eas-cli ...`): runs against Expo's cloud. Builds, OTA updates, signing keys, environment variables, store submission. Needs `eas-cli login`.
