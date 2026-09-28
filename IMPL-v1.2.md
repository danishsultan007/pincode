# IMPL v1.2: implementation plan (pincode redesign + CHANGES-v1.2)

Audience: the coder implementing this. Work top to bottom. Keep the stack as is: static files, localStorage, Leaflet 1.9.4 from unpkg, `serve.ps1`, no build step. Keep `window.Store` as the only data interface so a backend can replace it later.

Files touched: `store.js`, `pincodes.js`, `geo.js` (small change), `index.html`, `styles.css`, `app.js`, `PLAN.md`. `serve.ps1` changes only in its banner text.

---

## 0. Decisions on ambiguities and contradictions (read first)

| # | Issue | Resolution |
|---|---|---|
| D1 | The product name. The user wants "pincode - your neighborhood". CHANGES wants the header tagline "Ask your neighbourhood anything." | The header wordmark is **`pincode`** with the muted subtitle **`your neighborhood`**. "Ask your neighborhood anything." is not in the header. It is the placeholder of the "ask prompt" row at the top of the feed (a fake input that opens the composer) and the `<meta name="description">`. `<title>` = `pincode · your neighborhood`. |
| D2 | Spelling: the user writes "neighborhood" and CHANGES writes "neighbourhood/neighbours". | The user's naming wins, so use US spelling ("neighborhood", "neighbors") in **all** UI copy for consistency. Keep every user-facing string in a `COPY` object at the top of `app.js` so the spelling can be flipped in one place. |
| D3 | localStorage keys are named `mohalla.*`. | **Do not rename the keys.** Renaming them would silently drop user data. Add a comment saying the keys are legacy names. |
| D4 | The existing location search (pincode/area) and the new post search (CHANGES §3) both want "a search box". | There are two separate inputs. The **post search** (`#postSearchInput`) sits above the feed. The **location search** (`#locSearchInput`) lives in the location panel. Different ids, placeholders and handlers. |
| D5 | "Answered" badge (the author marked it solved) versus "Answered in 25 min" versus the "Unanswered" filter. | An **answer** is a comment that does not come from the post author (see D6). `firstAnswerAt` = the `createdAt` of the first answer. **Answered** = `solvedCommentId != null`, which shows the badge. The label "Answered in 25 min" shows only on solved posts, and the duration is `firstAnswerAt - createdAt` (the north-star metric). **Unanswered** filter = `type==="ask" && kind!=="offer" && status==="active" && !firstAnswerAt` (offers are not questions; without this, seed-mdp-02 shows up under Unanswered and acceptance step 3 fails). Unsolved asks that have answers show "3 answers". Format the duration as "N min" under 60 min, "N h" under 48 h, and "N d" otherwise. |
| D6 | Single-device demo: the author is the only commenter, so "answered by someone else" could never happen in the acceptance test. | A comment counts as an **answer** if `c.authorId !== post.authorId` **or** `c.authorName.trim().toLowerCase() !== post.authorName.trim().toLowerCase()`. The comment form has a name field, so a tester can reply as "Asha". Only answers can be marked "This solved it" or set `firstAnswerAt`. Document this in PLAN.md as a demo rule that v2 replaces with real users. |
| D7 | `reachKm` versus the viewer's radius. | `reachKm` applies **only to Ask posts in the feed and on the map** (main list and further rings). A viewer sees an **unanswered** Ask (`!firstAnswerAt`) only if `distKm <= min(viewerRadiusOrRing, reachKm(post))`. Once an Ask has an answer, the reach limit no longer applies and it behaves like any other post. *(Reviewer fix: reach freezes at 2 km when the first answer arrives within 30 min, so applying the limit to answered asks hides seeds 01, 03, 04, 08 and 09 (all 2.3 to 3.9 km away) from the default 5 km feed. That leaves about 4 items and breaks "lively feed" and acceptance step 1.)* The rule is skipped for **own posts**, for **search results**, and for deep-link opens. Alerts and Events have no reach limit. |
| D8 | reachKm "if no comment after 30 min". | Use `firstAnswerAt`, not just any comment: `elapsed = (firstAnswerAt || now) - createdAt`. The value is `2` if `elapsed < 30m`, `5` if `< 2h`, otherwise `10`. It is computed at read time and never stored. |
| D9 | What search covers. | Search includes `active` posts of every type, plus `expired` and `resolved` **Asks**. It leaves out expired or resolved Alerts and Events (stale noise) and anything `hidden` or hidden-for-me. It covers the current radius only. When there are 0 results, offer "Search up to 10 km". |
| D10 | Search combined with filter chips, the alerts strip and rings. | While the query is non-empty, chips still filter, the alerts strip is hidden and the adaptive rings are off. Results are sorted by match score (title hit > tag > body > comment), then newest first. |
| D11 | The "From 3 weeks ago" label. | In search results, if the post is not `active` **or** is older than 7 days, replace the time with `From <relative age>`, for example "From 3 weeks ago" or "From 1 month ago". |
| D12 | Adaptive radius: how many rings. | `RINGS = [1, 3, 5, 10]`. If fewer than 8 items fall inside the radius, append the next ring band. Keep appending bands until the total is at least 8 or the 10 km band has been added. Each band gets a divider: "A bit further away (3–5 km)". At radius 10 there are no rings. |
| D13 | Alerts appear both in the strip and in the list. | With the **All** filter, alerts appear only in the "Alerts near you" strip and are left out of the list, so nothing is duplicated. With the **Alerts** filter, the strip is hidden and alerts render as full cards. |
| D14 | Construction maps to Alert, which means a 24h expiry. | Migrated construction posts get their expiry recomputed with the new rules, so old ones become `expired`. That is acceptable, and they stay in storage. |
| D15 | Alert "until" time. | `expiresAt = untilTs || createdAt + 24h`. "Still happening" sets `expiresAt = max(expiresAt, now + 24h)`. |
| D16 | Event with no date. | `startsAt` is **required** for Events in the composer. `expiresAt = endsAt || startsAt + 3h`. |
| D17 | Privacy rounding (it used to be "service" posts). | Round to about 200 m when `type==="ask" && phone`, as CHANGES says. The phone and WhatsApp reveal apply to any Ask with a phone. |
| D18 | Owner actions. | Asks: "This solved it" on answers (it toggles, and one can be switched for another), plus Delete. The Ask "Mark resolved" button is removed. Alerts: "Mark resolved" plus Delete. Events: Delete. Non-owners get "Hide / Report" in a small overflow row. |
| D19 | Deep links for posts that are not on this device. | Data is per-device localStorage, so `#post=<id>` works across devices **only for seed posts**. That is why seed ids must be **stable strings** (`seed-mdp-01`, and so on), never `uid()`. An unknown id shows a toast: "That post isn't on this device (demo data is stored locally)." Links to `localhost` won't open for other people. Note this in PLAN.md. |
| D20 | Deep link combined with geolocation. | If the URL has `post=<id>` and the post exists, centre the location on the post, skip the geolocation prompt, and open the detail. If the URL has `lat`/`lng`, use them and skip geolocation. Today `locateOnLoad` overwrites hash coordinates, which is a bug. |
| D21 | Migrated v1 users would keep the old Indiranagar seeds and never see the Mahadevapura feed. | `migrate()` drops old seed posts (`authorId === "seed-device"`), converts user posts, then appends the new v2 seed set. |
| D22 | The first city chip. | The location panel jump chips are **Mahadevapura** (default), Whitefield, Delhi, Mumbai, Hyderabad. The generic "Bengaluru" chip goes away. |

---

## 1. Design system (styles.css rewrite)

Replace `styles.css` wholesale. Keep the global rule **`[hidden]{display:none!important}`** at the top, with its comment. Light theme only.

### Tokens (`:root`)
```
--bg:#fafaf9; --surface:#ffffff; --surface-2:#f5f5f4;
--line:#e7e5e4; --line-strong:#d6d3d1;
--ink:#1c1917; --ink-2:#57534e; --ink-3:#8a847d;
--accent:#0f766e; --accent-ink:#ffffff; --accent-soft:#ecf6f4;   /* the only accent (teal) */
--t-ask:#0f766e; --t-alert:#b45309; --t-event:#6d5bd0;           /* dots, markers, thin rules only */
--danger:#b42318;
--r-sm:8px; --r:12px; --r-pill:999px;
--s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px;
--font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--z-header:1100; --z-fab:1100; --z-panel:1150; --z-backdrop:1200; --z-sheet:1201; --z-toast:1300;
```
The three type colours never fill large areas. They appear only as 6 px dots, the 2 px left rule on alert cards, and map markers.

### Typography
- Base `15px/1.5` using `--font`, with `-webkit-font-smoothing:antialiased`. Weights are 400, 500 and 600 only (no 700).
- Scale: 12 (meta and labels), 13 (secondary), 15 (body), 16/600 (card title), 20/600 (detail title), 18/600 (wordmark).
- Type labels ("ASK", "ALERT", "EVENT") are 11 px, 600, `letter-spacing:.06em`, uppercase, `--ink-2`.
- Distances and times use `font-variant-numeric: tabular-nums`.
- No emoji in chrome. Replace the emoji icons with text labels or simple inline SVG (location pin, search, map, list, close, share). A few inline SVGs at 16 px with `stroke="currentColor"` are enough.

### Layout
- **Desktop (≥ 760px):** a sticky header 56 px high on `--surface` with a bottom 1 px `--line`. Inside it, a `.container` (max-width 720px, centred, 16 px gutters) holds, from left to right: the wordmark, the location pill (flex:1, max 340px), and the `+ Ask` primary button. Below the header is the same `.container`, holding: the ask-prompt row, the post search, the toolbar (chips on the left, the List/Map segmented switch on the right), the alerts strip, the summary line, then **either** `#listView` **or** `#mapView`. The map view height is `calc(100dvh - 220px)` with `min-height:420px` and `--r` corners inside the container. No split pane.
- **Mobile (< 760px):** the header is 52 px, with the wordmark on the left (hide the "your neighborhood" subtitle below 380 px) and the location pill on the right (truncating with an ellipsis). The header `+ Ask` is hidden and a **FAB pill** "+ Ask" (height 48, `--accent`, `right:16px; bottom:calc(16px + env(safe-area-inset-bottom))`) is shown instead. The chips row scrolls horizontally (`overflow-x:auto; scrollbar-width:none`), and the segmented switch sits on its own row, right-aligned, above the chips (it lives in `.toolbar` in the DOM, so CSS cannot move it next to the summary line). The map view height is `calc(100dvh - <measured top>)`: set it from JS with `mapView.style.height = (innerHeight - mapView.getBoundingClientRect().top - 12) + "px"` on show and on resize.
- Sheets: on desktop, a right drawer 460 px wide. On mobile, a bottom sheet with `max-height:90dvh`, top radius 16, and a drag handle. Backdrop `rgba(28,25,23,.32)`.

### Components
- **Wordmark:** `<a class="wordmark" href="#">`, with **pincode** in 18/600 `--ink` and a thin ` · ` separator (or `—` at 13/400 `--ink-3`), followed by **your neighborhood** in 13/400 `--ink-3`. No logo glyph, or at most a 6 px `--accent` dot before the "p".
- **Location pill:** a 1 px `--line` border, `--r-pill`, 13 px, a pin SVG, then `Mahadevapura · 560048 · 5 km` and a chevron. Clicking it toggles `#locationPanel`, a popover under the header: `position:absolute` on desktop (width 360, `--r`, 1 px border, soft shadow `0 8px 24px rgba(0,0,0,.08)`) and full-width on mobile, with `z-index:var(--z-panel)`. The panel contains the location search (placeholder "Pincode or area, e.g. 560048 or Hoodi"), "Use my current location", jump chips, a radius segmented switch (1 / 3 / 5 / 10 km), and a small `--ink-3` link "Reset demo data". Close the panel on outside click or Esc.
- **Ask prompt row:** a full-width button styled as an input: `--surface`, 1 px `--line`, `--r`, 48 px high, `--ink-3` text "Ask your neighborhood anything…". It opens the composer with type Ask.
- **Post search:** an input 40 px high on `--surface-2` with no border (1 px `--line-strong` plus a focus ring on focus), a search SVG on the left, a clear "×" button (hidden when empty), and the placeholder "Search nearby — cook, carpenter, pediatrician…". Debounce 200 ms. It is local only, with no network calls.
- **Filter chips:** All · Unanswered · Alerts · Events. Chips are 32 px high, 13 px, `--r-pill`, 1 px `--line`, transparent background. The active chip gets an `--ink` background and white text (a neutral active state keeps the accent for actions). Mark the chips up as `role="radiogroup"` with `aria-checked`.
- **Segmented List/Map:** a 2-button group on a `--surface-2` track with a 3 px inset and 32 px height. The selected segment is `--surface` with a 1 px `--line` border and a subtle shadow. Use `role="tablist"` / `aria-selected`.
- **Card (`.card`):** `--surface`, 1 px `--line`, `--r`, padding 16, no shadow, gap 8 between cards. Hover turns the border `--line-strong`. It is focusable (`tabindex=0`, Enter opens it). Anatomy:
  1. Top row: a type dot (6 px) plus the type label, then ` · tag` if a tag exists. On the right, `2.1 km · 3h` (`--ink-3`, 12 px).
  2. Title 16/600, clamped to 2 lines.
  3. Body 14 `--ink-2`, clamped to 2 lines.
  4. Foot row (12 px, `--ink-3`, gap 12): `area · pincode`, then a status element (below), and on the right `▲ n` as a small ghost button (`aria-pressed`).
- **Type distinction (no loud colours):**
  - Ask: teal dot. Foot status shows "Answered in 25 min" with a check SVG in `--accent`, or "3 answers", or, for an unanswered active Ask, "No answers yet · help out" in `--accent`. An offer shows the label `ASK · OFFERING`.
  - Alert: amber dot plus a **2 px left border in `--t-alert`** (use `box-shadow: inset 2px 0 0 var(--t-alert)` so the padding doesn't shift). Foot shows "Still on · 3 confirmed · 2h ago" or "Until 4:00 pm".
  - Event: violet dot plus a **date block** on the right of the title row: a 44×44 `--surface-2` box showing `SAT` (10 px) and `27` (16/600). Foot shows "Sat 27 Sep, 10:00 am".
  - Expired or resolved (search only): the card gets `opacity:.8`, and the time is replaced by "From 3 weeks ago".
  - Further-ring items render at full opacity under the divider.
- **Ring divider:** `.ring-divider`, 12 px, `--ink-3`, uppercase, letter-spacing, with a 1 px line on both sides (flex with `::before`/`::after`), 24 px vertical margin.
- **Alerts strip:** a heading "Alerts near you" (12 px uppercase `--ink-2` with an amber dot) above a horizontal scroll of `.alert-mini` cards (220 px wide, `--surface`, 1 px `--line`, inset amber left rule, title clamped to 2 lines, `1.2 km · 2h`). No pink backgrounds.
- **Status banner:** one line, `--surface-2`, 13 px, with a dismiss "×". Style it by class (`.status-banner.is-warn` uses an `--ink` left rule). **Do not** set inline `style.background` as the current code does.
- **Toast:** fixed at the bottom centre, `--ink` background with white text, 13 px, auto-hides after 2.5 s, `z-index:var(--z-toast)`. Used for "Link copied" and "Post not found".
- **Buttons:** `.btn` is 36 px high, `--r-sm`, 14/500. `.btn-primary` uses the `--accent` background. `.btn-ghost` is transparent with 1 px `--line`. `.btn-text` is text only in `--ink-2`. `.btn-danger-text` is text in `--danger`.
- **Focus:** `:focus-visible { outline:2px solid var(--accent); outline-offset:2px }`.

### Leaflet containment (pitfall)
Give `#mapView` and `#postMap` the style `position:relative; isolation:isolate; z-index:0;`. Leaflet panes go up to about 700 and `.leaflet-top/.leaflet-bottom` go to 1000. Isolation traps those z-indexes inside the map. `#map` needs `height:100%` (and `#postMap` a fixed height such as 220px). Otherwise Leaflet renders into a 0-px-high box. On top of that, every overlay uses z-index ≥ 1100 (see the tokens), so nothing sits under map controls even if the isolation is lost.

---

## 2. index.html (restructure)

Checklist:
1. `<title>pincode · your neighborhood</title>`. Add `<meta name="description" content="Ask your neighborhood anything — no groups to join.">` and `<meta name="theme-color" content="#fafaf9">`.
2. Header: `.wordmark`, `#locationPill` (containing `#locationPillText`), and `#askBtnHeader` ("+ Ask"). Remove `#resetDemoBtn` from the header.
3. `#locationPanel` (hidden) goes **inside** the header's `.container` (make that container `position:relative`), so its `position:absolute` anchors under the sticky header. As a sibling of `<header>` it would anchor to the document and scroll away. It contains: `#locSearchForm` / `#locSearchInput` / submit, `#useMyLocationBtn`, jump chips `.city-chip` (Mahadevapura `12.9915,77.6944` first, Whitefield `12.9698,77.7500`, Delhi `28.6315,77.2167`, Mumbai `19.0596,72.8295`, Hyderabad `17.4483,78.3915`), `#radiusOptions` (segmented, `data-km` = 1/3/5/10), and `#resetDemoBtn` (text link).
4. `#statusBanner` (hidden), containing `#statusText` and `#statusDismiss`.
5. `<main class="container">` contains:
   - `#askPrompt` button.
   - `#postSearchForm` (role="search") with `#postSearchInput` and `#postSearchClear` (hidden).
   - `.toolbar`: `#filterChips` (buttons `data-filter="all|unanswered|alerts|events"`) and `#viewSwitch` (buttons `data-view="list|map"`).
   - `#alertsStrip` (hidden), containing `#alertsStripList`.
   - `.summary-row`: `#feedSummary` plus `#sortSelect` restyled as a small text select (Newest / Nearest).
   - `#listView`, containing `#feedList` and `#emptyState` (hidden).
   - `#mapView` (hidden), containing `<div id="map">`.
6. `#fabAsk` ("+ Ask"), shown on mobile only (via CSS, not `hidden`).
7. Composer sheet `#postSheet` plus `#sheetBackdrop`. The body is `<form id="postForm">`:
   - Header: "New post" and close (`#closeSheetBtn`).
   - `#typeSwitch` segmented with Ask / Alert / Event (`data-type`).
   - `#askFields` contains `#tagChips` (cook, maid, repair, electrician, plumber, pets, doctor, other, as `data-tag` buttons), `#tagCustom` (text input, maxlength 20, placeholder "or type a tag"), a `#kindGroup` radio (`name="kind"`, values `request` [default] / `offer`), and `#phoneField` containing `#postPhone`.
   - Common: `#postTitle`, `#postBody`.
   - `#alertFields` contains `#postUntil`.
   - `#eventFields` contains `#postStartsAt` (required when Event) and `#postEndsAt`.
   - `#postAuthorName`.
   - `.loc-row`: `#postLocText` ("Near Hoodi, 560048") plus a `#adjustPinBtn` text button, then `#postMapWrap` (hidden) containing `#postMap` and `#postLocReadout`.
   - Footer: Cancel (`#cancelPostBtn`) and `#postSubmit` (its label changes to "Post ask" / "Post alert" / "Post event").
8. Detail sheet `#detailSheet` plus `#detailBackdrop`, containing `#detailTypeLabel`, close (`#closeDetailBtn`), and `#detailBody`.
9. `#toast` (hidden, `role="status" aria-live="polite"`).
10. Keep the Leaflet CSS and JS tags and the script order (`pincodes.js`, `store.js`, `geo.js`, `app.js`). Leaflet stays loaded eagerly. Only `L.map(...)` is deferred.

---

## 3. store.js (schema v2)

Checklist, in order:
1. `SCHEMA_VERSION = 2`. Keep the `LS_*` key names (D3). Add `LS_SEEN_SEED_VERSION` only if needed. It is not required.
2. Replace `CATEGORY_META` with `TYPE_META`:
   ```
   ask:   { label:"Ask",   color:"#0f766e" },
   alert: { label:"Alert", color:"#b45309" },
   event: { label:"Event", color:"#6d5bd0" }
   ```
   Also add `TAGS = ["cook","maid","repair","electrician","plumber","pets","doctor","other"]`. Export both on `Store`.
3. `EXPIRY_MS = { ask: 30d, alert: 24h }`, plus `EVENT_DEFAULT_MS = 3h`.
4. The v2 post schema (no stored `reachKm`):
   ```
   { id, schemaVersion:2, type:"ask"|"alert"|"event", tag:string|null, kind:"offer"|"request"|null,
     title, body, lat, lng, locPrecision, pincode, area, city,
     authorId, authorName, phone|null, createdAt, updatedAt,
     startsAt|null, endsAt|null, expiresAt, status:"active"|"resolved"|"expired"|"hidden",
     firstAnswerAt|null, solvedCommentId|null, solvedAt|null,
     upvotes, voterIds[], confirmations:{stillOnCount,resolvedCount,lastAt,byIds[]},
     reports, hiddenFor[],
     comments:[{ id, authorId, authorName, body, createdAt, helpfulIds:[] }] }
   ```
5. `computeExpiry(type, createdAt, startsAt, endsAt)` follows D15 and D16: ask gets `+30d`; alert gets `endsAt || +24h`; event gets `endsAt || (startsAt ? startsAt + EVENT_DEFAULT_MS : createdAt + 30d)`. **Do not** write `endsAt || startsAt + 3h || ...` literally: `null + 3h` is the truthy number 10800000, which gives an expiry in 1970.
5a. Remove **every** `category` / `CATEGORY_META` reference in store.js, not only the ones listed here. `expireSweep` must use `expiresAt` for all types (drop the event special case and the unused `meta`). `confirm()` and `createPost()` currently read `CATEGORY_META[post.category]`, which becomes a ReferenceError once the constant is removed. Change the default author name in `createPost` / `addComment` from "Neighbour" to "Neighbor" (D2).
6. `isAnswer(post, c)` implements D6. Guard the name comparison with `(c.authorName || "")` and `(post.authorName || "")`. `recomputeFirstAnswerAt(post)` = the minimum `createdAt` over comments that are answers, or null.
7. `reachKm(post, now)` implements D8. It returns `Infinity` for non-Asks. Export it as `Store.reachKm`.
8. `migrate(data)` is called from `loadPosts()`:
   - **Before any reseed or migration write**, if a raw value exists and it is not already v2, copy the raw string to `mohalla.posts.backup` (a raw `localStorage.getItem` / `setItem` inside try/catch). The try/catch-then-reseed path below otherwise **permanently overwrites** v1 user posts if the migration code has a bug. The same applies to corrupt JSON (today `safeGet` returns null and the reseed overwrites it).
   - `!data || !Array.isArray(data.posts)` → reseed (with `console.warn`).
   - `data.schemaVersion === 2` → return it as is.
   - `data.schemaVersion === 1` → keep posts where `authorId !== "seed-device"`. Map each one: `road|utility|construction` becomes `alert`, `service|general` becomes `ask`, `event` stays `event`. `tag = inferTag(title+" "+body)`, a keyword map (cook|chef, maid|house help|nanny, carpenter|furniture|repair, electrician|wiring, plumber|leak, dog|cat|pet, doctor|pediatrician|clinic). Kind is kept only for ask. Add `helpfulIds:[]` to each comment and set `firstAnswerAt` via recompute, `solvedCommentId:null`, `solvedAt:null`. Fix pincodes: `"560034"` with area "Indiranagar" becomes `"560038"`. `"560034"` with area **"Domlur"** becomes `"560071"`. (Real v1 user posts never stored `"560034b"`, because `findNearestPincode` stripped the suffix with `.replace(/[a-z]$/,"")`. Handle `"560034b"` → `"560071"` too, for safety.) Area "Indiranagar East" becomes "Indiranagar". A migrated ask with `kind:null` gets `kind:"request"`. Delete the `category` field and set `type` and `schemaVersion:2` on each post. Recompute `expiresAt` and re-run expiry, but **never change a non-active status** (`resolved`, `hidden` and `expired` stay as they are; only `active` may become `expired`). Then `posts = migrated.concat(seedPosts())`, set `schemaVersion = 2`, and save.
   - Unknown or future versions → reseed.
   - Wrap the whole thing in try/catch. On any exception, reseed rather than crash.
9. `createPost(input)` takes `type`, `tag` (lowercased, trimmed, max 20, null if empty), `kind` (ask only, default `"request"`), and the approx-location rule from D17. It sets `firstAnswerAt:null, solvedCommentId:null, solvedAt:null` and computes expiry.
10. `listPostsNear(lat, lng, radiusKm, opts)` keeps its signature. Its opts become:
    - `type` ("ask"|"alert"|"event"), `filter` ("unanswered"), `minKm` (exclusive lower bound, for rings), `sortBy`, `includeExpired`.
    - `respectReach` (default true): drop Asks where `!post.firstAnswerAt && distKm > reachKm(post)` unless `post.authorId === deviceId` (see D7).
    - Always exclude `hidden` status and `isHiddenForMe`. Move that filter into the store so that `app.js` stops doing it.
    - Each item returned is `{ post, distKm, reachKm }`.
11. **New** `searchNear(lat, lng, radiusKm, query, opts)` (D9, D10, D11):
    - Normalise with lowercase, trim, and split into terms. An empty query returns `[]`.
    - Candidates are within the radius and not hidden, and are either `status==="active"` or (`type==="ask"` and status is `expired` or `resolved`). **No** reach check.
    - A post matches only if **every** term appears in title + body + tag + comment bodies. Score: title hit 3, tag 3, body 2, comment 1, summed over terms.
    - Honour `opts.type` and `opts.filter`, as `listPostsNear` does.
    - Sort by score descending, then `createdAt` descending.
    - Return `{ post, distKm, matchedIn:"title"|"tag"|"body"|"comment" }`.
12. `addComment(id, authorName, body)` adds `helpfulIds:[]`. If `isAnswer` and `!post.firstAnswerAt`, it sets `post.firstAnswerAt = comment.createdAt`.
13. **New** `toggleHelpful(postId, commentId)`: one entry per device, toggled. Returns the post.
14. **New** `markSolved(postId, commentId)`: author only. `commentId` must be an answer. If it is already the solved one, **unset** it (toggle). Otherwise set `solvedCommentId` and `solvedAt = now`. Status stays `active`.
15. `deleteComment` is not required. Skip it.
16. `confirm(id,"stillOn")` applies to type alert: `expiresAt = max(expiresAt, now+24h)`. It also re-activates the post if it was expired less than 24h ago. Optional: skip if complex.
17. `markResolved` is allowed only for alerts (the UI enforces it).
18. **New** helper `sortedComments(post)`: a single comparator over all comments, with keys (is solved, descending), (`helpfulIds.length`, descending), (`createdAt`, ascending). The author's own follow-ups have no helpful votes, so they sort among the zero-helpful items by time. Return a copy, not the stored array. Export it for app.js.
19. `resetDemoData()` writes `{schemaVersion:2, posts:seedPosts()}`.
20. Expose `Store.TYPE_META`, `Store.TAGS`, `Store.reachKm`, `Store.isAnswer`, `Store.sortedComments`, `Store.searchNear`, `Store.toggleHelpful`, `Store.markSolved`. Remove `CATEGORY_META`.

### Seed posts (`seedPosts()`)
- Every seed has a **stable id** (D19) and `authorId:"seed-device"`. Timestamps are relative to `now`. Comments on seeds are built by a helper `c(name, body, offsetMs, helpfulCount)`. `offsetMs` is measured **after the post's `createdAt`** (so "first answer at +18 min" means `createdAt + 18min`), and `helpfulIds` are dummy strings `["seed-h1",...]`. Give seed comments **stable ids** (`seed-mdp-01-c1`), since `solvedCommentId` points at them, and an `authorId` of `"seed-user-<name>"`, never `"seed-device"`. Derive `firstAnswerAt` with `recomputeFirstAnswerAt(post)` after the comments are built instead of hand-typing it. Set `solvedCommentId` and `solvedAt` explicitly.
- Replace the random `upvotes` with fixed small numbers so the demo is deterministic.
- Default centre: Mahadevapura `12.9915, 77.6944`. The areas and their approximate distances from it: Hoodi (12.9913, 77.7159) about 2.3 km; KR Puram (13.0077, 77.6960) about 1.8 km; Brookefield (12.9667, 77.7167) about 3.6 km; Marathahalli (12.9569, 77.7011) about 3.9 km; Whitefield (12.9698, 77.7500) about 6.5 km (it lands in the 5–10 ring at the default 5 km); Bellandur (12.9260, 77.6762) about 7.5 km (also in that ring). Jitter each post by ±0.003°.

| id | type/tag | area, pincode | age | notes |
|---|---|---|---|---|
| seed-mdp-01 | ask/cook, request | Hoodi 560048 | 5h | "Looking for a cook for lunch + dinner, veg, near Hoodi". 3 answers, one solved, first answer at +18 min, helpful counts 4/2/0 |
| seed-mdp-02 | ask/maid, **offer**, phone `9845012345` | Mahadevapura 560048 | 1d | "Part-time house help available, mornings". Approx location, no comments |
| seed-mdp-03 | ask/repair | Brookefield 560037 | 2d | "Good carpenter for wardrobe hinges and a sagging door?" 2 answers, solved, first answer at +25 min |
| seed-mdp-04 | ask/repair | Marathahalli 560037 | 21d | "Sofa re-upholstery recommendations?" 2 answers, solved (drives "From 3 weeks ago" in search) |
| seed-mdp-05 | ask/plumber | Bellandur 560103 | 40d, `status:"expired"` | "Plumber for a bathroom leak, Bellandur". 2 answers, solved. Only findable via search at radius ≥ 10 |
| seed-mdp-06 | ask/electrician | KR Puram 560036 | 40 min | "Electrician today — MCB keeps tripping". 0 comments (Unanswered, reach 5) |
| seed-mdp-07 | ask/doctor | Mahadevapura 560048 | 10 min | "Pediatrician open on Sundays nearby?" 0 comments (Unanswered, reach 2) |
| seed-mdp-08 | ask/pets | Brookefield 560037 | 8h | "Lost: brown indie dog 'Bruno', red collar". 1 answer (a sighting), not solved |
| seed-mdp-09 | ask/other, offer | Hoodi 560048 | 3d | "Offering maths tuition, classes 6–8". 1 answer |
| seed-mdp-10 | alert | Hoodi 560048 | 90 min | "ORR service road jammed near Hoodi junction — metro work". stillOn 3, lastAt 20 min ago |
| seed-mdp-11 | alert | Mahadevapura 560048 | 3h | "BESCOM power cut, expected back ~4 pm". `endsAt: now+3h` |
| seed-mdp-12 | alert | KR Puram 560036 | 6h | "No Cauvery water supply today, tankers near the temple" |
| seed-mdp-13 | event | Whitefield 560066 | 1d | "Sunday flea market at our apartment clubhouse". startsAt now+2d 10:00, endsAt +8h |
| seed-mdp-14 | event | Mahadevapura 560048 | 12h | "Saturday morning yoga by the lake, all welcome". startsAt now+1d, endsAt +2h |

- Keep the other-city seeds, converted to v2 (about 10 posts: 2–3 each for Delhi, Mumbai and Hyderabad, plus Indiranagar and Koramangala). Give them ids `seed-oth-01..` and **fixed pincodes**: the Indiranagar posts use `560038` (area "Indiranagar"), and Koramangala uses `560095`/`560034`. Give 1–2 of them answers too.
- Use no real brand, apartment or person names beyond generic first names. BESCOM, BWSSB/Cauvery and ORR are public utilities or roads, so they are fine.

---

## 4. pincodes.js

1. Fix `560034` to `{ area:"Koramangala", lat:12.9279, lng:77.6271 }`.
2. Fix `560038` to `{ area:"Indiranagar", lat:12.9784, lng:77.6408 }` (drop "East").
3. Delete the `"560034b"` key and add `560071 { area:"Domlur", lat:12.9610, lng:77.6387 }`.
4. Relabel `560095` as "Koramangala 6th Block".
5. Add `560048 { area:"Mahadevapura", aliases:["Hoodi"], lat:12.9915, lng:77.6944 }`, `560036 { area:"KR Puram", aliases:["Krishnarajapuram","K R Puram"], lat:13.0077, lng:77.6960 }`, and `560103 { area:"Bellandur", lat:12.9260, lng:77.6762 }`. Add `aliases:["Brookefield","Kundalahalli"]` to `560037` and `aliases:["ITPL"]` to `560066`.
6. Put a top comment above the Mahadevapura block: "Approximate centroids; verify against India Post / OSM before production." The coordinates are plausible to within about 1 km. Verification is the coder's call. If you can't verify, leave the comment.
7. In `findNearestPincode`, remove the `.replace(/[a-z]$/,"")` hack (no suffixed keys remain). Replace the object spread with `Object.assign({code:code, distKm:d}, p)`.
8. **New** `window.findPincodeByArea(q)`: a case-insensitive exact match on `area` or any alias, returning `{code, ...}` or null.

## 5. geo.js (small)
1. In `forwardGeocode`, after the 6-digit check, try `window.findPincodeByArea(query)` before Nominatim, so "Hoodi" works offline. Map its `{code, area, city, lat, lng}` onto the shape callers expect: `{lat, lng, pincode: code, area, city, source:"offline"}`. Callers read `.pincode`, not `.code`.
2. Leave `CONTACT_EMAIL` as it is (optionally rename it to `pincode-prototype@example.com`).

---

## 6. app.js (rewrite in place, same IIFE style)

### 6.1 Foundations
1. At the top: `COPY` (all strings, D2), `DEFAULT_LOC = {lat:12.9915,lng:77.6944,area:"Mahadevapura",city:"Bengaluru",pincode:"560048"}`, `RINGS=[1,3,5,10]`, `MIN_FEED=8`.
2. `state = { lat, lng, radiusKm:5, filter:"all", view:"list", query:"", sortBy:"newest", area, city, pincode, openPostId:null }`, initialised from `DEFAULT_LOC` so the first `render()` can run at once. Geolocation can take up to 10 s, and the feed must not sit blank while it waits.
2a. `cacheEls()`: rewrite the id list to match the new DOM. Every old id (`searchForm`, `categoryFilters`, `mapToggleBtn`, `mapPane`, `fabPost`, `categorySelect`, `serviceKindGroup`, `eventTimeRow`, `alertUntilRow`, `detailCategoryLabel`, ...) now returns `null`, and `addEventListener` then throws, which kills the whole boot. After caching, `console.error` any id that resolved to null.
3. A DOM helper `el(tag, props, children)` where props supports `class`, `text` (sets `textContent`), `attrs`, `on`, `hidden`. **Never** assign user data to `innerHTML`. Clear nodes with `node.replaceChildren()`. Delete `esc()`.
4. `show(node, bool)` does `node.hidden = !bool`. **Never** toggle `style.display` for visibility.
5. `toast(msg)`.

### 6.2 Hash / deep link
1. `parseHash()` reads `lat`, `lng`, `r`, `f` (filter), `v` (view), `q` (search), and `post`. Validate each value: accept lat/lng only if `isFinite` (today `#lat=abc` gives NaN and Leaflet throws "Invalid LatLng"); `r` must be one of `RINGS`; `f` and `v` must be known values. Fall back to the default otherwise.
1a. `syncControls()` pushes the state into the DOM: the active radius segment, `aria-checked` on the filter chips, `aria-selected` on the view switch, the `#postSearchInput` value, and the clear button's `hidden`. Call it after parseHash at boot and whenever `render()` runs. (Today the radius chip `5 km` is hard-coded `active`, so `#r=1` shows the wrong chip.) If `v=map` at boot, go through the same `setView("map")` path as §6.5.
2. `writeHash()` uses `history.replaceState` and **includes `post=<id>` while the detail is open**. Omit the defaults.
3. Add a `hashchange` listener. If `post` changed, open or close the detail accordingly. This handles pasting a link into the same tab.
4. Boot order (D20): parseHash, then cacheEls, then bind, then:
   - if `openPostId` is set and `Store.getPost` finds it, set the location to the post's lat/lng plus reverseGeocode, render, then openDetail.
   - else if the hash had lat/lng, use them.
   - else call `locateOnLoad()`. On deny, timeout or error, use DEFAULT_LOC with the banner "Location is off — showing Mahadevapura. Search a pincode or pick an area."
   - An unknown `post` id shows the toast (D19) and falls through to the normal flow.

### 6.3 Header and location
1. The pill text is `area · pincode · N km`, set with `textContent`.
2. Panel open and close: toggle the `hidden` attribute, with outside-click and Esc to close, and `aria-expanded`.
3. Location search submit calls `Geo.forwardGeocode`. Jump chips set coordinates, then reverseGeocode. The radius segmented control sets `radiusKm`. "Use my location" calls `locateOnLoad`. Each of these calls `afterLocationChange()`, which does writeHash, the pill update, the map re-centre **and radius-circle update** (only if the map is initialised) and render.
4. Reset demo: confirm, then `Store.resetDemoData()`, then render.

### 6.4 Feed
1. `render()` is the only entry point for rebuilding feed state. It:
   - builds items, via search mode (`Store.searchNear`) or feed mode.
   - in **feed mode**, sets `near = Store.listPostsNear(lat,lng,radius,{type/filter per chip, sortBy})`. With the All chip, it excludes alerts (D13). If `near.length < MIN_FEED`, it loops over the ring bands above `radiusKm` (D12) and calls `listPostsNear(lat,lng,toKm,{minKm:fromKm, ...same opts})`. Non-empty bands are pushed as `{divider:"A bit further away (3–5 km)", items}`.
   - calls `renderAlertsStrip()`. The strip is shown only when `filter==="all" && !query` and there are alerts.
   - calls `renderList(groups)` or `renderEmpty()`.
   - stores `lastMapItems` = the list items (all groups) **plus the alerts-strip items** (with the All chip, alerts are left out of the list but must still show on the map; in search mode, use the results only). It then calls `renderMarkers(lastMapItems)` **only if the map is initialised**. Otherwise it sets `mapDirty = true`.
   - sets the summary: "12 posts within 5 km", "4 results for "cook" within 5 km" or "3 unanswered asks within 5 km".
2. `buildCard(item, {searchMode})` follows the §1 anatomy. The vote button uses `stopPropagation` and calls `Store.vote` then `render()`. The card click calls `openDetail(id)`. The tag text is a button that sets `state.query = tag`, writes the value into `#postSearchInput` (via syncControls), calls writeHash and re-renders (it uses `stopPropagation`).
3. Filter chips set `state.filter`, then writeHash and render. The "Unanswered" filter maps to `{type:"ask", filter:"unanswered"}`, Alerts to `{type:"alert"}` and Events to `{type:"event"}`.
4. Post search: an `input` event with a 200 ms debounce sets `state.query`, then render. Clear resets it. Pressing Esc in the input clears it.
5. Empty states (these go in `#emptyState`, built with `el`):
   - Feed/All, with nothing near and nothing in the rings: heading "No one has asked anything within 5 km yet." and text "Be the first — your neighbors will see it." Actions are a `+ Ask` primary button and a "Jump to Mahadevapura" ghost button.
   - Unanswered: "Every ask nearby has an answer. Nice." (no action).
   - Alerts: "No alerts within 5 km right now."
   - Events: "No upcoming events within 5 km." plus a "+ Post an event" button (opens the composer on Event).
   - Search, 0 results: `No past posts match "cook" within 5 km.` Actions: "Search up to 10 km" (shown if radius < 10; it runs `searchNear` with 10 and doesn't change `state.radiusKm`) and "Ask it instead" (opens the composer with `postTitle` prefilled with the query).

### 6.5 List / Map switch
1. The `#viewSwitch` click sets `state.view`, then `show(listView, view==="list")`, `show(mapView, view==="map")`, then writeHash.
2. On switching to map, in this order: unhide `#mapView`, **then set the mobile height (§1)** so the container has its final size before Leaflet measures it, then in `requestAnimationFrame`: if `!map`, call `initMap()`; otherwise call `map.invalidateSize()`. Then **always** call `fitView()`, because a `setView` made while the map was hidden (from afterLocationChange) was computed against a 0×0 box and is off-centre. If `mapDirty`, call `renderMarkers(lastMapItems)` and clear the flag. On the first init `mapDirty` is always true. `fitView()` = `map.setView([state.lat,state.lng], zoomForRadius(state.radiusKm))` plus the radius-circle update (keep the existing `zoomForRadius`).
3. `initMap()`: `L.map("map",{zoomControl:true})`, the OSM tile layer with attribution, `markersLayer`, and the radius circle in `--accent` (weight 1, fillOpacity .05). Set the view to the current centre.
4. `renderMarkers(items)`: use `L.circleMarker` with radius 7, `color:"#fff"`, weight 2, `fillColor: TYPE_META[type].color`, and fillOpacity .9. Items from further rings get fillOpacity .5. Do **not** call `bindTooltip(post.title)` with a string. Leaflet sets a string tooltip via innerHTML, which is an XSS hole (the current code has this bug). Use `bindTooltip(el("span",{text:post.title}))` (a DOM node) so user text is never parsed as HTML. The same rule applies to any popup. Marker click calls `openDetail(id)`.
5. `window.resize` (debounced) calls `invalidateSize` if the map is visible.
6. Leave out the "tap map to move location" behaviour (it isn't in scope).

### 6.6 Composer
1. `openComposer({type="ask", title=""})` resets the form, resets `newPostState = {lat: state.lat, lng: state.lng}` (and the tag selection), selects the type, prefills the name from `Store.getLastName()`, sets the location text to `state.area · state.pincode`, hides `#postMapWrap`, and unhides the sheet and backdrop. Focus goes to `#postTitle`.
2. The type switch toggles the `hidden` attribute on `#askFields`, `#alertFields` and `#eventFields`, and changes the title placeholder: Ask "What do you need? e.g. Good carpenter near Hoodi?", Alert "What's happening? e.g. ORR service road flooded", Event "What's on? e.g. Sunday flea market". It also sets the submit label and sets `required` on `#postStartsAt` only for Event.
3. Tag chips are single-select and toggleable. Typing in `#tagCustom` deselects the chips. Resolved tag = the custom value || the selected chip || null.
4. "Adjust pin" unhides `#postMapWrap`. The first time, it lazily inits `postMap` in rAF, otherwise it calls `setView` + `invalidateSize`. This is the existing logic with a draggable marker.
5. Submit validates the title, and startsAt for events (use the inline `field-error` text, not `alert()`). Also reject an alert "until" that is in the past, and an event whose `endsAt <= startsAt` or whose computed expiry is already past. Otherwise the new post is created `expired` and vanishes from the feed straight away. It then calls `Store.createPost({type, tag, kind, title, body, lat, lng, pincode, area, city, authorName, phone (ask only), startsAt, endsAt: event ? endsAt : alert ? until : null})`, closes the composer, clears the query and sets the filter to "all" so the new post is visible, then calls render and `openDetail(post.id)`.
6. `#askPrompt`, `#askBtnHeader` and `#fabAsk` all call `openComposer({type:"ask"})`.

### 6.7 Detail view
1. `openDetail(id)` sets `state.openPostId = id` and writeHash, then calls `renderDetail()`, then unhides the sheet. `closeDetail()` clears `openPostId`, calls writeHash and hides the sheet.
2. `renderDetail()` **always re-reads `Store.getPost(state.openPostId)`** (stale-ref pitfall). It saves the `#detailBody` scrollTop, rebuilds with `replaceChildren()` and restores the scroll. If the post is missing, it closes the detail and shows a toast.
3. Content order:
   1. The type dot and label (plus the tag) in the header `#detailTypeLabel`.
   2. Title (20/600) and a meta line: `By Priya · 3h ago · Hoodi 560048 · 2.1 km`.
   3. Badges row: "Answered in 25 min" if solved; for expired asks, "From 3 weeks ago · closed"; for Asks shown to the owner, "Reaching neighbors within 2 km · widens to 5 km if no answer in 30 min" (uses `Store.reachKm`, 12 px `--ink-3`).
   4. Body (`white-space:pre-wrap`, textContent).
   5. Event: date/time line. Alert: "Still on · 3 confirmed · last 20 min ago" plus the "Still happening" and "Looks resolved" buttons (active only).
   6. Phone reveal (ask with phone): a "Show number" button. It is replaced by the number plus a `wa.me/91<digits>` link (`target=_blank rel=noopener`). Normalise first: strip non-digits, then a leading `91` (when there are 12 digits) or `0` (when there are 11). Otherwise "+91 98450…" becomes `wa.me/9191…` (an existing bug).
   7. Action row: `▲ Upvote n` (aria-pressed), **Share on WhatsApp** (an `<a>` with `href="https://wa.me/?text="+encodeURIComponent(title+"\n"+link)`, target _blank, rel noopener), and **Copy link** (`navigator.clipboard.writeText(link)` then the toast "Link copied". Fall back to `prompt()` if the clipboard is unavailable). `link = location.origin + location.pathname + "#post=" + id`.
   8. Owner or other: owner actions (D18) or `Hide / Report` as `.btn-danger-text`, at the bottom of the action area.
   9. **Answers thread**: the heading is "Answers (n)" for Asks and "Comments (n)" otherwise. Iterate `Store.sortedComments(post)`. Each item shows name · time, and a "✓ Solved it" label (`--accent`, 12/600) if it is the solved one; the solved item has an `--accent-soft` background, `--r-sm` corners and padding 12. Then the body (textContent). Then a row with the **Helpful · n** toggle (`aria-pressed`; hidden for the author's own non-answer comments). If the viewer is the owner, the post is an ask and `Store.isAnswer(post,c)`, add a "This solved it" / "Unmark solved" text button. On a non-owner device (the device that commented), the author sees nothing extra.
   10. Comment form: `#commentName` (small, prefilled with last name, placeholder "Your name") and a `textarea` ("Share what you know…" for asks, "Add a comment…" otherwise), plus Send. On submit, call setLastName, then `Store.addComment`, then `renderDetail()` and `render()`. After the rebuild, **re-query** the new textarea and focus it (the old reference is stale).
4. Every mutating action inside the detail calls `Store.x(...)`, then `renderDetail()`, then `render()`. None of them captures a `post` object across a mutation.
5. Esc closes the topmost open layer: detail, then composer, then location panel.

### 6.8 Remove
Remove the old `categoryFilters`, the `categorySelect` grid, the `mapToggleBtn` and the `.map-pane.show` logic, the inline banner colours, and any leftover `CATEGORY_META` references.

---

## 7. PLAN.md update (edit only after the code works)
1. Change the title to `# pincode — your neighborhood (formerly Mohalla)` and add a line to the Name table saying that v1.2 renamed the product to **pincode**.
2. Add a **"v1.2 changes"** section after v1.1: the pitch "Ask your neighborhood anything — no groups to join", the Mahadevapura home market, three types (with the table), search including expired asks, answers/helpful/solved, `firstAnswerAt` plus the north-star metric (the share of asks answered within 1h), adaptive rings, reachKm simulation, share and deep links, the minimalist redesign with the List/Map toggle, the v2 post schema, and the D6/D19 demo caveats.
3. In the **v2** section, append: answer routing (notify people who answered similar asks nearby); H3 cells (resolution about 8) for feed caching and alert fan-out; LLM auto-tagging of posts; a Mumbai-region deployment for latency and data residency; server-side reach widening that replaces the simulated `reachKm`.
4. Mark the old "Post categories" list as superseded by v1.2.

## 8. serve.ps1
Only the banner text changes, to `pincode is running at ...`. No logic changes.

---

## 9. Pitfalls checklist (verify before you finish)
- [ ] `[hidden]{display:none!important}` is still present. No component sets `display` in a way that fights it, and visibility is never toggled through `style.display`.
- [ ] `#mapView` and `#postMap` use `isolation:isolate`. The header, FAB, panel, backdrop, sheet and toast all have z-index ≥ 1100.
- [ ] `grep -n innerHTML app.js` returns 0 hits. Leaflet tooltips receive DOM nodes, not strings.
- [ ] No closure keeps a `post` or element reference across a `render()` or `renderDetail()`. Everything re-reads by id.
- [ ] `L.map` is never called while its container is hidden. `invalidateSize` runs after every show.
- [ ] `localStorage` access stays inside try/catch (the existing `safeGet`/`safeSet`).
- [ ] The v1 localStorage payload migrates without throwing (test below).

---

## 10. Acceptance test script (manual, in a browser at `http://localhost:8080`)

1. **Fresh start, location denied:** clear site data, run `serve.ps1`, open the app and deny location. The header reads "pincode · your neighborhood". The banner says the app is showing Mahadevapura. The pill reads "Mahadevapura · 560048 · 5 km". The alerts strip shows the 3 alerts, and the list shows at least 8 posts. The map is **not** visible.
2. **Map toggle:** click Map. Tiles render with no grey tiles or blank areas, and markers are coloured teal, amber or violet. Resize the window, then switch to List and back to Map, and the map is still correctly sized. Click a marker to open the detail. The header, FAB and sheet all sit above the Leaflet zoom controls.
3. **Filters:** Unanswered shows the electrician and pediatrician asks. Alerts hides the strip and lists 3 alert cards. Events shows 2 event cards with date blocks.
4. **Adaptive radius:** set the radius to 1 km. A divider "A bit further away (1–3 km)" (and later bands) appears with posts beneath it. At 10 km there is no divider.
5. **Post, answer, helpful, solved:** click "+ Ask", keep the type Ask, pick the tag "plumber", enter the title "Need a plumber for kitchen sink", and post it. The detail opens and shows "Reaching neighbors within 2 km…". Add a comment with the name changed to "Asha". Reopen the post and confirm `firstAnswerAt` is set (with `Store.getPost(id)` in the console). Click Helpful on Asha's answer (the count becomes 1), then click it again (the count goes back to 0), then click it once more. Click "This solved it". The answer moves to the top with "✓ Solved it", and the card shows "Answered in 0 min" and the Answered state.
6. **Search after expiry:** in the console, set the created post's `createdAt`, `expiresAt`, `firstAnswerAt`, `solvedAt` and comment `createdAt` values 31 days in the past (shift all of them, or "Answered in" shows about 31 d) (edit `localStorage["mohalla.posts.v1"]`), then reload. The post is gone from the feed. Type "plumber" in the search box. It appears labelled "From 1 month ago". Set the radius to 10 km: the seed Bellandur plumber ask also appears.
7. **Search empty state:** search "zzzz". The empty state offers "Search up to 10 km" and "Ask it instead". The second one opens the composer with the title prefilled.
8. **Alert and Event composer:** switch the type to Alert. The tag, phone and kind fields hide and the "Expected until" field shows. Switch to Event: submitting without a start time shows an inline error.
9. **Deep link:** open a detail and click Copy link. Paste it into a new tab. The app opens centred on that post with the detail open and **no** geolocation prompt. Close the detail, and `post=` disappears from the URL. Open `#post=nope`: a toast appears and the normal feed loads. Share on WhatsApp opens `wa.me/?text=` with the title and link.
10. **Migration:** in a clean profile, set `localStorage["mohalla.posts.v1"]` to a v1 payload (`{"schemaVersion":1,"posts":[...]}` with one `service` post (pincode `560034`, area "Indiranagar"), one `road` post (pincode `560034`, area "Domlur", which is what real v1 data contains) and one post with pincode `560034b`), then reload. There is no console error. The user posts appear as Ask and Alert with pincodes corrected to 560038/560071/560071, the Mahadevapura seeds are present, and `mohalla.posts.backup` holds the original payload. Repeat with `localStorage["mohalla.posts.v1"]="{not json"`: the app reseeds without crashing.
11. **XSS:** post an Ask titled `<img src=x onerror=alert(1)>` and comment `<b>hi</b>`. They render as literal text in the card, the detail, the map tooltip and search results. No alert fires.
12. **Mobile (DevTools, 375×812):** the FAB "+ Ask" is visible and the header button is hidden. The chips scroll horizontally. The composer and detail open as bottom sheets. The Map view fills the remaining height, with no page horizontal scroll.
13. **Hidden attribute:** open and close the location panel, composer, detail and status banner repeatedly. Each one fully disappears, with no leftover blank boxes.

---

## Review notes

An independent review against CHANGES-v1.2.md and the current source. Coverage of CHANGES §1–7, "Done when", the out-of-scope PLAN.md items, and the user's asks (minimalist UI, map hidden behind a List/Map toggle, the rename to "pincode") is complete.

**Edits made (definite errors or missing steps):**
1. **D7 / §3.10 reach:** the limit now applies only to *unanswered* asks. As written, it hid 5 of the 9 nearby seeds from the default 5 km feed, which broke "lively feed" and acceptance step 1.
2. **D5 Unanswered:** offers are excluded (otherwise seed-mdp-02 breaks step 3). Added a duration format for "Answered in".
3. **§3.5 computeExpiry:** `startsAt + 3h` with a null `startsAt` gives a 1970 expiry.
4. **§3.5a:** the existing `expireSweep`, `confirm` and `createPost` read `CATEGORY_META` / `category`, and would throw once the constant is removed.
5. **§3.8 migrate:** added a raw backup before any overwrite (the catch-then-reseed path was a data-loss path). Fixed the Domlur pincode: real v1 data holds `560034`+"Domlur", never `560034b`, because of the suffix-strip hack. Non-active statuses are preserved, `kind` defaults to request, and `category` is dropped.
6. **Seeds:** comment offsets are relative to the post, comment ids are stable, comment authorIds are not `seed-device`, and `firstAnswerAt` is derived rather than hand-typed.
7. **§5 geo:** fixed the `code`→`pincode` shape mismatch.
8. **§2 index.html:** the location panel goes inside the sticky header. Named the form, phone and close-button ids.
9. **§6:** state starts at DEFAULT_LOC; added a `cacheEls` null check; hash validation plus `syncControls`; radius circle update; map markers include strip alerts via `lastMapItems`; defined the missing `fitView`; set the map height *before* Leaflet init and always re-fit on show; reset the composer pin; validate dates; normalise the wa.me number; `#map{height:100%}`.
10. **§1:** fixed the contradictory mobile placement of the switch.
11. **Tests 6 and 10:** adjusted to match real data.

**Judgement calls left as-is:**
- **D1:** the tagline sits in the ask prompt, not the header. I agree, since two taglines in a minimalist header is clutter. The title uses "·" where the user wrote "-", so confirm with the user.
- **D6:** name-based "answers" let an author self-answer and self-solve under another name. That's fine for the demo.
- **D21:** dropping v1 seeds also drops the user's comments and votes on them. This is acceptable, and the backup now keeps them recoverable.
- **"Search up to 10 km"** runs outside `state`, so the summary and hash don't reflect it. Consider a transient `searchRadiusKm` that is cleared when the query changes.
- **Owner reach badge copy:** it should vary (2→5, 5→10, stopped once answered) rather than always reading "widens to 5 km".
- The coordinates in §4 are still unverified.
