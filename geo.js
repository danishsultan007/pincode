// Location helpers: browser geolocation + offline pincode lookup + throttled
// Nominatim fallback. Keep all network calls disciplined: no type-ahead
// geocoding, ≤1 request/sec, cached by rounded coordinate/query.
(function () {
  "use strict";

  var NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
  var CONTACT_EMAIL = "pincode-prototype@example.com"; // identifies the app per Nominatim usage policy
  var lastRequestAt = 0;
  var MIN_INTERVAL_MS = 1100;

  function throttle() {
    var now = Date.now();
    var wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
    lastRequestAt = now + wait;
    return new Promise(function (resolve) { setTimeout(resolve, wait); });
  }

  function roundCoordKey(lat, lng) {
    return lat.toFixed(3) + "," + lng.toFixed(3);
  }

  function getCurrentPosition(options) {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject({ code: "unsupported", message: "Geolocation is not supported by this browser." });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        },
        function (err) {
          // err.code: 1=denied, 2=unavailable, 3=timeout
          reject({ code: err.code, message: err.message });
        },
        Object.assign({ enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }, options || {})
      );
    });
  }

  // Reverse geocode lat/lng -> {pincode, area, city}. Tries the offline table
  // first (fast, no network), then falls back to Nominatim if nothing nearby.
  async function reverseGeocode(lat, lng) {
    var nearest = window.findNearestPincode(lat, lng, 3);
    if (nearest) {
      return { pincode: nearest.code, area: nearest.area, city: nearest.city, source: "offline" };
    }

    var key = "rev:" + roundCoordKey(lat, lng);
    var cached = window.Store.geocacheGet(key);
    if (cached) return cached;

    try {
      await throttle();
      var url = NOMINATIM_BASE + "/reverse?format=jsonv2&lat=" + encodeURIComponent(lat) +
        "&lon=" + encodeURIComponent(lng) + "&zoom=18&addressdetails=1&email=" + CONTACT_EMAIL;
      var res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (!res.ok) throw new Error("Nominatim reverse geocode failed: " + res.status);
      var data = await res.json();
      var addr = data.address || {};
      var result = {
        pincode: addr.postcode || "",
        area: addr.suburb || addr.neighbourhood || addr.residential || addr.city_district || "",
        city: addr.city || addr.town || addr.state_district || addr.state || "",
        source: "nominatim"
      };
      window.Store.geocacheSet(key, result);
      return result;
    } catch (e) {
      console.warn("reverseGeocode failed, leaving location unverified", e);
      return { pincode: "", area: "", city: "", source: "none" };
    }
  }

  // Forward geocode a typed pincode or area/city string -> {lat, lng, area, city, pincode}.
  // Only called on explicit submit (Enter / button), never as-you-type.
  async function forwardGeocode(query) {
    query = (query || "").trim();
    if (!query) return null;

    // Offline pincode table first — exact 6-digit match.
    if (/^\d{6}$/.test(query) && window.PINCODES[query]) {
      var p = window.PINCODES[query];
      return { lat: p.lat, lng: p.lng, pincode: query, area: p.area, city: p.city, source: "offline" };
    }

    // Known area names / aliases (e.g. "Hoodi") also resolve offline.
    var byArea = window.findPincodeByArea(query);
    if (byArea) {
      return { lat: byArea.lat, lng: byArea.lng, pincode: byArea.code, area: byArea.area, city: byArea.city, source: "offline" };
    }

    var key = "fwd:" + query.toLowerCase();
    var cached = window.Store.geocacheGet(key);
    if (cached) return cached;

    try {
      await throttle();
      var params = /^\d{6}$/.test(query)
        ? "postalcode=" + encodeURIComponent(query) + "&country=India"
        : "q=" + encodeURIComponent(query + ", India");
      var url = NOMINATIM_BASE + "/search?format=jsonv2&addressdetails=1&limit=1&" + params + "&email=" + CONTACT_EMAIL;
      var res = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (!res.ok) throw new Error("Nominatim search failed: " + res.status);
      var data = await res.json();
      if (!data || !data.length) return null;
      var d = data[0];
      var addr = d.address || {};
      var result = {
        lat: parseFloat(d.lat),
        lng: parseFloat(d.lon),
        pincode: addr.postcode || (/^\d{6}$/.test(query) ? query : ""),
        area: addr.suburb || addr.neighbourhood || d.display_name.split(",")[0] || "",
        city: addr.city || addr.town || addr.state_district || "",
        source: "nominatim"
      };
      window.Store.geocacheSet(key, result);
      return result;
    } catch (e) {
      console.warn("forwardGeocode failed", e);
      return null;
    }
  }

  window.Geo = {
    getCurrentPosition: getCurrentPosition,
    reverseGeocode: reverseGeocode,
    forwardGeocode: forwardGeocode
  };
})();
