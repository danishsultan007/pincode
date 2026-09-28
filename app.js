(function () {
  "use strict";

  var Store = window.Store;
  var TYPE_META = Store.TYPE_META;

  // All user-facing wording lives here (US spelling, per the product name).
  var COPY = {
    locOff: "Location is off — showing Mahadevapura. Search a pincode or pick an area.",
    locWorking: "Getting your location…",
    locDenied: "Location access was denied.",
    locTimeout: "Location request timed out.",
    postGone: "That post isn't on this device (demo data is stored locally).",
    linkCopied: "Link copied",
    emptyFeedTitle: function (km) { return "No one has asked anything within " + km + " km yet."; },
    emptyFeedText: "Be the first — your neighbors will see it.",
    hint: {
      ask: "What do you need? e.g. Good carpenter near Hoodi?",
      alert: "What's happening? e.g. ORR service road flooded",
      event: "What's on? e.g. Sunday flea market"
    },
    submit: { ask: "Post ask", alert: "Post alert", event: "Post event" }
  };

  var DEFAULT_LOC = { lat: 12.9915, lng: 77.6944, area: "Mahadevapura", city: "Bengaluru", pincode: "560048" };
  var RINGS = [1, 3, 5, 10];
  var MIN_FEED = 8;
  var MIN = 60 * 1000, H = 60 * MIN, D = 24 * H;

  var state = {
    lat: DEFAULT_LOC.lat, lng: DEFAULT_LOC.lng,
    area: DEFAULT_LOC.area, city: DEFAULT_LOC.city, pincode: DEFAULT_LOC.pincode,
    locSource: "default",          // default | gps | search
    radiusKm: 5, filter: "all", view: "list", query: "", sortBy: "newest",
    searchRadius: null,            // transient "search up to 10 km"
    openPostId: null, hashLoc: false
  };

  var els = {};
  var map = null, markersLayer = null, radiusCircle = null, mapDirty = true, lastMapItems = [];
  var postMap = null, postMarker = null;
  var newPost = { type: "ask", tag: null, lat: 0, lng: 0 };
  var toastTimer = null, searchTimer = null, resizeTimer = null;

  document.addEventListener("DOMContentLoaded", init);

  // ---------- tiny DOM helpers (user text is only ever set via textContent) ----------

  function el(tag, props, children) {
    var n = document.createElement(tag);
    props = props || {};
    if (props["class"]) n.className = props["class"];
    if (props.text != null) n.textContent = props.text;
    if (props.attrs) Object.keys(props.attrs).forEach(function (k) { n.setAttribute(k, props.attrs[k]); });
    if (props.on) Object.keys(props.on).forEach(function (k) { n.addEventListener(k, props.on[k]); });
    if (props.hidden) n.hidden = true;
    (children || []).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  function svgIcon(d) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "ico");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    s.appendChild(p);
    return s;
  }
  var ICON_CHECK = "M5 13l4 4L19 7";

  function show(node, yes) { node.hidden = !yes; }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 2500);
  }

  // ---------- formatting ----------

  function timeAgo(ts) {
    var s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return "just now";
    var m = Math.floor(s / 60); if (m < 60) return m + "m";
    var h = Math.floor(m / 60); if (h < 24) return h + "h";
    var d = Math.floor(h / 24); if (d < 30) return d + "d";
    return new Date(ts).toLocaleDateString();
  }

  function relAge(ts) {
    var d = Math.floor((Date.now() - ts) / D);
    if (d < 1) return Math.max(1, Math.floor((Date.now() - ts) / H)) + " hours";
    if (d < 7) return d + (d === 1 ? " day" : " days");
    if (d < 30) { var w = Math.floor(d / 7); return w + (w === 1 ? " week" : " weeks"); }
    var mo = Math.floor(d / 30); return mo + (mo === 1 ? " month" : " months");
  }

  function fmtDuration(ms) {
    if (ms < 60 * MIN) return Math.max(0, Math.round(ms / MIN)) + " min";
    if (ms < 48 * H) return Math.round(ms / H) + " h";
    return Math.round(ms / D) + " d";
  }

  function fmtTime(ts) { return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  function fmtWhen(ts) {
    return new Date(ts).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + ", " + fmtTime(ts);
  }
  function fmtKm(x) { return x.toFixed(1) + " km"; }

  function answerCount(p) {
    return (p.comments || []).filter(function (c) { return Store.isAnswer(p, c); }).length;
  }

  // ---------- init ----------

  function init() {
    cacheEls();
    parseHash();
    bindHeader();
    bindFeedControls();
    bindComposer();
    bindDetail();
    bindGlobal();
    syncControls();
    updatePill();
    render();
    if (state.view === "map") setView("map", true);
    boot();
  }

  function cacheEls() {
    var ids = [
      "locationPill", "locationPillText", "askBtnHeader", "locationPanel", "locSearchForm", "locSearchInput",
      "useMyLocationBtn", "radiusOptions", "resetDemoBtn", "statusBanner", "statusText", "statusDismiss",
      "askPrompt", "postSearchForm", "postSearchInput", "postSearchClear", "filterChips", "viewSwitch",
      "alertsStrip", "alertsStripList", "feedSummary", "sortSelect", "listView", "feedList", "emptyState",
      "mapView", "map", "fabAsk", "sheetBackdrop", "postSheet", "composerTitle", "closeSheetBtn", "postForm",
      "typeSwitch", "askFields", "tagChips", "tagCustom", "kindGroup", "phoneField", "postPhone", "postTitle",
      "titleError", "postBody", "alertFields", "postUntil", "untilError", "eventFields", "postStartsAt",
      "postEndsAt", "eventError", "postAuthorName", "postLocText", "adjustPinBtn", "postMapWrap", "postMap",
      "postLocReadout", "cancelPostBtn", "postSubmit", "detailBackdrop", "detailSheet", "detailTypeLabel",
      "closeDetailBtn", "detailBody", "toast"
    ];
    ids.forEach(function (id) {
      els[id] = document.getElementById(id);
      if (!els[id]) console.error("Missing element #" + id);
    });
  }

  async function boot() {
    var openId = state.openPostId;
    state.openPostId = null;
    if (openId) {
      var p = Store.getPost(openId);
      if (p) {
        applyLoc(p.lat, p.lng, "search", { area: p.area, city: p.city, pincode: p.pincode });
        openDetail(openId);
        return;
      }
      toast(COPY.postGone);
    }
    if (state.hashLoc) {
      var rg = await window.Geo.reverseGeocode(state.lat, state.lng);
      applyLoc(state.lat, state.lng, "search", rg);
      return;
    }
    locateOnLoad(false);
  }

  // ---------- URL hash ----------

  function parseHash() {
    var h = location.hash.replace(/^#/, "");
    if (!h) return;
    var lat = null, lng = null;
    h.split("&").forEach(function (part) {
      var kv = part.split("=");
      var k = kv[0], v = decodeURIComponent(kv[1] || "");
      if (k === "lat") lat = parseFloat(v);
      else if (k === "lng") lng = parseFloat(v);
      else if (k === "r") { var r = parseFloat(v); if (RINGS.indexOf(r) !== -1) state.radiusKm = r; }
      else if (k === "f" && ["all", "unanswered", "alerts", "events"].indexOf(v) !== -1) state.filter = v;
      else if (k === "v" && (v === "list" || v === "map")) state.view = v;
      else if (k === "q") state.query = v.slice(0, 60);
      else if (k === "post" && v) state.openPostId = v;
    });
    if (isFinite(lat) && isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && lat !== null && lng !== null) {
      state.lat = lat; state.lng = lng; state.hashLoc = true; state.locSource = "search";
      state.area = ""; state.city = ""; state.pincode = "";
    }
  }

  function writeHash() {
    var parts = [];
    if (state.locSource === "search") { parts.push("lat=" + state.lat.toFixed(5)); parts.push("lng=" + state.lng.toFixed(5)); }
    if (state.radiusKm !== 5) parts.push("r=" + state.radiusKm);
    if (state.filter !== "all") parts.push("f=" + state.filter);
    if (state.view !== "list") parts.push("v=" + state.view);
    if (state.query) parts.push("q=" + encodeURIComponent(state.query));
    if (state.openPostId) parts.push("post=" + encodeURIComponent(state.openPostId));
    var url = location.pathname + location.search + (parts.length ? "#" + parts.join("&") : "");
    try { history.replaceState(null, "", url); } catch (e) {}
  }

  window.addEventListener("hashchange", function () {
    var m = /[#&]post=([^&]+)/.exec(location.hash);
    var id = m ? decodeURIComponent(m[1]) : null;
    if (id === state.openPostId) return;
    if (id) { if (Store.getPost(id)) openDetail(id); else toast(COPY.postGone); }
    else closeDetail();
  });

  // ---------- controls sync ----------

  function syncControls() {
    Array.prototype.forEach.call(els.radiusOptions.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", String(parseFloat(b.dataset.km) === state.radiusKm));
    });
    Array.prototype.forEach.call(els.filterChips.querySelectorAll(".chip"), function (b) {
      b.setAttribute("aria-checked", String(b.dataset.filter === state.filter));
    });
    Array.prototype.forEach.call(els.viewSwitch.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-selected", String(b.dataset.view === state.view));
    });
    if (document.activeElement !== els.postSearchInput) els.postSearchInput.value = state.query;
    els.postSearchClear.hidden = !state.query;
    els.sortSelect.value = state.sortBy;
  }

  function updatePill() {
    var bits = [state.area || state.city || "Your area", state.pincode, state.radiusKm + " km"].filter(Boolean);
    els.locationPillText.textContent = bits.join(" · ");
  }

  // ---------- header / location ----------

  function bindHeader() {
    els.locationPill.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleLocationPanel(els.locationPanel.hidden);
    });
    els.locSearchForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var q = els.locSearchInput.value.trim();
      if (!q) return;
      setStatus("Searching for “" + q + "”…", false);
      var r = await window.Geo.forwardGeocode(q);
      if (!r) { setStatus("Couldn't find “" + q + "”. Try a 6-digit pincode or an area name.", true); return; }
      clearStatus();
      applyLoc(r.lat, r.lng, "search", r);
      toggleLocationPanel(false);
    });
    els.useMyLocationBtn.addEventListener("click", function () { toggleLocationPanel(false); locateOnLoad(true); });
    Array.prototype.forEach.call(document.querySelectorAll(".city-chip"), function (b) {
      b.addEventListener("click", async function () {
        var lat = parseFloat(b.dataset.lat), lng = parseFloat(b.dataset.lng);
        var rg = await window.Geo.reverseGeocode(lat, lng);
        clearStatus();
        applyLoc(lat, lng, "search", rg);
        toggleLocationPanel(false);
      });
    });
    Array.prototype.forEach.call(els.radiusOptions.querySelectorAll("button"), function (b) {
      b.addEventListener("click", function () {
        state.radiusKm = parseFloat(b.dataset.km);
        state.searchRadius = null;
        afterLocationChange();
      });
    });
    els.resetDemoBtn.addEventListener("click", function () {
      if (confirm("Reset all demo data? This clears any posts you've added.")) {
        Store.resetDemoData();
        toggleLocationPanel(false);
        closeDetail();
        render();
      }
    });
    els.statusDismiss.addEventListener("click", clearStatus);
    els.askBtnHeader.addEventListener("click", function () { openComposer({ type: "ask" }); });
    els.fabAsk.addEventListener("click", function () { openComposer({ type: "ask" }); });
    els.askPrompt.addEventListener("click", function () { openComposer({ type: "ask" }); });
  }

  function toggleLocationPanel(open) {
    els.locationPanel.hidden = !open;
    els.locationPill.setAttribute("aria-expanded", String(open));
    if (open) els.locSearchInput.focus();
  }

  function setStatus(msg, warn) {
    els.statusText.textContent = msg;
    els.statusBanner.classList.toggle("is-warn", !!warn);
    els.statusBanner.hidden = false;
  }
  function clearStatus() { els.statusBanner.hidden = true; }

  function applyLoc(lat, lng, source, info) {
    state.lat = lat; state.lng = lng; state.locSource = source;
    info = info || {};
    state.area = info.area || ""; state.city = info.city || ""; state.pincode = info.pincode || "";
    state.searchRadius = null;
    afterLocationChange();
  }

  async function locateOnLoad(manual) {
    setStatus(COPY.locWorking, false);
    try {
      var pos = await window.Geo.getCurrentPosition();
      var rg = await window.Geo.reverseGeocode(pos.lat, pos.lng);
      clearStatus();
      applyLoc(pos.lat, pos.lng, "gps", rg);
    } catch (err) {
      var msg;
      if (manual) {
        msg = (err && err.code === 1 ? COPY.locDenied : err && err.code === 3 ? COPY.locTimeout : "Couldn't get your location.") +
          " Search a pincode or pick an area instead.";
        setStatus(msg, true);
        return;
      }
      setStatus(COPY.locOff, true);
      applyLoc(DEFAULT_LOC.lat, DEFAULT_LOC.lng, "default", DEFAULT_LOC);
    }
  }

  function afterLocationChange() {
    writeHash();
    updatePill();
    if (map) fitView();
    render();
  }

  // ---------- feed ----------

  function bindFeedControls() {
    Array.prototype.forEach.call(els.filterChips.querySelectorAll(".chip"), function (b) {
      b.addEventListener("click", function () {
        state.filter = b.dataset.filter;
        state.searchRadius = null;
        writeHash();
        render();
      });
    });
    els.viewSwitch.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-view]");
      if (b) setView(b.dataset.view);
    });
    els.sortSelect.addEventListener("change", function () { state.sortBy = els.sortSelect.value; render(); });

    els.postSearchInput.addEventListener("input", function () {
      els.postSearchClear.hidden = !els.postSearchInput.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = els.postSearchInput.value.trim().slice(0, 60);
        state.searchRadius = null;
        writeHash();
        render();
      }, 200);
    });
    els.postSearchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); clearQuery(); }
    });
    els.postSearchClear.addEventListener("click", function () { clearQuery(); els.postSearchInput.focus(); });
  }

  function clearQuery() {
    clearTimeout(searchTimer);
    state.query = ""; state.searchRadius = null;
    els.postSearchInput.value = "";
    writeHash();
    render();
  }

  function render() {
    syncControls();
    var q = state.query.trim();
    var f = state.filter;
    var radius = q && state.searchRadius ? state.searchRadius : state.radiusKm;
    var base = { sortBy: state.sortBy };
    if (f === "unanswered") { base.type = "ask"; base.filter = "unanswered"; }
    else if (f === "alerts") base.type = "alert";
    else if (f === "events") base.type = "event";

    var groups = [], stripItems = [], total = 0;

    if (q) {
      var res = Store.searchNear(state.lat, state.lng, radius, q, { type: base.type, filter: base.filter });
      if (state.sortBy === "nearest") res.sort(function (a, b) { return a.distKm - b.distKm; });
      groups.push({ items: res });
      total = res.length;
    } else {
      var near = Store.listPostsNear(state.lat, state.lng, radius, base);
      if (f === "all") near = near.filter(function (x) { return x.post.type !== "alert"; });
      groups.push({ items: near });
      total = near.length;
      if (total < MIN_FEED) {
        var from = radius;
        for (var i = 0; i < RINGS.length && total < MIN_FEED; i++) {
          var to = RINGS[i];
          if (to <= from) continue;
          var band = Store.listPostsNear(state.lat, state.lng, to, Object.assign({}, base, { minKm: from }));
          if (f === "all") band = band.filter(function (x) { return x.post.type !== "alert"; });
          if (band.length) {
            band.forEach(function (x) { x.far = true; });
            groups.push({ divider: "A bit further away (" + from + "–" + to + " km)", items: band });
            total += band.length;
          }
          from = to;
        }
      }
      if (f === "all") stripItems = Store.listPostsNear(state.lat, state.lng, radius, { type: "alert", sortBy: "nearest" });
    }

    renderStrip(stripItems);
    renderList(groups, q);

    var mapItems = [];
    groups.forEach(function (g) { mapItems = mapItems.concat(g.items); });
    lastMapItems = mapItems.concat(stripItems);
    if (map) { renderMarkers(lastMapItems); mapDirty = false; } else mapDirty = true;

    var label = f === "unanswered" ? " unanswered ask" : "";
    if (q) els.feedSummary.textContent = total + (total === 1 ? " result" : " results") + " for “" + q + "” within " + radius + " km";
    else if (label) els.feedSummary.textContent = total + label + (total === 1 ? "" : "s") + " within " + radius + " km";
    else els.feedSummary.textContent = total + (total === 1 ? " post" : " posts") + " within " + radius + " km";

    updatePill();
    if (state.openPostId && !els.detailSheet.hidden) renderDetail();
  }

  function renderStrip(items) {
    els.alertsStripList.replaceChildren();
    if (!items.length) { els.alertsStrip.hidden = true; return; }
    els.alertsStrip.hidden = false;
    items.forEach(function (x) {
      els.alertsStripList.appendChild(el("button", {
        "class": "alert-mini", attrs: { type: "button" },
        on: { click: function () { openDetail(x.post.id); } }
      }, [
        el("div", { "class": "am-title", text: x.post.title }),
        el("div", { "class": "am-meta", text: fmtKm(x.distKm) + " · " + timeAgo(x.post.createdAt) })
      ]));
    });
  }

  function renderList(groups, q) {
    els.feedList.replaceChildren();
    var count = 0;
    groups.forEach(function (g) {
      if (g.divider && g.items.length) els.feedList.appendChild(el("div", { "class": "ring-divider", text: g.divider }));
      g.items.forEach(function (x) { els.feedList.appendChild(buildCard(x, !!q)); count++; });
    });
    if (count === 0) { renderEmpty(q); els.emptyState.hidden = false; }
    else els.emptyState.hidden = true;
  }

  function renderEmpty(q) {
    var f = state.filter, km = state.radiusKm;
    var title, text = null, actions = [];
    if (q) {
      title = "No past posts match “" + q + "” within " + (state.searchRadius || km) + " km.";
      if (km < 10 && !state.searchRadius) {
        actions.push(el("button", { "class": "btn btn-ghost", text: "Search up to 10 km", attrs: { type: "button" },
          on: { click: function () { state.searchRadius = 10; render(); } } }));
      }
      actions.push(el("button", { "class": "btn btn-primary", text: "Ask it instead", attrs: { type: "button" },
        on: { click: function () { openComposer({ type: "ask", title: q }); } } }));
    } else if (f === "unanswered") {
      title = "Every ask nearby has an answer. Nice.";
    } else if (f === "alerts") {
      title = "No alerts within " + km + " km right now.";
    } else if (f === "events") {
      title = "No upcoming events within " + km + " km.";
      actions.push(el("button", { "class": "btn btn-primary", text: "+ Post an event", attrs: { type: "button" },
        on: { click: function () { openComposer({ type: "event" }); } } }));
    } else {
      title = COPY.emptyFeedTitle(km);
      text = COPY.emptyFeedText;
      actions.push(el("button", { "class": "btn btn-primary", text: "+ Ask", attrs: { type: "button" },
        on: { click: function () { openComposer({ type: "ask" }); } } }));
      actions.push(el("button", { "class": "btn btn-ghost", text: "Jump to Mahadevapura", attrs: { type: "button" },
        on: { click: function () { applyLoc(DEFAULT_LOC.lat, DEFAULT_LOC.lng, "search", DEFAULT_LOC); } } }));
    }
    var kids = [el("h3", { text: title })];
    if (text) kids.push(el("p", { text: text }));
    if (actions.length) kids.push(el("div", { "class": "actions" }, actions));
    els.emptyState.replaceChildren.apply(els.emptyState, kids);
  }

  function buildCard(item, searchMode) {
    var p = item.post, meta = TYPE_META[p.type];
    var closed = p.status !== "active";
    var past = searchMode && (closed || Date.now() - p.createdAt > 7 * D);
    var typeText = meta.label + (p.type === "ask" && p.kind === "offer" ? " · offering" : "");

    var top = el("div", { "class": "card-top" }, [
      el("span", { "class": "dot dot-" + p.type }),
      el("span", { "class": "type-label", text: typeText }),
      p.tag ? el("span", { text: "·" }) : null,
      p.tag ? el("button", { "class": "card-tag", text: p.tag, attrs: { type: "button", "aria-label": "Search " + p.tag },
        on: { click: function (e) { e.stopPropagation(); state.query = p.tag; state.searchRadius = null; writeHash(); render(); } } }) : null,
      el("span", { "class": "card-meta", text: fmtKm(item.distKm) + " · " + (past ? "From " + relAge(p.createdAt) + " ago" : timeAgo(p.createdAt)) })
    ]);

    var text = el("div", { "class": "card-text" }, [
      el("h3", { "class": "card-title", text: p.title }),
      p.body ? el("p", { "class": "card-body", text: p.body }) : null
    ]);
    var main = el("div", { "class": "card-main" }, [text]);
    if (p.type === "event" && p.startsAt) {
      var d = new Date(p.startsAt);
      main.appendChild(el("div", { "class": "date-block" }, [
        el("span", { "class": "dow", text: d.toLocaleDateString([], { weekday: "short" }).toUpperCase() }),
        el("span", { "class": "dom", text: String(d.getDate()) })
      ]));
    }

    var status = statusNode(p);
    var voted = p.voterIds.indexOf(Store.getDeviceId()) !== -1;
    var foot = el("div", { "class": "card-foot" }, [
      el("span", { text: [p.area, p.pincode].filter(Boolean).join(" · ") }),
      status,
      el("button", { "class": "vote-btn", text: "▲ " + p.upvotes, attrs: { type: "button", "aria-pressed": String(voted), "aria-label": "Upvote" },
        on: { click: function (e) { e.stopPropagation(); Store.vote(p.id); render(); } } })
    ]);

    var card = el("article", {
      "class": "card" + (p.type === "alert" ? " is-alert" : "") + (past && closed ? " is-past" : ""),
      attrs: { tabindex: "0", "data-id": p.id },
      on: {
        click: function () { openDetail(p.id); },
        keydown: function (e) { if (e.key === "Enter" && e.target === card) openDetail(p.id); }
      }
    }, [top, main, foot]);
    return card;
  }

  function statusNode(p) {
    if (p.type === "ask") {
      if (p.solvedCommentId && p.firstAnswerAt) {
        return el("span", { "class": "status is-good" }, [svgIcon(ICON_CHECK), "Answered in " + fmtDuration(p.firstAnswerAt - p.createdAt)]);
      }
      var n = answerCount(p);
      if (n) return el("span", { "class": "status", text: n + (n === 1 ? " answer" : " answers") });
      if (p.status !== "active") return el("span", { "class": "status", text: "Closed" });
      if (p.kind !== "offer") return el("span", { "class": "status is-good", text: "No answers yet · help out" });
      return null;
    }
    if (p.type === "alert") {
      if (p.status === "resolved") return el("span", { "class": "status", text: "Resolved" });
      if (p.confirmations.stillOnCount > 0) {
        return el("span", { "class": "status", text: "Still on · " + p.confirmations.stillOnCount + " confirmed" +
          (p.confirmations.lastAt ? " · " + timeAgo(p.confirmations.lastAt) : "") });
      }
      if (p.endsAt) return el("span", { "class": "status", text: "Until " + fmtTime(p.endsAt) });
      return null;
    }
    if (p.startsAt) return el("span", { "class": "status", text: fmtWhen(p.startsAt) });
    return null;
  }

  // ---------- List / Map ----------

  function setView(v, skipHash) {
    state.view = v;
    show(els.listView, v === "list");
    show(els.mapView, v === "map");
    syncControls();
    if (v === "map") {
      sizeMapView();
      requestAnimationFrame(function () {
        if (!map) { if (!initMap()) { setView("list"); return; } }
        else map.invalidateSize();
        fitView();
        renderMarkers(lastMapItems);
        mapDirty = false;
      });
    }
    if (!skipHash) writeHash();
  }

  function sizeMapView() {
    if (window.innerWidth < 760) {
      var top = els.mapView.getBoundingClientRect().top;
      els.mapView.style.height = Math.max(320, window.innerHeight - top - 12) + "px";
    } else {
      els.mapView.style.height = "";
    }
  }

  function zoomForRadius(km) { return km <= 1 ? 15 : km <= 3 ? 14 : km <= 5 ? 13 : 12; }

  function initMap() {
    if (typeof L === "undefined") { toast("Map couldn't load. Check your connection."); return false; }
    map = L.map("map", { zoomControl: true }).setView([state.lat, state.lng], zoomForRadius(state.radiusKm));
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors", maxZoom: 19
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
    updateRadiusCircle();
    return true;
  }

  function updateRadiusCircle() {
    if (!map) return;
    if (radiusCircle) map.removeLayer(radiusCircle);
    radiusCircle = L.circle([state.lat, state.lng], {
      radius: state.radiusKm * 1000, color: "#0f766e", weight: 1, fillColor: "#0f766e", fillOpacity: 0.05
    }).addTo(map);
  }

  function fitView() {
    if (!map) return;
    map.setView([state.lat, state.lng], zoomForRadius(state.radiusKm));
    updateRadiusCircle();
  }

  function renderMarkers(items) {
    if (!map) return;
    markersLayer.clearLayers();
    items.forEach(function (x) {
      var m = L.circleMarker([x.post.lat, x.post.lng], {
        radius: 7, color: "#ffffff", weight: 2,
        fillColor: TYPE_META[x.post.type].color, fillOpacity: x.far ? 0.5 : 0.9
      }).addTo(markersLayer);
      m.bindTooltip(el("span", { text: x.post.title })); // DOM node, never an HTML string
      m.on("click", function () { openDetail(x.post.id); });
    });
  }

  // ---------- composer ----------

  function bindComposer() {
    Store.TAGS.forEach(function (t) {
      els.tagChips.appendChild(el("button", {
        "class": "chip", text: t, attrs: { type: "button", "data-tag": t, "aria-pressed": "false" },
        on: { click: function () {
          var on = newPost.tag !== t;
          newPost.tag = on ? t : null;
          els.tagCustom.value = "";
          syncTagChips();
        } }
      }));
    });
    els.tagCustom.addEventListener("input", function () {
      var v = els.tagCustom.value.trim().toLowerCase();
      newPost.tag = v || null;
      syncTagChips();
    });
    els.typeSwitch.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-type]");
      if (b) selectType(b.dataset.type);
    });
    els.adjustPinBtn.addEventListener("click", showPinMap);
    els.closeSheetBtn.addEventListener("click", closeComposer);
    els.cancelPostBtn.addEventListener("click", closeComposer);
    els.sheetBackdrop.addEventListener("click", closeComposer);
    els.postForm.addEventListener("submit", submitComposer);
  }

  function syncTagChips() {
    Array.prototype.forEach.call(els.tagChips.querySelectorAll(".chip"), function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tag === newPost.tag && !els.tagCustom.value));
    });
  }

  function selectType(type) {
    newPost.type = type;
    Array.prototype.forEach.call(els.typeSwitch.querySelectorAll("button"), function (b) {
      b.setAttribute("aria-checked", String(b.dataset.type === type));
    });
    show(els.askFields, type === "ask");
    show(els.phoneField, type === "ask");
    show(els.alertFields, type === "alert");
    show(els.eventFields, type === "event");
    els.postTitle.placeholder = COPY.hint[type];
    els.postSubmit.textContent = COPY.submit[type];
  }

  function clearErrors() {
    ["titleError", "untilError", "eventError"].forEach(function (id) { els[id].hidden = true; els[id].textContent = ""; });
  }
  function fieldError(id, msg) { els[id].textContent = msg; els[id].hidden = false; }

  function openComposer(opts) {
    opts = opts || {};
    els.postForm.reset();
    clearErrors();
    newPost = { type: "ask", tag: null, lat: state.lat, lng: state.lng };
    syncTagChips();
    selectType(opts.type || "ask");
    els.postTitle.value = opts.title || "";
    els.postAuthorName.value = Store.getLastName();
    els.postLocText.textContent = "Near " + ([state.area, state.pincode].filter(Boolean).join(" · ") || "your location");
    els.postMapWrap.hidden = true;
    els.postSheet.hidden = false;
    els.sheetBackdrop.hidden = false;
    els.postTitle.focus();
  }

  function closeComposer() {
    els.postSheet.hidden = true;
    els.sheetBackdrop.hidden = true;
  }

  function showPinMap() {
    els.postMapWrap.hidden = false;
    requestAnimationFrame(function () {
      if (typeof L === "undefined") { toast("Map couldn't load. Check your connection."); return; }
      if (!postMap) {
        postMap = L.map("postMap").setView([newPost.lat, newPost.lng], 15);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap", maxZoom: 19 }).addTo(postMap);
        postMarker = L.marker([newPost.lat, newPost.lng], { draggable: true }).addTo(postMap);
        var move = function (ll) {
          newPost.lat = ll.lat; newPost.lng = ll.lng;
          els.postLocReadout.textContent = "Pin at " + ll.lat.toFixed(4) + ", " + ll.lng.toFixed(4);
        };
        postMarker.on("dragend", function () { move(postMarker.getLatLng()); });
        postMap.on("click", function (e) { postMarker.setLatLng(e.latlng); move(e.latlng); });
      } else {
        postMap.invalidateSize();
        postMap.setView([newPost.lat, newPost.lng], 15);
        postMarker.setLatLng([newPost.lat, newPost.lng]);
      }
      els.postLocReadout.textContent = "Drag the pin or tap the map to adjust.";
    });
  }

  function parseLocal(v) { return v ? new Date(v).getTime() : null; }

  function submitComposer(e) {
    e.preventDefault();
    clearErrors();
    var type = newPost.type, now = Date.now();
    var title = els.postTitle.value.trim();
    var ok = true, startsAt = null, endsAt = null;

    if (!title) { fieldError("titleError", "Add a title."); ok = false; }

    if (type === "event") {
      startsAt = parseLocal(els.postStartsAt.value);
      endsAt = parseLocal(els.postEndsAt.value);
      if (!startsAt) { fieldError("eventError", "Add a start time."); ok = false; }
      else if (endsAt && endsAt <= startsAt) { fieldError("eventError", "The end must be after the start."); ok = false; }
      else if ((endsAt || startsAt + 3 * H) <= now) { fieldError("eventError", "That time is in the past."); ok = false; }
    } else if (type === "alert") {
      endsAt = parseLocal(els.postUntil.value);
      if (endsAt && endsAt <= now) { fieldError("untilError", "“Expected until” is in the past."); ok = false; }
    }
    if (!ok) return;

    var name = els.postAuthorName.value.trim() || "Neighbor";
    Store.setLastName(name);
    var post = Store.createPost({
      type: type, tag: type === "ask" ? newPost.tag : null,
      kind: type === "ask" ? (els.postForm.querySelector('input[name="kind"]:checked') || {}).value : null,
      title: title, body: els.postBody.value,
      lat: newPost.lat, lng: newPost.lng,
      pincode: state.pincode, area: state.area, city: state.city,
      authorName: name, phone: type === "ask" ? els.postPhone.value : null,
      startsAt: startsAt, endsAt: endsAt
    });

    closeComposer();
    state.query = ""; state.filter = "all"; state.searchRadius = null;
    writeHash();
    render();
    openDetail(post.id);
  }

  // ---------- detail ----------

  function bindDetail() {
    els.closeDetailBtn.addEventListener("click", function () { closeDetail(); });
    els.detailBackdrop.addEventListener("click", function () { closeDetail(); });
  }

  function openDetail(id) {
    state.openPostId = id;
    writeHash();
    renderDetail();
    els.detailSheet.hidden = false;
    els.detailBackdrop.hidden = false;
  }

  function closeDetail() {
    state.openPostId = null;
    els.detailSheet.hidden = true;
    els.detailBackdrop.hidden = true;
    writeHash();
  }

  function mutate(fn) { fn(); renderDetail(); render(); }

  function renderDetail() {
    var p = state.openPostId ? Store.getPost(state.openPostId) : null;
    if (!p) { closeDetail(); toast(COPY.postGone); return; }

    var scroll = els.detailBody.scrollTop;
    var meta = TYPE_META[p.type];
    var deviceId = Store.getDeviceId();
    var isOwner = p.authorId === deviceId;
    var active = p.status === "active";
    var link = location.href.split("#")[0] + "#post=" + encodeURIComponent(p.id);
    var dist = window.haversineKm(state.lat, state.lng, p.lat, p.lng);

    els.detailTypeLabel.replaceChildren(
      el("span", { "class": "dot dot-" + p.type }),
      meta.label + (p.type === "ask" && p.kind === "offer" ? " · offering" : "") + (p.tag ? " · " + p.tag : "")
    );

    var kids = [];
    kids.push(el("div", null, [
      el("h3", { "class": "detail-title", text: p.title }),
      el("div", { "class": "detail-meta", text: "By " + p.authorName + " · " + timeAgo(p.createdAt) + " · " +
        [p.area, p.pincode].filter(Boolean).join(" ") + " · " + fmtKm(dist) })
    ]));

    // badges
    var badges = [];
    if (p.type === "ask" && p.solvedCommentId && p.firstAnswerAt) {
      badges.push(el("span", { "class": "badge-good" }, [svgIcon(ICON_CHECK), "Answered in " + fmtDuration(p.firstAnswerAt - p.createdAt)]));
    }
    if (p.type === "ask" && !active) badges.push(el("span", { text: "From " + relAge(p.createdAt) + " ago · closed" }));
    if (p.type === "ask" && isOwner && active && p.kind !== "offer" && !p.firstAnswerAt) {
      var reach = Store.reachKm(p);
      badges.push(el("span", { text: reach <= 2
        ? "Reaching neighbors within 2 km · widens to 5 km if no answer in 30 min"
        : reach <= 5 ? "Reaching neighbors within 5 km · widens to 10 km after 2 hours"
        : "Reaching neighbors within 10 km" }));
    }
    if (badges.length) kids.push(el("div", { "class": "badges" }, badges));

    if (p.body) kids.push(el("p", { "class": "detail-text", text: p.body }));

    if (p.type === "event" && p.startsAt) {
      kids.push(el("p", { "class": "detail-line", text: fmtWhen(p.startsAt) + (p.endsAt ? " – " + fmtTime(p.endsAt) : "") }));
    }
    if (p.type === "alert") {
      var conf = p.confirmations;
      kids.push(el("p", { "class": "detail-line", text: p.status === "resolved" ? "Marked resolved." :
        (conf.stillOnCount ? "Still on · " + conf.stillOnCount + " confirmed" + (conf.lastAt ? " · last " + timeAgo(conf.lastAt) + " ago" : "") : "No confirmations yet") +
        (p.endsAt ? " · until " + fmtTime(p.endsAt) : "") }));
    }

    if (p.type === "ask" && p.phone) kids.push(phoneReveal(p.phone));

    // actions
    var row = [];
    var voted = p.voterIds.indexOf(deviceId) !== -1;
    row.push(el("button", { "class": "btn btn-ghost", text: "▲ Upvote · " + p.upvotes, attrs: { type: "button", "aria-pressed": String(voted) },
      on: { click: function () { mutate(function () { Store.vote(p.id); }); } } }));
    if (p.type === "alert" && active) {
      row.push(el("button", { "class": "btn btn-ghost", text: "Still happening", attrs: { type: "button" },
        on: { click: function () { mutate(function () { Store.confirm(p.id, "stillOn"); }); } } }));
      row.push(el("button", { "class": "btn btn-ghost", text: "Looks resolved", attrs: { type: "button" },
        on: { click: function () { mutate(function () { Store.confirm(p.id, "resolved"); }); } } }));
    }
    row.push(el("a", { "class": "btn btn-ghost", text: "Share on WhatsApp",
      attrs: { href: "https://wa.me/?text=" + encodeURIComponent(p.title + "\n" + link), target: "_blank", rel: "noopener" } }));
    row.push(el("button", { "class": "btn btn-ghost", text: "Copy link", attrs: { type: "button" }, on: { click: function () { copyLink(link); } } }));
    kids.push(el("div", { "class": "action-row" }, row));

    var owner = [];
    if (isOwner) {
      if (p.type === "alert" && active) {
        owner.push(el("button", { "class": "btn-text", text: "Mark resolved", attrs: { type: "button" },
          on: { click: function () { mutate(function () { Store.markResolved(p.id); }); } } }));
      }
      owner.push(el("button", { "class": "btn-danger-text", text: "Delete", attrs: { type: "button" },
        on: { click: function () {
          if (confirm("Delete this post?")) { Store.deletePost(p.id); closeDetail(); render(); }
        } } }));
    } else {
      owner.push(el("button", { "class": "btn-danger-text", text: "Hide / Report", attrs: { type: "button" },
        on: { click: function () { Store.report(p.id); closeDetail(); render(); } } }));
    }
    kids.push(el("div", { "class": "action-row" }, owner));

    kids.push(buildThread(p, isOwner, deviceId));

    els.detailBody.replaceChildren.apply(els.detailBody, kids);
    els.detailBody.scrollTop = scroll;
  }

  function phoneReveal(phone) {
    var wrap = el("div", { "class": "phone-reveal" });
    wrap.appendChild(el("button", { "class": "btn btn-ghost", text: "Show number", attrs: { type: "button" }, on: { click: function () {
      var digits = phone.replace(/\D/g, "");
      if (digits.length === 12 && digits.indexOf("91") === 0) digits = digits.slice(2);
      else if (digits.length === 11 && digits.charAt(0) === "0") digits = digits.slice(1);
      wrap.replaceChildren(
        el("span", { text: phone }),
        el("a", { text: "Message on WhatsApp", attrs: { href: "https://wa.me/91" + digits, target: "_blank", rel: "noopener" } })
      );
    } } }));
    return wrap;
  }

  function copyLink(link) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { toast(COPY.linkCopied); }, function () { window.prompt("Copy this link", link); });
    } else {
      window.prompt("Copy this link", link);
    }
  }

  function buildThread(p, isOwner, deviceId) {
    var isAsk = p.type === "ask";
    var comments = Store.sortedComments(p);
    var thread = el("section", { "class": "thread" }, [
      el("h3", { text: (isAsk ? "Answers" : "Comments") + " (" + comments.length + ")" })
    ]);

    comments.forEach(function (c) {
      var solved = c.id === p.solvedCommentId;
      var isAns = Store.isAnswer(p, c);
      var head = el("div", { "class": "answer-head" }, [
        el("span", { "class": "who", text: c.authorName }),
        el("span", { text: timeAgo(c.createdAt) }),
        solved ? el("span", { "class": "solved-tag", text: "✓ Solved it" }) : null
      ]);
      var actions = [];
      if (isAns) {
        var helped = (c.helpfulIds || []).indexOf(deviceId) !== -1;
        actions.push(el("button", { "class": "helpful-btn", text: "Helpful · " + (c.helpfulIds || []).length,
          attrs: { type: "button", "aria-pressed": String(helped) },
          on: { click: function () { mutate(function () { Store.toggleHelpful(p.id, c.id); }); } } }));
      }
      if (isOwner && isAsk && isAns) {
        actions.push(el("button", { "class": "btn-text", text: solved ? "Unmark solved" : "This solved it", attrs: { type: "button" },
          on: { click: function () { mutate(function () { Store.markSolved(p.id, c.id); }); } } }));
      }
      thread.appendChild(el("div", { "class": "answer" + (solved ? " is-solved" : "") }, [
        head,
        el("p", { "class": "answer-body", text: c.body }),
        actions.length ? el("div", { "class": "answer-actions" }, actions) : null
      ]));
    });

    var nameInput = el("input", { attrs: { type: "text", maxlength: "60", placeholder: "Your name", "aria-label": "Your name" } });
    nameInput.value = Store.getLastName();
    var area = el("textarea", { attrs: { rows: "3", maxlength: "500", "aria-label": isAsk ? "Your answer" : "Your comment",
      placeholder: isAsk ? "Share what you know…" : "Add a comment…" } });
    var form = el("form", { "class": "comment-form", attrs: { novalidate: "" } }, [
      el("div", { "class": "row" }, [nameInput]),
      area,
      el("div", { "class": "action-row" }, [el("button", { "class": "btn btn-primary", text: "Send", attrs: { type: "submit" } })])
    ]);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!area.value.trim()) return;
      var name = nameInput.value.trim() || "Neighbor";
      Store.setLastName(name);
      Store.addComment(p.id, name, area.value);
      renderDetail();
      render();
      var fresh = els.detailBody.querySelector(".comment-form textarea");
      if (fresh) fresh.focus();
    });
    thread.appendChild(form);
    return thread;
  }

  // ---------- global ----------

  function bindGlobal() {
    document.addEventListener("click", function (e) {
      if (!els.locationPanel.hidden && !els.locationPanel.contains(e.target) && !els.locationPill.contains(e.target)) {
        toggleLocationPanel(false);
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (!els.detailSheet.hidden) closeDetail();
      else if (!els.postSheet.hidden) closeComposer();
      else if (!els.locationPanel.hidden) toggleLocationPanel(false);
    });
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (map && !els.mapView.hidden) { sizeMapView(); map.invalidateSize(); }
      }, 150);
    });
  }
})();
