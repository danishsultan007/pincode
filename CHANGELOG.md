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

Everything below shipped to testers as over-the-air updates on top of 1.1.0 (tags `v1.1.0+ota.2` to `v1.1.0+ota.13`); no new native build yet.

### Testers
- **Photos in chat**: tap the camera button next to the message box to send a photo (JPEG, PNG or WebP, up to 3 MB). Tap a photo to see it full screen. Photos are private to the two people in the chat and are removed automatically after 90 days. You can't send photos in a message request until it is accepted.
- **Delete messages**: long-press a message for *Delete for me*, or *Delete for everyone* (your own messages, within 24 hours). Long-press someone else's message to report it.
- **Chat fixes**: a message that arrives while you are on the Inbox now shows when you open the chat. The chat you already have open no longer shows pop-ups or notification-tray entries, and message notifications are now sent at high priority so they should arrive promptly instead of in bursts (still being watched).
- **Cleaner menus and dialogs**: the "..." and long-press menus open next to your finger, and confirmation dialogs now match the app's style.
- **Update banner**: when a new version is downloaded you see "Update ready, Restart", so you no longer need to force-close the app.
- **Profile**: your posts and stats update right after you post, answer or join a community. The Settings and Sign out buttons moved to the gear icon (Settings) only.
- **Fixes**: post and profile photos upload again on Android; show/hide password on every password field; buttons respond across their whole area; the post screen no longer overlaps the Android navigation bar; Google sign-in works on the first try.

### Internal
- Migrations (applied to dev and prod): `20261012000100_chat_attachments` (private `chat-attachments` bucket, upload gate `can_attach`, message photo columns), `20261012000200_chat_attachments_removed_cleanup`, `20261012000300_chat_photo_cap_and_push_priority` (3 MB cap, pushes sent at high priority with a 1 h expiry), `20261012000400_delete_messages` (`message_hides`, `hide_message`, `delete_message_for_everyone`, tombstones; reported or held messages cannot be deleted for everyone).
- Edge Functions: `delete-account` now also removes chat photos (including the other person's photos in the user's conversations); new `cleanup-chat-attachments` (daily from GitHub Actions `cleanup-attachments.yml`; needs the `CLEANUP_SECRET` function secret and GitHub secrets `CLEANUP_URL` and `CLEANUP_SECRET`, see RELEASING.md section 7).
- App: storage uploads send an ArrayBuffer with an explicit content type (a React Native Blob in multipart form data reached Storage as text/plain); shared `invalidateAfter` cache map plus refresh-on-focus and cache clear on account switch; `Stack.Protected` route guard for signed-in-only screens; themed confirmation dialogs and menus on Android; `UpdateBanner`; edit-profile and notification settings wait for the profile to load.
- Planned for the next native build (1.2.0): shrink photos on the phone with `expo-image-manipulator` (WhatsApp-style) and take a photo with the camera (needs the camera permission in `app.config.ts`).
- Dev tooling: Android platform-tools (`adb`) phone link documented in RELEASING.md section 7b.

### Internal (earlier, security and web)
- Web build fix for Cloudflare Pages dropping `node_modules` (fonts and router icons now served from assets/vendor).
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
