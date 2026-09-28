# Mohalla v1.2 — changes from the product plan

Read `PLAN.md`, `store.js`, `geo.js`, `app.js` and `pincodes.js` first. Keep the current stack (static app, localStorage, Leaflet, `serve.ps1`) and the `Store` interface, so a backend can still be swapped in later. Update `PLAN.md` with a "v1.2 changes" section when done.

## Why these changes
The product plan sharpened the pitch: **"Ask your neighbourhood anything — no groups to join."** The core promise is fast answers from people nearby, and recommendations that stay findable instead of vanishing like WhatsApp messages. The first market is **Mahadevapura, Bengaluru** (then Whitefield, KR Puram, Marathahalli, Bellandur). The north-star metric is the share of questions answered within 1 hour.

## 1. Make Mahadevapura the home market
- Add offline pincodes (verify coordinates before committing; these are approximate):
  - 560048 Mahadevapura (~12.9915, 77.6944), also covers Hoodi
  - 560066 Whitefield (already present)
  - 560036 KR Puram (~13.0077, 77.6960)
  - 560037 Marathahalli (already present), Brookefield nearby
  - 560103 Bellandur (~12.9260, 77.6762)
- Add 12-15 realistic seed posts spread across these areas: a cook/maid ask, carpenter and furniture repair recommendations, an ORR/Hoodi traffic alert, a BESCOM power cut, a water-supply alert, a weekend apartment event, a lost pet. Make at least 3 questions with good answers already in the comments.
- When geolocation is denied, the default demo location and the first city chip should be Mahadevapura.
- Fix pincode data bugs: `560034` is Koramangala, not Indiranagar (Indiranagar is `560038`); the `"560034b"` Domlur key is invalid (Domlur is `560071`). Correct the seed posts to match.

## 2. Simplify post types to three
Replace the six categories with three types. Each type controls behaviour, and the free text does the rest.

| Type | Replaces | Behaviour |
| --- | --- | --- |
| **Ask** | Services & help, General | Stays active and searchable for 30 days; can be marked "Answered" |
| **Alert** | Road block, Utilities, Construction | Pinned "Alerts near you" strip; 24h expiry, extended by "still happening" |
| **Event** | Events | Expires after the event date/time |

- Keep an optional **tag** on Ask posts (cook, maid, repair, electrician, plumber, pets, doctor, other), chosen from chips or typed. Tags are just for filtering and search. Don't make them required.
- Keep the offer/request `kind` and the phone/WhatsApp privacy rules for Ask posts that have a phone number.
- Bump `SCHEMA_VERSION` and write a `migrate()` that maps old categories to the new types, instead of silently re-seeding.

## 3. Search past posts nearby
- Add a search box above the feed: "Search nearby — cook, carpenter, pediatrician…".
- It matches title, body, tags and comments within the current radius, **including expired and resolved Ask posts**, so old recommendations stay useful. Label those "From 3 weeks ago".
- Add `Store.searchNear(lat, lng, radiusKm, query)`.

## 4. Answers and helpful votes
- Let people mark a comment as **helpful** (one per device per comment). Show helpful answers first.
- The post author can mark one comment as **"This solved it"**. The post then shows an "Answered" badge, and the solving answer is pinned at the top of the thread.
- Add feed filters: **All · Unanswered · Alerts · Events**. "Unanswered" invites neighbours to help.
- Show "Answered in 25 min" on answered posts. Record `firstAnswerAt` on each post, for the answer-speed metric later.

## 5. Adaptive radius
- **Feed:** if fewer than ~8 posts are inside the chosen radius, append posts from the next ring (up to 10 km) under a divider: "A bit further away (3–5 km)". Nearby posts always come first.
- **Per post (simulated):** give each Ask a `reachKm` that starts at 2 km. If it has no comment after 30 minutes, show it to viewers up to 5 km away, then 10 km after 2 hours. Compute this at read time from `createdAt` and `firstAnswerAt`, with no timers. In v2 this becomes the server-side notification widening.

## 6. Share a post
- Give each post a deep link (`#post=<id>`) that opens the app on that post, plus a "Share on WhatsApp" button (`https://wa.me/?text=<title + link>`). Asks posted into WhatsApp groups are the main growth loop.

## 7. Copy and onboarding
- Header tagline: "Ask your neighbourhood anything."
- Change the post button to "+ Ask", with a type switcher for Alert and Event.
- Empty-state text: "No one has asked anything within X km yet. Be the first — your neighbours will see it."

## Out of scope for this round
Backend, auth/OTP, push notifications, and photos stay for v2. Update the v2 section of `PLAN.md` to add:
- Answer routing: notify people who answered similar asks nearby.
- H3 cells (resolution ~8) for feed caching and alert fan-out.
- LLM auto-tagging of posts.
- A Mumbai-region deployment for latency and data residency.

## Done when
- The app opens in Mahadevapura with a lively feed when location is denied.
- An Ask can be posted, answered, marked helpful and marked solved, then found again by searching after it expires.
- The old localStorage data migrates without a crash.
- Nothing user-authored is rendered with raw `innerHTML`.
