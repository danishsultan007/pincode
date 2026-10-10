# Changelog

## How to use this file

- One entry per release, newest first. Heading format: `## v1.1.0 — 2026-11-01` (use the date it reaches testers). OTA-only releases get their own entry only if testers should hear about them; otherwise add bullets to the next entry.
- Write the entry in the **PLAN** step of the milestone and review it in **REVIEW**. Edit it at release time if scope changed.
- Each entry has three parts:
  - **Testers**: plain-language bullets. Paste straight into the WhatsApp group.
  - **Play (en-IN, max 500 chars)**: text for Play Console "What's new". Only needed for native builds uploaded to Play (OTA updates never appear in Play).
  - **Internal**: migrations, Edge Functions, config, risks, rollback notes. Never shared.
- `scripts\release-check.ps1` warns if there is no heading containing the current `version` from `mobile/app.config.ts`.
- Keep an `## Unreleased` section at the top for work that has landed but not shipped; rename it to the version when releasing.

---

## Unreleased

### Internal
- Minimum supported version gate (OTA to 1.0.0): `app_config` table with `min_supported_version` and `message`; the app shows a blocking "Update required" screen below the minimum and fails open if the check cannot run.

---

## v1.0.0 — 2026-10-10

First closed-beta build (preview APK, build 1, version 1.0.0).

### Testers
Welcome to the pincode closed beta! What you can do:
- Sign in with Google, or with email, username or phone number.
- Post to your neighbourhood with photos and a spot on the map.
- Comment on and react to posts.
- Send direct messages.
- Join communities.
- Report posts, block people, and see our moderators act on reports.
- Forgot your password? Reset it by email, username or phone. You can also change or set a password in Settings.
- Tell us what you think: Settings > Send feedback.
- Settings > Delete account removes your account and data.

Please note: this is a beta, so things will break and data may be reset. Tell us when they do.

### Play (en-IN, max 500 chars)
Welcome to the pincode closed beta. Sign in with Google, email, username or phone. Share posts with photos and a map pin, comment, react, message neighbours directly and join communities. Report or block anything that does not belong. Reset your password by email, username or phone, send feedback from Settings, or delete your account any time. Beta app: things may change or break, and your feedback helps us fix them.

### Internal
- Native build: EAS preview profile, Android APK, build 1, `version` 1.0.0 (OTA runtime version `1.0.0`).
- Backends: Supabase `pincode-dev` (`dmbkyzdkmpyqgyyvcygs`) and `pincode-prod` (`jfvnahkskwhxgefmoiaz`), both Mumbai. Preview and production EAS environments point at prod.
- Migrations: through `20260927001900` on both projects (19 files, tracked in migration history).
- Edge Functions: `login-with-identifier`, `delete-account`, `request-password-reset`.
- Known: nightly encrypted backup via GitHub Actions; Supabase free plan (no PITR).
