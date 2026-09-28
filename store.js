// Data layer. Everything lives in localStorage. Swap this module for a real
// backend later without touching app.js, as long as the public API at the
// bottom stays the same.
//
// Storage keys keep their legacy "mohalla.*" names on purpose: renaming them
// would silently drop existing users' data.
(function () {
  "use strict";

  var SCHEMA_VERSION = 2;
  var LS_POSTS = "mohalla.posts.v1";
  var LS_POSTS_BACKUP = "mohalla.posts.backup";
  var LS_DEVICE = "mohalla.deviceId.v1";
  var LS_NAME = "mohalla.lastName.v1";
  var LS_GEOCACHE = "mohalla.geocache.v1";

  var MIN = 60 * 1000, H = 60 * MIN, D = 24 * H;
  var EXPIRY_MS = { ask: 30 * D, alert: 24 * H };
  var EVENT_DEFAULT_MS = 3 * H;

  var TYPE_META = {
    ask: { label: "Ask", color: "#0f766e" },
    alert: { label: "Alert", color: "#b45309" },
    event: { label: "Event", color: "#6d5bd0" }
  };
  var TAGS = ["cook", "maid", "repair", "electrician", "plumber", "pets", "doctor", "other"];

  // ---------- helpers ----------

  function uid() {
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  }

  function safeGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn("localStorage read failed for", key, e);
      return fallback;
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn("localStorage write failed for", key, e);
      return false;
    }
  }

  function getDeviceId() {
    var id = null;
    try { id = localStorage.getItem(LS_DEVICE); } catch (e) {}
    if (!id) {
      id = uid();
      try { localStorage.setItem(LS_DEVICE, id); } catch (e) {}
    }
    return id;
  }

  function getLastName() {
    try { return localStorage.getItem(LS_NAME) || ""; } catch (e) { return ""; }
  }
  function setLastName(name) {
    try { localStorage.setItem(LS_NAME, name); } catch (e) {}
  }

  function norm(s) { return (s || "").trim().toLowerCase(); }

  // A comment counts as an "answer" if it isn't from the post's author, or is
  // posted under a different name. (Demo rule so a single device can play both
  // sides; v2 replaces it with real accounts.)
  function isAnswer(post, c) {
    return c.authorId !== post.authorId || norm(c.authorName) !== norm(post.authorName);
  }

  function recomputeFirstAnswerAt(post) {
    var min = null;
    (post.comments || []).forEach(function (c) {
      if (isAnswer(post, c) && (min === null || c.createdAt < min)) min = c.createdAt;
    });
    post.firstAnswerAt = min;
    return min;
  }

  // Simulated "reach": how far an unanswered Ask is shown. Computed at read time.
  function reachKm(post, now) {
    if (post.type !== "ask") return Infinity;
    now = now || Date.now();
    var elapsed = (post.firstAnswerAt || now) - post.createdAt;
    if (elapsed < 30 * MIN) return 2;
    if (elapsed < 2 * H) return 5;
    return 10;
  }

  function computeExpiry(type, createdAt, startsAt, endsAt) {
    if (type === "ask") return createdAt + EXPIRY_MS.ask;
    if (type === "alert") return endsAt || createdAt + EXPIRY_MS.alert;
    // event
    if (endsAt) return endsAt;
    if (startsAt) return startsAt + EVENT_DEFAULT_MS;
    return createdAt + 30 * D;
  }

  function inferTag(text) {
    var t = norm(text);
    var map = [
      ["cook", /\b(cook|chef)\b/],
      ["maid", /\b(maid|house ?help|nanny)\b/],
      ["repair", /\b(carpenter|furniture|repair|upholster)/],
      ["electrician", /\b(electrician|wiring)\b/],
      ["plumber", /\b(plumber|leak)\b/],
      ["pets", /\b(dog|cat|pet|puppy)\b/],
      ["doctor", /\b(doctor|pediatrician|paediatrician|clinic)\b/]
    ];
    for (var i = 0; i < map.length; i++) if (map[i][1].test(t)) return map[i][0];
    return null;
  }

  // ---------- load / migrate / save ----------

  function savePosts(posts) {
    safeSet(LS_POSTS, { schemaVersion: SCHEMA_VERSION, posts: posts });
  }

  function loadPosts() {
    var rawStr = null;
    try { rawStr = localStorage.getItem(LS_POSTS); } catch (e) {}
    var data = null;
    if (rawStr) {
      try { data = JSON.parse(rawStr); } catch (e) { console.warn("Corrupt posts JSON, reseeding", e); }
    }
    if (data && data.schemaVersion === SCHEMA_VERSION && Array.isArray(data.posts)) return data.posts;

    // Anything else is about to be replaced: keep the raw original recoverable.
    if (rawStr) { try { localStorage.setItem(LS_POSTS_BACKUP, rawStr); } catch (e) {} }

    var out;
    try { out = migrate(data); } catch (e) {
      console.warn("Migration failed, reseeding", e);
      out = seedPosts();
    }
    savePosts(out);
    return out;
  }

  function migrate(data) {
    if (!data || !Array.isArray(data.posts)) return seedPosts();
    if (data.schemaVersion !== 1) return seedPosts(); // unknown / future version
    var TYPE_MAP = { road: "alert", utility: "alert", construction: "alert", service: "ask", general: "ask", event: "event" };
    var now = Date.now();
    var migrated = data.posts
      .filter(function (p) { return p && p.authorId !== "seed-device"; })
      .map(function (p) {
        var type = TYPE_MAP[p.category] || "ask";
        var pin = p.pincode, area = p.area;
        if (pin === "560034b" || (pin === "560034" && /domlur/i.test(area || ""))) { pin = "560071"; area = "Domlur"; }
        else if (pin === "560034" && /indiranagar/i.test(area || "")) { pin = "560038"; area = "Indiranagar"; }
        else if (pin === "560038" && /indiranagar east/i.test(area || "")) { area = "Indiranagar"; }
        var post = Object.assign({}, p, {
          schemaVersion: SCHEMA_VERSION,
          type: type,
          tag: type === "ask" ? inferTag((p.title || "") + " " + (p.body || "")) : null,
          kind: type === "ask" ? (p.kind || "request") : null,
          pincode: pin, area: area,
          comments: (p.comments || []).map(function (c) { return Object.assign({}, c, { helpfulIds: c.helpfulIds || [] }); }),
          solvedCommentId: null, solvedAt: null, firstAnswerAt: null
        });
        delete post.category;
        recomputeFirstAnswerAt(post);
        post.expiresAt = computeExpiry(type, post.createdAt, post.startsAt, post.endsAt);
        // Only an active post may become expired; never revive or alter other statuses.
        if (post.status === "active" && now > post.expiresAt) post.status = "expired";
        return post;
      });
    return migrated.concat(seedPosts());
  }

  function expireSweep(posts) {
    var now = Date.now(), changed = false;
    posts.forEach(function (p) {
      if (p.status === "active" && p.expiresAt && now > p.expiresAt) { p.status = "expired"; changed = true; }
    });
    if (changed) savePosts(posts);
    return posts;
  }

  // ---------- query helpers ----------

  function visibleBase(post, deviceId) {
    if (post.status === "hidden") return false;
    if (post.hiddenFor && post.hiddenFor.indexOf(deviceId) !== -1) return false;
    return true;
  }

  function matchesFilterOpts(post, opts) {
    if (opts.type && post.type !== opts.type) return false;
    if (opts.filter === "unanswered") {
      if (!(post.type === "ask" && post.kind !== "offer" && post.status === "active" && !post.firstAnswerAt)) return false;
    }
    return true;
  }

  // ---------- public API ----------

  var Store = {
    TYPE_META: TYPE_META,
    TAGS: TAGS,
    getDeviceId: getDeviceId,
    getLastName: getLastName,
    setLastName: setLastName,
    isAnswer: isAnswer,
    reachKm: reachKm,

    listAll: function () { return expireSweep(loadPosts()); },

    // opts: type, filter("unanswered"), minKm (exclusive), sortBy("newest"|"nearest"),
    //       includeExpired, respectReach (default true)
    listPostsNear: function (lat, lng, radiusKm, opts) {
      opts = opts || {};
      var deviceId = getDeviceId(), now = Date.now();
      var respectReach = opts.respectReach !== false;
      var items = [];
      this.listAll().forEach(function (post) {
        if (!visibleBase(post, deviceId)) return;
        if (!opts.includeExpired && post.status !== "active") return;
        if (!matchesFilterOpts(post, opts)) return;
        var dist = window.haversineKm(lat, lng, post.lat, post.lng);
        if (dist > radiusKm) return;
        if (opts.minKm != null && dist <= opts.minKm) return;
        var reach = reachKm(post, now);
        if (respectReach && post.type === "ask" && !post.firstAnswerAt && post.authorId !== deviceId && dist > reach) return;
        items.push({ post: post, distKm: dist, reachKm: reach });
      });
      items.sort(function (a, b) {
        return opts.sortBy === "nearest" ? a.distKm - b.distKm : b.post.createdAt - a.post.createdAt;
      });
      return items;
    },

    // Search titles, bodies, tags and comments within the radius. Includes
    // expired/resolved Asks so old recommendations stay findable.
    searchNear: function (lat, lng, radiusKm, query, opts) {
      opts = opts || {};
      var terms = norm(query).split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      var deviceId = getDeviceId();
      var results = [];
      this.listAll().forEach(function (post) {
        if (!visibleBase(post, deviceId)) return;
        var searchable = post.status === "active" ||
          (post.type === "ask" && (post.status === "expired" || post.status === "resolved"));
        if (!searchable) return;
        if (!matchesFilterOpts(post, opts.filter === "unanswered" ? { type: opts.type, filter: "unanswered" } : { type: opts.type })) return;
        var dist = window.haversineKm(lat, lng, post.lat, post.lng);
        if (dist > radiusKm) return;
        var title = norm(post.title), tag = norm(post.tag), body = norm(post.body);
        var comments = norm((post.comments || []).map(function (c) { return c.body; }).join(" "));
        var score = 0, matchedIn = null, ok = true;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i], s = 0, where = null;
          if (title.indexOf(t) !== -1) { s += 3; where = where || "title"; }
          if (tag.indexOf(t) !== -1) { s += 3; where = where || "tag"; }
          if (body.indexOf(t) !== -1) { s += 2; where = where || "body"; }
          if (comments.indexOf(t) !== -1) { s += 1; where = where || "comment"; }
          if (!s) { ok = false; break; }
          score += s; matchedIn = matchedIn || where;
        }
        if (ok) results.push({ post: post, distKm: dist, matchedIn: matchedIn, score: score });
      });
      results.sort(function (a, b) { return b.score - a.score || b.post.createdAt - a.post.createdAt; });
      return results;
    },

    getPost: function (id) {
      return this.listAll().find(function (p) { return p.id === id; }) || null;
    },

    createPost: function (input) {
      var posts = loadPosts();
      var now = Date.now();
      var type = input.type === "alert" || input.type === "event" ? input.type : "ask";
      var tag = type === "ask" && input.tag ? String(input.tag).trim().toLowerCase().slice(0, 20) : null;
      var phone = type === "ask" && input.phone ? String(input.phone).trim().slice(0, 20) : null;
      var lat = input.lat, lng = input.lng, locPrecision = "exact";
      if (phone) { // round to ~200 m so a contact post doesn't pin someone's doorstep
        lat = Math.round(lat * 500) / 500;
        lng = Math.round(lng * 500) / 500;
        locPrecision = "approx";
      }
      var post = {
        id: uid(), schemaVersion: SCHEMA_VERSION, type: type,
        tag: tag || null,
        kind: type === "ask" ? (input.kind === "offer" ? "offer" : "request") : null,
        title: (input.title || "").trim().slice(0, 120),
        body: (input.body || "").trim().slice(0, 1000),
        lat: lat, lng: lng, locPrecision: locPrecision,
        pincode: input.pincode || "", area: input.area || "", city: input.city || "",
        authorId: getDeviceId(),
        authorName: (input.authorName || "Neighbor").trim().slice(0, 60) || "Neighbor",
        phone: phone,
        createdAt: now, updatedAt: now,
        startsAt: input.startsAt || null, endsAt: input.endsAt || null,
        status: "active",
        firstAnswerAt: null, solvedCommentId: null, solvedAt: null,
        upvotes: 0, voterIds: [],
        confirmations: { stillOnCount: 0, resolvedCount: 0, lastAt: null, byIds: [] },
        reports: 0, hiddenFor: [], comments: []
      };
      post.expiresAt = computeExpiry(type, now, post.startsAt, post.endsAt);
      posts.push(post);
      savePosts(posts);
      return post;
    },

    updatePost: function (id, patch) {
      var posts = loadPosts();
      var post = posts.find(function (p) { return p.id === id; });
      if (!post || post.authorId !== getDeviceId()) return null;
      Object.assign(post, patch, { updatedAt: Date.now() });
      savePosts(posts);
      return post;
    },

    deletePost: function (id) {
      var posts = loadPosts();
      var idx = posts.findIndex(function (p) { return p.id === id; });
      if (idx === -1 || posts[idx].authorId !== getDeviceId()) return false;
      posts.splice(idx, 1);
      savePosts(posts);
      return true;
    },

    markResolved: function (id) { return this.updatePost(id, { status: "resolved" }); },

    vote: function (id) {
      var posts = loadPosts(), deviceId = getDeviceId();
      var post = posts.find(function (p) { return p.id === id; });
      if (!post) return null;
      var i = post.voterIds.indexOf(deviceId);
      if (i !== -1) { post.voterIds.splice(i, 1); post.upvotes = Math.max(0, post.upvotes - 1); }
      else { post.voterIds.push(deviceId); post.upvotes += 1; }
      savePosts(posts);
      return post;
    },

    // type: "stillOn" | "resolved" (alerts). One confirmation per device.
    confirm: function (id, type) {
      var posts = loadPosts(), deviceId = getDeviceId(), now = Date.now();
      var post = posts.find(function (p) { return p.id === id; });
      if (!post) return null;
      if (post.confirmations.byIds.indexOf(deviceId) !== -1) return post;
      post.confirmations.byIds.push(deviceId);
      post.confirmations.lastAt = now;
      if (type === "stillOn") {
        post.confirmations.stillOnCount += 1;
        if (post.type === "alert") post.expiresAt = Math.max(post.expiresAt || 0, now + EXPIRY_MS.alert);
      } else {
        post.confirmations.resolvedCount += 1;
        if (post.confirmations.resolvedCount >= 2) post.status = "resolved";
      }
      savePosts(posts);
      return post;
    },

    addComment: function (id, authorName, body) {
      var posts = loadPosts();
      var post = posts.find(function (p) { return p.id === id; });
      if (!post) return null;
      var text = (body || "").trim().slice(0, 500);
      if (!text) return null;
      var comment = {
        id: uid(), authorId: getDeviceId(),
        authorName: (authorName || "Neighbor").trim().slice(0, 60) || "Neighbor",
        body: text, createdAt: Date.now(), helpfulIds: []
      };
      post.comments.push(comment);
      if (isAnswer(post, comment) && !post.firstAnswerAt) post.firstAnswerAt = comment.createdAt;
      savePosts(posts);
      return comment;
    },

    toggleHelpful: function (postId, commentId) {
      var posts = loadPosts(), deviceId = getDeviceId();
      var post = posts.find(function (p) { return p.id === postId; });
      if (!post) return null;
      var c = post.comments.find(function (x) { return x.id === commentId; });
      if (!c) return null;
      c.helpfulIds = c.helpfulIds || [];
      var i = c.helpfulIds.indexOf(deviceId);
      if (i !== -1) c.helpfulIds.splice(i, 1); else c.helpfulIds.push(deviceId);
      savePosts(posts);
      return post;
    },

    // Author only; the comment must be an answer. Toggles if already solved by it.
    markSolved: function (postId, commentId) {
      var posts = loadPosts();
      var post = posts.find(function (p) { return p.id === postId; });
      if (!post || post.authorId !== getDeviceId()) return null;
      var c = post.comments.find(function (x) { return x.id === commentId; });
      if (!c || !isAnswer(post, c)) return null;
      if (post.solvedCommentId === commentId) { post.solvedCommentId = null; post.solvedAt = null; }
      else { post.solvedCommentId = commentId; post.solvedAt = Date.now(); }
      savePosts(posts);
      return post;
    },

    // Solved first, then most helpful, then oldest. Returns a copy.
    sortedComments: function (post) {
      return (post.comments || []).slice().sort(function (a, b) {
        var sa = a.id === post.solvedCommentId ? 1 : 0, sb = b.id === post.solvedCommentId ? 1 : 0;
        if (sa !== sb) return sb - sa;
        var ha = (a.helpfulIds || []).length, hb = (b.helpfulIds || []).length;
        if (ha !== hb) return hb - ha;
        return a.createdAt - b.createdAt;
      });
    },

    report: function (id) {
      var posts = loadPosts(), deviceId = getDeviceId();
      var post = posts.find(function (p) { return p.id === id; });
      if (!post) return null;
      post.reports += 1;
      if (post.hiddenFor.indexOf(deviceId) === -1) post.hiddenFor.push(deviceId);
      if (post.reports >= 5) post.status = "hidden";
      savePosts(posts);
      return post;
    },

    isHiddenForMe: function (post) {
      return !!post.hiddenFor && post.hiddenFor.indexOf(getDeviceId()) !== -1;
    },

    resetDemoData: function () { savePosts(seedPosts()); },

    geocacheGet: function (key) { return safeGet(LS_GEOCACHE, {})[key] || null; },
    geocacheSet: function (key, value) {
      var cache = safeGet(LS_GEOCACHE, {});
      cache[key] = value;
      safeSet(LS_GEOCACHE, cache);
    }
  };

  // ---------- seed data ----------
  // Stable ids so shared #post=<id> links work for demo posts on any device.
  // Timestamps are relative to "now" so alerts don't all expire after a day.

  function seedPosts() {
    var now = Date.now();

    // o: id,type,tag,kind,title,body,lat,lng,area,pincode,city,authorName,ageMs,phone,
    //    upvotes,comments:[[name,body,offsetMs,helpfulCount]], solved:(0-based comment idx),
    //    startsIn,durMs (events), untilIn (alerts), stillOn, status, expiresIn
    function seed(o) {
      var createdAt = now - o.ageMs;
      var startsAt = o.startsIn != null ? now + o.startsIn : null;
      var endsAt = o.durMs != null && startsAt ? startsAt + o.durMs : (o.untilIn != null ? now + o.untilIn : null);
      var comments = (o.comments || []).map(function (c, i) {
        var hp = [];
        for (var k = 0; k < (c[3] || 0); k++) hp.push("seed-h" + (k + 1));
        return {
          id: o.id + "-c" + (i + 1),
          authorId: "seed-user-" + norm(c[0]).replace(/\W+/g, "-"),
          authorName: c[0], body: c[1],
          createdAt: createdAt + c[2], helpfulIds: hp
        };
      });
      var post = {
        id: o.id, schemaVersion: SCHEMA_VERSION, type: o.type,
        tag: o.tag || null,
        kind: o.type === "ask" ? (o.kind || "request") : null,
        title: o.title, body: o.body || "",
        lat: o.lat, lng: o.lng, locPrecision: o.phone ? "approx" : "exact",
        pincode: o.pincode, area: o.area, city: o.city || "Bengaluru",
        authorId: "seed-device", authorName: o.authorName,
        phone: o.phone || null,
        createdAt: createdAt, updatedAt: createdAt,
        startsAt: startsAt, endsAt: endsAt,
        status: o.status || "active",
        firstAnswerAt: null,
        solvedCommentId: o.solved != null ? comments[o.solved].id : null,
        solvedAt: o.solved != null ? comments[o.solved].createdAt + 5 * MIN : null,
        upvotes: o.upvotes || 0, voterIds: [],
        confirmations: {
          stillOnCount: o.stillOn || 0, resolvedCount: 0,
          lastAt: o.stillOn ? now - 20 * MIN : null, byIds: []
        },
        reports: 0, hiddenFor: [], comments: comments
      };
      recomputeFirstAnswerAt(post);
      post.expiresAt = o.expiresIn != null ? now + o.expiresIn : computeExpiry(o.type, createdAt, startsAt, endsAt);
      return post;
    }

    var BLR = "Bengaluru";
    return [
      // ---- Home market: Mahadevapura belt ----
      seed({ id: "seed-mdp-01", type: "ask", tag: "cook", kind: "request", ageMs: 5 * H, upvotes: 6,
        title: "Looking for a cook for lunch + dinner, veg, near Hoodi",
        body: "Family of four, vegetarian, 6 days a week. Happy to pay well for someone reliable. Prefer someone who can start next week.",
        lat: 12.9913, lng: 77.7159, area: "Hoodi", pincode: "560048", city: BLR, authorName: "Priya",
        comments: [
          ["Kavitha", "Our cook Sumathi is excellent, vegetarian specialist, works in Hoodi already. Happy to share her number.", 18 * MIN, 4],
          ["Rohan", "Try the notice board at the Hoodi Circle market, a few cooks post there.", 45 * MIN, 2],
          ["Anjali", "We use an agency, Sri Sai Services. Bit costly but replacements are guaranteed.", 2 * H, 0]
        ], solved: 0 }),
      seed({ id: "seed-mdp-02", type: "ask", tag: "maid", kind: "offer", ageMs: 1 * D, upvotes: 3, phone: "9845012345",
        title: "Part-time house help available, mornings",
        body: "8 years experience, references from two nearby families. Sweeping, mopping, utensils. Looking for 2 more houses.",
        lat: 12.9926, lng: 77.6946, area: "Mahadevapura", pincode: "560048", city: BLR, authorName: "Lakshmi" }),
      seed({ id: "seed-mdp-03", type: "ask", tag: "repair", kind: "request", ageMs: 2 * D, upvotes: 5,
        title: "Good carpenter for wardrobe hinges and a sagging door?",
        body: "Two wardrobe doors don't close properly and the bedroom door is dragging on the floor. Need someone honest who does small jobs.",
        lat: 12.9667, lng: 77.7167, area: "Brookefield", pincode: "560037", city: BLR, authorName: "Deepak",
        comments: [
          ["Suresh", "Ramesh carpenter near Kundalahalli gate, fixed my wardrobe for 600 rupees. Very neat work.", 25 * MIN, 3],
          ["Meera", "Second Ramesh. He also does polish touch-ups if you ask.", 3 * H, 1]
        ], solved: 0 }),
      seed({ id: "seed-mdp-04", type: "ask", tag: "repair", kind: "request", ageMs: 21 * D, upvotes: 4,
        title: "Sofa re-upholstery recommendations?",
        body: "A 3-seater sofa with a sagging cushion base. Looking for someone who can re-do the fabric and foam.",
        lat: 12.9569, lng: 77.7011, area: "Marathahalli", pincode: "560037", city: BLR, authorName: "Neha",
        comments: [
          ["Imran", "Ali Furnishings on Marathahalli bridge service road. Did our sofa in 4 days, fair price.", 40 * MIN, 5],
          ["Sunita", "Agree with Ali. Ask for the high-density foam, it lasts longer.", 6 * H, 2]
        ], solved: 0 }),
      seed({ id: "seed-mdp-05", type: "ask", tag: "plumber", kind: "request", ageMs: 40 * D, upvotes: 2, status: "expired",
        title: "Plumber for a bathroom leak, Bellandur",
        body: "Slow leak behind the bathroom wall, seepage into the next room. Need someone who can find the source without breaking everything.",
        lat: 12.9260, lng: 77.6762, area: "Bellandur", pincode: "560103", city: BLR, authorName: "Karthik",
        comments: [
          ["Vijay", "Use Mahesh, he has a moisture meter. Found ours in ten minutes.", 55 * MIN, 3],
          ["Farah", "Seconded. Cheaper than the app-based services too.", 4 * H, 1]
        ], solved: 0, expiresIn: -10 * D }),
      seed({ id: "seed-mdp-06", type: "ask", tag: "electrician", kind: "request", ageMs: 40 * MIN, upvotes: 1,
        title: "Electrician today — MCB keeps tripping",
        body: "The main MCB trips every few minutes since this morning. Anyone have a reliable electrician near KR Puram who can come today?",
        lat: 13.0077, lng: 77.6960, area: "KR Puram", pincode: "560036", city: BLR, authorName: "Arjun" }),
      seed({ id: "seed-mdp-07", type: "ask", tag: "doctor", kind: "request", ageMs: 10 * MIN, upvotes: 0,
        title: "Pediatrician open on Sundays nearby?",
        body: "Toddler with a mild fever, our regular clinic is closed on Sundays. Any recommendations close to Mahadevapura?",
        lat: 12.9930, lng: 77.6920, area: "Mahadevapura", pincode: "560048", city: BLR, authorName: "Divya" }),
      seed({ id: "seed-mdp-08", type: "ask", tag: "pets", kind: "request", ageMs: 8 * H, upvotes: 9,
        title: "Lost: brown indie dog 'Bruno', red collar",
        body: "Went missing near the Brookefield park gate this morning. Very friendly, answers to Bruno. Please call if seen.",
        lat: 12.9680, lng: 77.7150, area: "Brookefield", pincode: "560037", city: BLR, authorName: "Nisha",
        comments: [["Ganesh", "Saw a brown dog with a red collar near the ITPL back gate around 2 pm.", 90 * MIN, 1]] }),
      seed({ id: "seed-mdp-09", type: "ask", tag: "other", kind: "offer", ageMs: 3 * D, upvotes: 2,
        title: "Offering maths tuition, classes 6–8",
        body: "Retired teacher, 30 years experience. Small groups of up to four, evenings near Hoodi.",
        lat: 12.9900, lng: 77.7140, area: "Hoodi", pincode: "560048", city: BLR, authorName: "Mr. Iyer",
        comments: [["Pooja", "Do you take a trial class? My son is in class 7.", 4 * H, 0]] }),
      seed({ id: "seed-mdp-10", type: "alert", ageMs: 90 * MIN, upvotes: 8, stillOn: 3,
        title: "ORR service road jammed near Hoodi junction — metro work",
        body: "One lane closed for barricading. Expect 20–30 min delays towards Marathahalli. Main ORR is moving better.",
        lat: 12.9920, lng: 77.7150, area: "Hoodi", pincode: "560048", city: BLR, authorName: "Ravi" }),
      seed({ id: "seed-mdp-11", type: "alert", ageMs: 3 * H, upvotes: 4, untilIn: 3 * H,
        title: "BESCOM power cut, expected back ~4 pm",
        body: "Planned maintenance on the feeder line. Ward 84 and nearby apartments affected.",
        lat: 12.9905, lng: 77.6960, area: "Mahadevapura", pincode: "560048", city: BLR, authorName: "Suresh" }),
      seed({ id: "seed-mdp-12", type: "alert", ageMs: 6 * H, upvotes: 5,
        title: "No Cauvery water supply today, tankers near the temple",
        body: "Pipeline repair, supply resumes tomorrow morning. Tankers are stationed by the temple on the main road.",
        lat: 13.0070, lng: 77.6975, area: "KR Puram", pincode: "560036", city: BLR, authorName: "Rekha" }),
      seed({ id: "seed-mdp-13", type: "event", ageMs: 1 * D, upvotes: 7, startsIn: 2 * D, durMs: 8 * H,
        title: "Sunday flea market at our apartment clubhouse",
        body: "Local sellers, home bakers, plants and handmade jewellery. Open to everyone, entry from the main gate.",
        lat: 12.9698, lng: 77.7500, area: "Whitefield", pincode: "560066", city: BLR, authorName: "Anita" }),
      seed({ id: "seed-mdp-14", type: "event", ageMs: 12 * H, upvotes: 6, startsIn: 1 * D, durMs: 2 * H,
        title: "Saturday morning yoga by the lake, all welcome",
        body: "Bring your own mat. A gentle session for beginners, followed by tea.",
        lat: 12.9880, lng: 77.6990, area: "Mahadevapura", pincode: "560048", city: BLR, authorName: "Sneha" }),

      // ---- Other neighbourhoods ----
      seed({ id: "seed-oth-01", type: "alert", ageMs: 2 * H, upvotes: 2, stillOn: 2,
        title: "100 Feet Road partially blocked near CMH junction",
        body: "Metro pillar work has one lane closed since morning. Heavy backup towards Domlur.",
        lat: 12.9719, lng: 77.6412, area: "Indiranagar", pincode: "560038", city: BLR, authorName: "Ravi" }),
      seed({ id: "seed-oth-02", type: "ask", tag: "maid", kind: "offer", ageMs: 1 * D, upvotes: 2, phone: "9845098765",
        title: "Reliable maid available, mornings",
        body: "8 years experience, references available. Looking for 2–3 houses in the area.",
        lat: 12.9720, lng: 77.6410, area: "Indiranagar", pincode: "560038", city: BLR, authorName: "Lakshmi" }),
      seed({ id: "seed-oth-03", type: "ask", tag: "electrician", kind: "request", ageMs: 6 * H, upvotes: 7,
        title: "Anyone know a good electrician nearby?",
        body: "Need someone for a small rewiring job, not urgent.",
        lat: 12.9715, lng: 77.6402, area: "Indiranagar", pincode: "560038", city: BLR, authorName: "Kabir",
        comments: [["Latha", "Try Manjunath, 98450 33221 area. Did our whole flat, very tidy.", 35 * MIN, 2]] }),
      seed({ id: "seed-oth-04", type: "alert", ageMs: 4 * H, upvotes: 7, stillOn: 1,
        title: "Waterlogging near Sony World signal",
        body: "Rain last night flooded the underpass, avoid two-wheelers.",
        lat: 12.9352, lng: 77.6245, area: "Koramangala", pincode: "560034", city: BLR, authorName: "Deepak" }),
      seed({ id: "seed-oth-05", type: "ask", tag: "pets", kind: "request", ageMs: 2 * D, upvotes: 11,
        title: "Street dog needs a home",
        body: "Friendly, vaccinated, currently being fed by residents near 6th block.",
        lat: 12.9361, lng: 77.6259, area: "Koramangala", pincode: "560034", city: BLR, authorName: "Farah" }),
      seed({ id: "seed-oth-06", type: "alert", ageMs: 3 * H, upvotes: 4,
        title: "Road dug up near Hauz Khas metro gate 2",
        body: "Sewer line work, expect delays till evening.",
        lat: 28.5494, lng: 77.2001, area: "Hauz Khas", pincode: "110016", city: "Delhi", authorName: "Ankit" }),
      seed({ id: "seed-oth-07", type: "ask", tag: "cook", kind: "offer", ageMs: 36 * H, upvotes: 3, phone: "9899011223",
        title: "Experienced cook available, full-time",
        body: "North and South Indian cooking, currently free from next month.",
        lat: 28.5501, lng: 77.1988, area: "Hauz Khas", pincode: "110016", city: "Delhi", authorName: "Sunita" }),
      seed({ id: "seed-oth-08", type: "alert", ageMs: 6 * H, upvotes: 3,
        title: "Linking Road traffic diversion",
        body: "BMC repaving work, use SV Road as an alternate route.",
        lat: 19.0596, lng: 72.8295, area: "Bandra West", pincode: "400050", city: "Mumbai", authorName: "Farhan" }),
      seed({ id: "seed-oth-09", type: "ask", tag: "maid", kind: "request", ageMs: 12 * H, upvotes: 8,
        title: "Need a part-time nanny, afternoons",
        body: "2–6pm on weekdays, for a 4-year-old.",
        lat: 19.0610, lng: 72.8301, area: "Bandra West", pincode: "400050", city: "Mumbai", authorName: "Zara" }),
      seed({ id: "seed-oth-10", type: "alert", ageMs: 4 * H, upvotes: 2, untilIn: 20 * H,
        title: "Scheduled power shutdown, Madhapur",
        body: "TSSPDCL maintenance 10am–2pm tomorrow.",
        lat: 17.4483, lng: 78.3915, area: "Madhapur", pincode: "500033", city: "Hyderabad", authorName: "Kiran" }),
      seed({ id: "seed-oth-11", type: "ask", tag: "doctor", kind: "request", ageMs: 18 * H, upvotes: 1,
        title: "Recommendations for a good pediatrician?",
        body: "Recently moved to the area, looking for someone nearby.",
        lat: 17.4425, lng: 78.3467, area: "Gachibowli", pincode: "500032", city: "Hyderabad", authorName: "Divya",
        comments: [["Bhavani", "Dr. Rao's clinic near the Gachibowli flyover, very patient with kids.", 70 * MIN, 1]] }),
      seed({ id: "seed-oth-12", type: "event", ageMs: 2 * D, upvotes: 6, startsIn: 4 * D, durMs: 6 * H,
        title: "Society Ganesh Chaturthi celebration",
        body: "Evening aarti and dinner, all residents welcome.",
        lat: 17.4408, lng: 78.3502, area: "Gachibowli", pincode: "500032", city: "Hyderabad", authorName: "RWA Gachibowli" })
    ];
  }

  window.Store = Store;
})();
