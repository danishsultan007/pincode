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
- Security hardening from the audit:
  - Fixed null-auth checks in database functions (an unauthenticated caller no longer slips past `auth.uid()` comparisons).
  - Revoked anon access to RPCs that only signed-in users need.
  - Web security headers via `mobile/public/_headers` (CSP in Report-Only mode first; promote after checking the console).
  - Push notification taps only navigate to in-app paths (starting with a single `/`).
  - Password reset links work for all three shapes (`?code=`, `#access_token=` fragment, `?token_hash=`) on native and web.
  - The nightly backup keeps privileges and column grants (no `--no-privileges`) and uses read-only workflow permissions.
  - Added security regression tests and an incident runbook (RELEASING.md).

---

## v1.1.0 — 2026-10-11

First Google Play closed-testing build (native build; version 1.1.0).

### Testers
Welcome to the Play Store beta! New in this build:
- Push notifications: get a ping for new messages, replies and requests.
- The map now shows on Android, with posts around you.
- New app icon.
- Settings now shows the app version, so you can tell us exactly which build you use.
- If an old version ever stops working, you will see an "Update required" screen with a button to update from Play.
- Support contact is now pincode.app.team@gmail.com.

Please keep telling us what breaks: Settings > Send feedback.

### Play (en-IN, max 500 chars)
First Play Store beta. New: push notifications for messages and replies, the map on Android, a new app icon, and an app version line in Settings. This is a closed test, so things may break and data may be reset. Tell us what you find in Settings > Send feedback.

### Internal
- Native changes (hence 1.1.0): Firebase `google-services.json` + FCM V1 key for push, Google Maps API key for react-native-maps, new icon/splash assets, expo-updates + Sentry plugin config.
- Backend: `app_config` min-supported-version gate (migration 20260927002000, already on dev and prod), EAS env vars point preview + production at pincode-prod.
- Support email set to pincode.app.team@gmail.com (legal pages, delete-account page, geocoder contact).
- Remember: testers on the 1.0.0 preview APK cannot update in place to the Play build (different signing key); they must uninstall and install from the Play closed-testing link.

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
