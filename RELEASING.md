# Releasing pincode

How a change gets from your laptop to testers' phones, every milestone. For the one-time setup (accounts, Play Console, Firebase, etc.) see `DEPLOY.md`. What testers and Play are told lives in `CHANGELOG.md`.

Commands assume PowerShell from the repo root (`C:\Users\Danish Sultan\Documents\Mohalla`) unless a block does `cd mobile`. Items marked **(unverified)** are my understanding and should be checked before you rely on them.

Contents: 1 Backends | 2 Release types | 3 Versioning | 4 Changelog | 5 Promotion path and scripts | 6 Database rules | 7 Edge Functions | 8 Minimum-version gate | 9 Play closed testing | 10 After release | 11 Rollbacks | 12 Cadence and housekeeping | 13 Definition of done

---

## 1. The two Supabase projects and which build uses which

| Project | Ref | Used by |
|---|---|---|
| `pincode-dev` (Mumbai) | `dmbkyzdkmpyqgyyvcygs` | your laptop (`mobile/.env`), `run.ps1`, ngrok, EAS `development` profile. Experiments are fine here. |
| `pincode-prod` (Mumbai) | `jfvnahkskwhxgefmoiaz` | EAS `preview` and `production` profiles/channels, i.e. every tester. Don't experiment here. |

| EAS profile | Channel | EAS environment | Backend |
|---|---|---|---|
| `development` | `development` | `development` | dev |
| `preview` (APK) | `preview` | `preview` | **prod** |
| `production` (AAB) | `production` | `production` | **prod** |

Preview is the **release-candidate lane running against prod data**. That is safe only because every migration is additive and goes to prod *before* the app that needs it (section 6), so a preview build never meets a schema it doesn't understand.

The Supabase CLI in this repo is linked to **dev** (`supabase/.temp/project-ref`). Anything aimed at prod names the target explicitly (`--project-ref` or `--db-url`). `release-check.ps1` fails if the link points anywhere else.

Local secrets (gitignored, in `.secrets\`): `pincode-dev-db-password.txt` (dev DB password) and `prod-db-url.txt` (full prod Postgres URL). Never paste their contents into chat, commits or logs.

---

## 2. Release types and decision table

The app has two layers. The **native shell** (Android code, permissions, icon, native libraries) is installed from Play and only changes with a new build. The **JavaScript layer** (`mobile/src`) runs inside the shell and can be swapped over the air.

| What changed | Release type | Version bump | Tag | Order |
|---|---|---|---|---|
| Screens, logic, text, styles, bug fixes, JS-only libraries, `EXPO_PUBLIC_*` values | **OTA** | none | `v1.1.0+ota.N` | DB/functions to prod first, then `publish-ota.ps1` |
| New native package, `app.config.ts` change (permissions, plugins, icon, splash, package, scheme, `google-services.json`, Maps key), Expo SDK / React Native upgrade | **Native build** | **bump `version`** | `v1.1.0` | DB/functions first, build, Play, then raise the min-version gate if needed |
| Migration only | **DB** | none | `db-YYYYMMDD` | dev, test, backup, prod |
| Edge Function only | **Function** | none | `db-YYYYMMDD` | dev, test, prod |
| Play listing, Data safety, content rating, tester list | **Play Console only** | none | none | Console only |
| Urgent fix while `main` has unreleased work | **Hotfix** | none for OTA | `v1.1.0+ota.N` | section 3 recipe |

Tag examples: `v1.1.0` (native), `v1.1.0+ota.3` (third OTA on 1.1.0), `db-20261015` (DB/function-only release). Tag after release, from the exact commit you released, then `git push origin --tags`.

---

## 3. Versioning

- **`version` in `mobile/app.config.ts` is the only source of truth.** It is also the OTA **runtime version** (`runtimeVersion: { policy: 'appVersion' }`): an OTA update reaches only builds with the *same* `version`. `mobile/package.json` "version" is **unused**; ignore it.
- `version` changes **only together with a native build**. Bumping it for a JS-only change would strand every installed build (they would never get the update).
- `versionCode` / build number is **EAS-managed** (`appVersionSource: remote`, `autoIncrement` on production). **Never edit it.**
- A rollback of a Play build is **always a NEW build** (Play rejects reused or lower version codes). See section 11.
- Beta semver: `1.MINOR.PATCH`. Native build with new features: bump MINOR (`1.1.0`). Native build that only fixes native/config problems: bump PATCH (`1.1.1`). Stay on `1.x` through the beta; `2.0.0` is for the public launch if at all.
- Remember each new `version` is a new runtime: testers on the old build get no more OTAs until they install the new one. Raise the min-version gate (section 8) only after the new build is on Play.

### Hotfix when `main` has unreleased work

Branch from the tag of what testers are running, fix there, release from the branch, merge back.

```powershell
git switch -c hotfix/1.1.0 "v1.1.0+ota.3"
# ...fix, commit...
git push -u origin hotfix/1.1.0
.\scripts\publish-ota.ps1 -Channel production -Message "hotfix: ..."
git tag -a "v1.1.0+ota.4" -m "OTA: hotfix ..."
git push origin --tags
git switch main
git merge hotfix/1.1.0
git push
```

`release-check.ps1` accepts `main` and `hotfix/*`. If the hotfix needs a native change, bump `version` on the branch and follow the native-build flow from there.

---

## 4. Changelog

`CHANGELOG.md` has, per release, **Testers** (paste to WhatsApp), **Play** (500 chars max, native builds only) and **Internal** (migrations, functions, risks). Write the entry during **PLAN**, review it in **REVIEW**, adjust at release time. Keep `## Unreleased` at the top for work in flight; rename it to the version when you ship. `release-check.ps1` warns if no heading contains the current version.

---

## 5. Promotion path and the scripts

```
 1 PLAN        Opus plans the milestone: scope, files, risks; write the CHANGELOG entry
 2 BUILD       Sonnet writes the code
 3 REVIEW      Opus reviews code and CHANGELOG; Sonnet fixes what it finds
 4 TEST ON DEV app -> pincode-dev (run.ps1 / ngrok); DB changes and functions go to dev first
 5 SAVE        git commit + push to main
 6 DECIDE      section 2 table: OTA / native build / DB / function
 7 PROD DB     backup, then migrations and functions to pincode-prod, BEFORE the app update (sections 6-7)
 8 RELEASE     publish-ota.ps1  or  eas build + Play (section 9)
 9 TAG         v1.1.0 / v1.1.0+ota.N / db-YYYYMMDD, push tags
10 VERIFY      smoke test, then watch 24 h (section 10)
11 TELL        paste the Testers bullets to WhatsApp (after Play shows "Available" for native builds)
```

### release-check.ps1

Read-only. Runs every check (never stops early), prints `PASS` / `WARN` / `FAIL` / `INFO`, then `RESULT: PASS (n warnings)` or `RESULT: FAIL (n failed)`; exit code 1 on any FAIL.

```powershell
.\scripts\release-check.ps1 -Mode Ota                        # before an OTA
.\scripts\release-check.ps1 -Mode Build                      # before eas build
.\scripts\release-check.ps1 -Mode Db                         # before a DB / function release
.\scripts\release-check.ps1 -Mode Ota -Environment preview   # check the preview EAS env
```

| Check | Meaning |
|---|---|
| Branch | on `main` or `hotfix/*` |
| Working tree | nothing uncommitted (the release must be reproducible from a commit) |
| Pushed | HEAD equals upstream (no unpushed or unpulled commits) |
| Typecheck | `npm run typecheck` in `mobile` |
| expo-doctor | Expo's project health check |
| expo install --check | installed packages match what the Expo SDK expects (report only; fix with `npx.cmd expo install --fix`) |
| npm audit | WARN only, see below |
| Supabase CLI link | CLI is linked to dev, not prod |
| Dev migrations | no local migration is pending on dev |
| Prod migrations | Ota/Build mode: **FAIL if any pending** (DB goes first). Db mode: lists pending as INFO |
| RUN_ALL in sync | every migration file has its `-- ---- <file> ----` header in `RUN_ALL_MIGRATIONS.sql` |
| EAS login | logged in as `danishsultan007` |
| EAS env | the chosen environment's `EXPO_PUBLIC_SUPABASE_URL` is prod, not dev |
| Version vs builds | Ota: `version` must equal the latest build's `appVersion` (else no installed build gets the OTA). Build: WARN if unchanged (forgot to bump?) |
| CHANGELOG | a heading contains the current version |

**Reading audit WARNs.** `npm audit` on this project reports many high findings in Expo, Metro, the CLI and build tooling. Those packages run on your laptop or build workers and **never ship in the app**: treat them as noise. Act only when a package that runs *inside* the app (`@supabase/supabase-js`, `@tanstack/react-query`, etc.) has a high/critical issue **with a fix available in the allowed version range** (then update that package and test). Never run `npm audit fix --force`; it can jump major versions and break the SDK pairing.

### publish-ota.ps1

```powershell
.\scripts\publish-ota.ps1 -Channel production -Message "fix: feed crash on empty communities"
.\scripts\publish-ota.ps1 -Channel preview    -Message "try new map pins"
```

What it does: (1) runs `release-check.ps1 -Mode Ota -Environment <channel>` and stops on failure; (2) renames `mobile\.env` to `.env.devbak` (restored in a `finally`) and **exports** the bundle under the EAS environment: `npx.cmd eas-cli env:exec <channel> "npx expo export --platform android --output-dir dist"` (`EXPO_PUBLIC_*` values are baked in at export time, so the export must run with the EAS variables loaded); (3) **scans `mobile\dist` before anything is published**: the dev ref must be absent and the prod ref present, otherwise it aborts with nothing live; (4) only then publishes exactly that bundle: `npx.cmd eas-cli update --skip-bundler --input-dir dist -p android --channel <c> --environment <c> --message "..." --non-interactive`; (5) reminds you about Sentry source maps if `SENTRY_AUTH_TOKEN` is set; (6) prints the tag commands (`v<version>+ota.N`) and the rollback command.

`-Message` must not contain `" & | < > ^ %` (npx.cmd re-parses arguments through cmd.exe); the script refuses such a message. **Unverified:** `env:exec` and `expo export` were each checked on their own and the `--skip-bundler --input-dir` flags come from `--help`, but the full export-then-publish chain has not been run end to end; watch the first real run (and `-p android` assumes an Android-only app).

`-SkipChecks` exists for a genuine emergency hotfix only; it prints a loud warning and still runs the bundle guard.

How it reaches phones: a build checks its channel for an update on launch, downloads it in the background, and applies it on the **next** start, so testers often see changes after opening the app twice.

---

## 6. Database rules

**Expand / contract.** Old app versions stay on phones for weeks, and an OTA can't reach older native builds, so the database must work for every app version still in use.

- Allowed any time (**expand**): new tables, new nullable columns or columns with defaults, new indexes, new functions, new RLS policies that don't remove access.
- Only after the min-supported-version gate (section 8) blocks **every** app version that still uses the old object (**contract**): renames, drops, `NOT NULL` on existing columns, function signature changes, removing policies. This takes two releases: ship the new thing, raise the gate, then remove the old thing.

**Files.** Name migrations `YYYYMMDDHHMMSS_name.sql` in `supabase/migrations/`, and append the same SQL to `supabase/RUN_ALL_MIGRATIONS.sql` under a header line `-- ---- <file> ----` (`release-check.ps1` verifies this). **Stop creating new `PATCH_*.sql` copies**; existing ones stay as history.

**Order.**

1. Dev (CLI is linked to dev):
   ```powershell
   $devpw = (Get-Content .secrets\pincode-dev-db-password.txt -Raw).Trim()
   npx.cmd supabase db push --linked --dry-run -p $devpw
   npx.cmd supabase db push --linked -p $devpw
   ```
2. Test the app against dev.
3. Trigger a backup and wait for it:
   ```powershell
   gh workflow run backup.yml --repo danishsultan007/pincode
   gh run watch --repo danishsultan007/pincode
   ```
4. Prod:
   ```powershell
   $produrl = (Get-Content .secrets\prod-db-url.txt -Raw).Trim()
   npx.cmd supabase db push --db-url $produrl --dry-run
   npx.cmd supabase db push --db-url $produrl
   ```
5. Verify (both read-only):
   ```powershell
   npx.cmd supabase migration list --db-url $produrl
   .\scripts\release-check.ps1 -Mode Db
   ```
   Then in the prod SQL editor, spot-check the new object, e.g. `select column_name from information_schema.columns where table_name = 'posts';` or `select proname from pg_proc where proname = 'new_function';`, and run the Advisors page for new Security warnings.

### Security regression tests

After every migration run both test files on dev, and again before any prod push:

```powershell
npx.cmd supabase db query --linked --file supabase/tests/security_rpc_access.sql
npx.cmd supabase db query --linked --file supabase/tests/null_auth_checks.sql
```

The success signal is an error message beginning with `ALL ... PASSED` (the scripts raise it on purpose so nothing is left behind). Any other error is a failing check: fix it with a forward migration before continuing.

### Incident runbook

- **Leaked anon key:** the anon key is public by design, so RLS and grants are the real protection. Rotating the JWT secret logs everyone out and needs an OTA with the new key; prefer migrating to the new publishable/secret API keys, which can be rotated individually.
- **Leaked service-role key:** rotate immediately in the Supabase dashboard, then redeploy all Edge Functions and update anywhere it was stored.
- **Leaked DB password:** reset it in Settings > Database, then update `.secrets\*` and the GitHub secret `SUPABASE_DB_URL`.
- **Ban a user:** `admin_issue_strike` with a severe strike, or Auth > Users > Ban user in the dashboard.
- **Take content down:** Admin > moderation queue > remove.
- **Abusive account flood:** temporarily disable sign-ups in Auth settings, clean up, then re-enable.
- **Compromised Expo/EAS token:** revoke it at expo.dev > Access tokens and create a new one.

**Rollback = forward-fix migration.** Free plan has no point-in-time recovery. Write a new migration that undoes or repairs the change. Restore data from the nightly encrypted dump **only** for real data loss, and restore selectively (the affected tables), never the whole database over live data.

---

## 7. Edge Function rules

Functions: `login-with-identifier`, `request-password-reset` (both `--no-verify-jwt`), `delete-account`. Keep request/response shapes **additive** (new optional fields; never remove or rename fields old apps send or read).

Dev first, test, then prod:

```powershell
# dev
npx.cmd supabase functions deploy login-with-identifier --no-verify-jwt --use-api --project-ref dmbkyzdkmpyqgyyvcygs
npx.cmd supabase functions deploy request-password-reset --no-verify-jwt --use-api --project-ref dmbkyzdkmpyqgyyvcygs
npx.cmd supabase functions deploy delete-account --use-api --project-ref dmbkyzdkmpyqgyyvcygs

# prod (same commands, prod ref)
npx.cmd supabase functions deploy login-with-identifier --no-verify-jwt --use-api --project-ref jfvnahkskwhxgefmoiaz
npx.cmd supabase functions deploy request-password-reset --no-verify-jwt --use-api --project-ref jfvnahkskwhxgefmoiaz
npx.cmd supabase functions deploy delete-account --use-api --project-ref jfvnahkskwhxgefmoiaz
```

Deploy only the functions you changed. If you changed `supabase/functions/_shared`, redeploy every function that imports it.

**Rollback:** restore the last good source from a tag, then redeploy:

```powershell
git restore --source <tag> supabase/functions/<name> supabase/functions/_shared
npx.cmd supabase functions deploy <name> [--no-verify-jwt] --use-api --project-ref jfvnahkskwhxgefmoiaz
```

Afterwards, commit the restored files (or `git restore` back to HEAD if you only needed a temporary revert) so the repo matches what is deployed.

---

## 8. The minimum-supported-version gate

A table `app_config` holds `min_supported_version` and `message`. The app reads it at launch and whenever it returns to the foreground. If its own `version` is lower than the minimum it shows a blocking **"Update required"** screen with a link to Play. If the check fails (offline, error) it **fails open**: the app works normally.

Raise it (run on **PROD only**, and only **after the new build shows Available on Play**, otherwise testers are locked out with nothing to install):

```sql
update app_config set min_supported_version = '1.2.0', message = 'Please update pincode to keep using it.' where id;
```

Use it for: contract-phase migrations (section 6), a security fix that can't be patched over the air, or a function change old apps can't handle. Don't use it for a normal feature release.

Interaction with OTA: OTA never changes the native `version` (runtime version), so an OTA cannot satisfy the gate. Only a new native build can. An OTA *can* ship the gate itself to existing builds (that is how it reaches 1.0.0), but old builds that predate the gate code are not protected by it.

---

## 9. Play Console closed-testing flow

Native builds only (OTA updates never go through Play).

1. `.\scripts\release-check.ps1 -Mode Build`, bump `version` in `mobile/app.config.ts`, commit and push.
2. Build:
   ```powershell
   cd mobile
   npx.cmd eas-cli build -p android --profile preview      # optional APK check on your phone
   npx.cmd eas-cli build -p android --profile production   # AAB for Play
   ```
3. Play Console -> Testing -> Closed testing -> Create new release; upload the `.aab` (or `npx.cmd eas-cli submit -p android --profile production` once a service-account key exists; `eas.json` submits to track `alpha` as a **draft**).
4. Paste the **Play** text from `CHANGELOG.md` into "What's new" (en-IN, 500 chars max). Review and roll out.
5. Wait for Play review (hours to a couple of days). **Only when Play shows the release as Available** send the **Testers** bullets from `CHANGELOG.md` to WhatsApp, with the Play opt-in link and "update from Play".
6. Tag `v1.1.0`, push tags. Raise the min-version gate if the release requires it (section 8).

Notes:
- **Preview APK testers.** Anyone who installed the 1.0.0 *preview APK* (sideloaded, signed with the EAS keystore) cannot update in place to the Play-signed build (different signing key): they must uninstall first, which loses local app data. Raising `min_supported_version` also blocks preview-channel APKs. So invite testers to install from Play (the closed-testing link) from the start, not the preview APK.- **Staged rollout** (10% -> 50% -> 100%) exists only on the **production track**. The closed track releases to all your testers at once.
- **Halting a release** on a closed track: I am unsure whether "Halt" exists there. The reliable fix is the same on every track: upload a new build with a fixed (higher) `version`/code, optionally ship an OTA for JS-only fixes.
- **12 testers / 14 days clock** (personal account rule for production access): my understanding is that uploading new builds to the closed track does **not** reset the clock, but **verify on the Play Console Dashboard** (the production-access checklist shows the live count and days). Keep 25+ testers opted in so drop-outs don't drop you below 12. Applying for production access does **not** force a public release; you choose when to release.

---

## 10. Post-release verification

### Smoke test (you, on your own phone, right after release)

- Open the app **twice** (OTA applies on the second start); Settings -> About row shows the expected version/update.
- Sign in with email, with username, and with Google.
- Create a post with an image; see it in the feed and on the map.
- Send a DM to a second account and confirm the push notification arrives.
- Create a throwaway account and delete it (Settings -> Delete account).

### Watch for 24 hours

Settings -> Admin -> **Feedback inbox** and **Moderation queue**; **Sentry** (once `EXPO_PUBLIC_SENTRY_DSN` is set); Supabase dashboard -> Logs for API, Auth and Edge Functions.

### Rollback decision rule

Roll back if any smoke-test item fails, or a new crash affects more than one tester, or sign-in, posting or DMs are broken for anyone. Otherwise fix forward with the next OTA.

---

## 11. Rollback playbooks

All `eas-cli` syntax below was checked against `--help` for this repo's eas-cli.

### Bad OTA

Find the group id of the bad update (printed by `eas update`, or `npx.cmd eas-cli update:list`, or expo.dev -> Updates). `update:rollback` requires it to be the **latest** update for its branch and runtime version; it republishes the update before it, or the embedded bundle if there is none.

```powershell
cd mobile
npx.cmd eas-cli update:rollback <GROUPID> --message "rollback: <why>" --non-interactive
```

Alternatives:

```powershell
# republish a specific known-good group to the channel
npx.cmd eas-cli update:republish --group <GOOD_GROUPID> --message "republish good build" --non-interactive
# or republish the latest group of a channel
npx.cmd eas-cli update:republish --channel production --message "republish" --non-interactive
# go back to the JS bundle embedded in the installed build
npx.cmd eas-cli update:roll-back-to-embedded --channel production --runtime-version 1.0.0 --message "back to embedded" --non-interactive
```

(Add `-p android` to limit to Android.) Phones recover on their next start. If the bad update was a hotfix on another branch, tag the rollback too (`v1.1.0+ota.N`).

### Bad native build

A Play release can't be un-published to an older version code. Fix forward: revert or fix the code, bump `version`, make a **new** build, upload it, then (optionally) raise the min-version gate so nobody stays on the bad build. For JS-only damage, an OTA to the bad build is faster (same runtime version).

### Bad DB migration

Write a forward-fix migration (section 6). Restore only the damaged tables from the nightly dump if data was lost. Don't push a "down" script directly in the SQL editor without a migration file; the repo and prod would diverge.

### Bad Edge Function

`git restore --source <tag> ...` and redeploy (section 7).

### Wrong backend in a bundle

`publish-ota.ps1` scans the bundle before publishing and aborts if it points at the wrong backend, so nothing goes live. If a wrong-backend update ever got out some other way (a manual `eas update` without `--environment`), run `update:rollback <GROUPID>` immediately, then check the EAS environment (`npx.cmd eas-cli env:list production`).

### A tester can't sign in

Supabase -> Authentication -> Users, and Logs -> Auth / Edge Functions.

---

## 12. Cadence and housekeeping

- **OTA:** weekly or as needed. **Native build:** roughly monthly at most. Check **expo.dev -> Usage** before building.
- Each milestone: `cd mobile; npx.cmd expo install --check` (also in `release-check.ps1`).
- **SDK upgrades** only between milestones, as their own native release (new `version`, full smoke test, gate if needed).
- **Audit policy:** section 5. Noise in tooling; act only on in-app runtime packages with a fix in range.
- **Secrets hygiene:** `.secrets\` and `mobile/.env` stay out of git; never print DB URLs or keys in logs, chats or screenshots. Rotate a leaked DB password in the Supabase dashboard and update `.secrets\` and the `SUPABASE_DB_URL` GitHub secret.
- **Backups:** the nightly workflow dumps prod encrypted. Check it is alive:
  ```powershell
  gh secret list --repo danishsultan007/pincode
  gh run list --workflow backup.yml --limit 5 --repo danishsultan007/pincode
  ```
  Expect `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` and recent green runs. Do a one-time **decrypt drill**: download an artifact, decrypt it with the passphrase, and confirm the dump opens. A backup you've never decrypted is not a backup.
  **Storage images are NOT in the DB backup.** Only the database is dumped; Storage objects are not in the dump, so verify them separately after any restore.
  **After ANY restore, verify column grants** (the dump carries them, but check):
  ```sql
  select grantee, table_name, column_name, privilege_type
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'UPDATE';
  ```
  The result should be limited to the same narrow set of columns as before the restore. If it lists whole tables, re-apply the grants from the migrations before opening the app to users.
- **Supabase Pro:** upgrade (about $25/month) when tester data matters, or about 2 weeks before applying for production access. Pro adds daily backups; **(unverified)** check current Pro backup/PITR terms on the pricing page.
- **Web (Cloudflare Pages):** deploy from a `production` branch, not `main`. After the prod DB step:
  ```powershell
  git push origin main:production
  ```
  Web uses the prod backend, so the same "DB first" rule applies.
  Cloudflare builds with `npm run export:web:cf` (runs `scripts/fix-web-assets.cjs`, then checks every `/assets/...` URL exists). After a web deploy, confirm a `/assets/vendor/...ttf` URL serves a font (content-type font/ttf), not index.html.
  **Security headers:** `mobile/public/_headers` is copied into `dist` by `expo export` and read by Cloudflare Pages. The CSP ships as `Content-Security-Policy-Report-Only` first, so nothing breaks while it is tuned. After a deploy, open https://pincode-a54.pages.dev with the browser console open, use the app (map, login, images, location search) and look for "[Report Only]" violations. When clean, rename the header in `_headers` to `Content-Security-Policy` and redeploy. If you add a new external host (images, API, tiles), add it to the CSP at the same time.

### EAS free-tier limits (check expo.dev -> Usage for the real numbers)

- **Builds:** a small monthly allowance (around 30), in a slower shared queue. This is the limit you can feel, so use OTA for fixes and keep full builds for native changes.
- **OTA updates:** counted by monthly active users (around 1,000 on the free plan). 50-100 testers is far below it.

### Supabase free-plan notes (long closed beta)

- A free project pauses after about 7 days with no activity; testers' use normally prevents that. If it pauses, resume it in the dashboard.
- No automatic backups on free: keep the nightly backup workflow running (repo secrets `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`).
- Gmail SMTP is fine at beta volume. Move to a proper sender (Resend/Brevo with your own domain) before launch.

### Tools: Expo CLI vs EAS CLI

- **Expo CLI** (`npx.cmd expo ...`, and `run.ps1`): runs on your laptop. Dev server, `expo install`, `expo-doctor`.
- **EAS CLI** (`npx.cmd eas-cli ...`): runs against Expo's cloud. Builds, OTA updates, signing keys, environment variables, store submission. Needs `eas-cli login`.

---

## 13. Milestone definition of done

Copy into the milestone issue or notes:

```
[ ] CHANGELOG entry written (Testers / Play / Internal) and reviewed
[ ] Tested on dev (app -> pincode-dev), migrations/functions exercised there
[ ] Migrations additive (or gate already blocks old versions); RUN_ALL_MIGRATIONS.sql updated
[ ] Committed and pushed on main (or hotfix/*)
[ ] .\scripts\release-check.ps1 -Mode <Ota|Build|Db> -> RESULT: PASS
[ ] Backup run triggered and green (gh run watch) before prod DB change
[ ] Prod DB pushed and verified (migration list; spot-check query)
[ ] Edge Functions deployed dev -> prod (if changed)
[ ] Released: publish-ota.ps1  /  eas build + Play release
[ ] Play shows Available (native builds); Testers message sent to WhatsApp
[ ] Min-version gate raised on PROD if required (after Play Available)
[ ] Tag pushed (v1.x.y / v1.x.y+ota.N / db-YYYYMMDD)
[ ] Smoke test passed (open twice, About row, email/username/Google sign-in, post with image, DM + push, delete throwaway)
[ ] 24 h watch done: feedback inbox, moderation queue, Sentry, Supabase logs
[ ] Web released (git push origin main:production) if web changed
[ ] expo install --check clean; CHANGELOG Unreleased cleared
```
