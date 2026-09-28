# pincode — your neighborhood (formerly Mohalla)

> **Opus review incorporated below (v1.1).** Key changes: serve over `localhost` (not `file://`) via a small PowerShell server for a secure context (geolocation) and safe Nominatim requests; bundle a small offline pincode lookup as primary source with Nominatim as fallback; split categories into **Alerts** (road/utilities, expiring) vs **Board** (everything else, longer-lived); cut Buy/Sell and photos from v1; add device-ID based edit/delete/one-vote, "still happening/resolved" confirmations, approximate location + tap-to-reveal phone + WhatsApp link for service posts, shareable URL-hash state, empty/error/denied-location states, and XSS-safe rendering. Full punch list in "v1.1 changes" section below.

## Name options
v1.2 renamed the product to **pincode — your neighborhood**. The table below is the original brainstorm.
| Name | Why |
|---|---|
| **Mohalla** (chosen) | Hindi/Urdu for "neighbourhood"; instantly understood across India |
| Chaupal | The village square where people gather and talk, like a town hall |
| Nukkad | The street corner where news gets passed around |
| PinBoard | A pun on pincode and bulletin board (but the name is already used by a bookmarking service) |
| Galli | "Lane", casual and short |

## Core idea
Each pincode or area gets its own feed. When you open the app it uses GPS to show posts near you. You can also search any pincode or area, or tap the map, and the feed and map pins update to show posts near that spot.

## Post categories (superseded by v1.2 — now three types: Ask, Alert, Event)
- 🚧 Road block / traffic
- 🏗️ Construction / civic work
- ⚡ Utilities (power cut, water supply)
- 🧹 Services & help (maids, cooks, electricians, "looking for" / "offering")
- 🛒 Buy / sell / lost & found
- 📢 Events & announcements
- 💬 General discussion (the town-hall part)

## v1 features (this prototype)
1. **Location**
   - On load: browser geolocation → reverse-geocode to pincode and area (OpenStreetMap Nominatim).
   - Search box: type a 6-digit pincode or area name → geocode → re-centre.
   - Tap or click on the map to pick any point.
   - Radius selector (1 / 3 / 5 / 10 km).
2. **Feed**
   - Posts inside the radius, sorted by newest (with an optional "nearest" sort).
   - Each card shows the category chip, title, text, area/pincode, distance, time ago, upvotes, and comment count.
   - Category filter chips.
   - Urgent posts (road blocks, utilities) get a highlight and expire automatically after 24h.
3. **Map**
   - Leaflet + OpenStreetMap tiles, one marker per post with category colours, and a radius circle.
   - Clicking a marker highlights its card, and clicking a card focuses its marker.
4. **Posting**
   - Name, category, title, body, and an optional phone number for service posts.
   - The location defaults to the current selected point, and you can drag a pin to adjust it.
   - The pincode is auto-filled from reverse geocoding.
5. **Interaction**: upvote, comments thread, and "still happening?" confirmation for road/utility posts.
6. **Responsive**: split map and feed on desktop; on mobile, the feed has a map toggle and a floating "+ Post" button.

## Tech (v1)
- A static web app (`index.html`, `app.js`, `styles.css`) with no build step and no install, because no Node or Python runtime is available here.
- Leaflet from a CDN; Nominatim for geocoding (debounced, respecting its usage policy).
- Data lives in `localStorage`, seeded with about 30 realistic demo posts across a few Indian cities (Delhi, Bengaluru, Mumbai, Hyderabad) so the feed isn't empty.
- A data layer (`store.js`) behind a small interface (`listPostsNear`, `createPost`, `addComment`, `vote`) so it can be swapped for a real backend later.

## v1.1 changes (from Opus review)

**Cut from v1:** Buy/Sell category (would need price/photos/condition — becomes a different app), photos (would blow localStorage's 5MB quota fast), nested/threaded comments, marker clustering.

**Added to v1:**
- **Serving:** run over `http://localhost:8080` via a tiny PowerShell static server (`serve.ps1`), not `file://` — needed for geolocation's secure-context requirement and for Nominatim to see a valid Referer. Opening from disk stays as best-effort fallback.
- **Categories split:** **Alerts** (Road block, Utilities — short-lived, pinned strip at top of feed, 24h expiry extended by "still happening" confirmations) vs **Board** (Construction/civic, Services, Events, General incl. lost & found — 30-day expiry, or event-date expiry for Events).
- **Offline pincode lookup** (`pincodes.js`, ~60 entries across the 4 seed cities: pincode → area/city/lat/lng) checked before Nominatim, since Nominatim's Indian postcode coverage is patchy. Field stays editable/unverified if nothing matches.
- **Nominatim usage discipline:** geocode only on Enter/submit (no type-ahead), throttle reverse-lookup on map taps to ≤1/sec and only if the point moved >100m, cache by rounded lat/lng, send an identifying `email=` param, handle 429/failure by keeping lat/lng and leaving pincode blank.
- **Location fallback:** if geolocation is denied/times out, show a banner + a 4-city picker + the search box, not a blank map.
- **Empty-state feed:** "No posts within Xkm" with Widen radius / Be the first to post / Jump to demo area.
- **Device identity:** a UUID stored in localStorage gates one vote + one confirmation per post per device, and enables edit/delete/"mark resolved" on your own posts.
- **Privacy for Service posts:** coordinates rounded to ~200m; phone number hidden behind "Show number" tap; a `wa.me/<number>` WhatsApp link alongside it.
- **Shareable state:** current view (lat, lng, radius, category filter) kept in the URL hash so a filtered view/post can be forwarded on WhatsApp.
- **Local report/hide:** a "Hide / Report" action on any card (stores a flag, hides it on this device) — proves the moderation UI for v2 without a backend.
- **Structured time fields:** alerts get an optional "until" time; Events get an event date/time and auto-expire after.
- **Seed data uses relative timestamps** (`now - offset`) computed at seed time, not fixed dates, so the 24h alert expiry doesn't wipe all demo alerts after day two.
- **Schema versioning:** `schemaVersion` + a `migrate()` step; every localStorage write wrapped in try/catch; a "Reset demo data" button.
- **XSS safety:** all user-authored text rendered via `textContent`/escaped templates, never raw `innerHTML`.

**Revised post schema:**
```
{ id, schemaVersion, category, kind?(offer|request), title, body,
  lat, lng, locPrecision(exact|approx), pincode, area, city,
  authorId, authorName, phone?, createdAt, updatedAt,
  startsAt?, endsAt?/expiresAt, status(active|resolved|expired|hidden),
  upvotes, voterIds[], confirmations:{stillOn, resolved, lastAt, byIds[]},
  reports, comments:[{id, authorId, authorName, body, createdAt}] }
```

**UI additions:** a pinned "Alerts near you" strip at top of feed; alert cards show "Confirmed still on 2h ago · 3 people"; mobile post form is a bottom sheet that starts with category choice and shows category-specific fields; location header reads "📍 Indiranagar, 560038 · 3km ▾" and opens search/radius/use-my-location on tap.

## v1.2 changes (product sharpening + redesign)

**Pitch:** "Ask your neighborhood anything — no groups to join." Fast answers from people nearby, and recommendations that stay findable instead of vanishing like WhatsApp messages. **North-star metric:** the share of asks answered within 1 hour (`firstAnswerAt - createdAt`).

**Home market:** Mahadevapura, Bengaluru (then Whitefield, KR Puram, Marathahalli, Bellandur). The app opens there when location is denied. Pincode data was corrected (560034 Koramangala, 560038 Indiranagar, 560071 Domlur) and 560048, 560036 and 560103 were added; the new coordinates are approximate and need verifying.

**Three post types**

| Type | Replaces | Behaviour |
| --- | --- | --- |
| Ask | Services & help, General | Active and searchable for 30 days; an optional tag (cook, maid, repair, ...); can be marked answered |
| Alert | Road block, Utilities, Construction | Pinned "Alerts near you" strip; 24h expiry, extended by "still happening" |
| Event | Events | Expires after the event date/time |

**New behaviour**
- **Search past posts nearby** (`Store.searchNear`): title, body, tag and comments, including expired and resolved Asks, labelled "From 3 weeks ago".
- **Answers:** helpful votes (one per device per comment), the author marks one answer "This solved it" (pinned first, "Answered in 25 min" badge). Filters: All, Unanswered, Alerts, Events.
- **Adaptive radius:** fewer than 8 posts triggers "A bit further away" rings up to 10 km. Simulated per-Ask reach (2 km, 5 km after 30 min, 10 km after 2 h) applies only to unanswered Asks and is computed at read time.
- **Share:** `#post=<id>` deep links plus a WhatsApp share button.
- **Schema v2** with `migrate()` from v1 (raw backup kept in `mohalla.posts.backup`; storage keys keep their legacy names).

**Redesign:** minimalist (one teal accent, no emoji chrome), the map is hidden behind a List/Map switch and only initialised when first shown, product renamed to **pincode — your neighborhood**.

**Demo caveats:** (1) with one device, a comment counts as an "answer" if it comes from another device or uses a different name than the author; v2 replaces this with real accounts. (2) Data is per-browser, so `#post=<id>` links open on other devices only for the seeded demo posts.

## v2 (real multi-user app)
- Backend: Supabase (Postgres + PostGIS for `ST_DWithin` radius queries, auth via phone OTP, realtime feeds).
- Mobile app: React Native / Expo.
- Moderation: report button, auto-hide after N reports, rate limits, and verified-resident badges.
- Push notifications for urgent posts in your pincode.
- Pincode boundaries (India Post data) so the app can do real "in this pincode" filtering, not just radius filtering.
- Answer routing: notify people who answered similar asks nearby.
- H3 cells (resolution ~8) for feed caching and alert fan-out.
- LLM auto-tagging of posts.
- A Mumbai-region deployment for latency and data residency.
- Server-side reach widening that replaces the simulated `reachKm`.
