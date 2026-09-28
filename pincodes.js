// Small offline pincode -> {area, city, lat, lng} lookup, checked before Nominatim.
// Covers the seed cities used in this prototype. Not exhaustive.
window.PINCODES = {
  // --- Home market: Mahadevapura belt, Bengaluru ---
  // Approximate centroids; verify against India Post / OSM before production.
  "560048": { area: "Mahadevapura", aliases: ["Hoodi"], city: "Bengaluru", lat: 12.9915, lng: 77.6944 },
  "560036": { area: "KR Puram", aliases: ["Krishnarajapuram", "K R Puram"], city: "Bengaluru", lat: 13.0077, lng: 77.6960 },
  "560103": { area: "Bellandur", city: "Bengaluru", lat: 12.9260, lng: 77.6762 },
  "560037": { area: "Marathahalli", aliases: ["Brookefield", "Kundalahalli"], city: "Bengaluru", lat: 12.9569, lng: 77.7011 },
  "560066": { area: "Whitefield", aliases: ["ITPL"], city: "Bengaluru", lat: 12.9698, lng: 77.7500 },

  // --- Rest of Bengaluru ---
  "560034": { area: "Koramangala", city: "Bengaluru", lat: 12.9279, lng: 77.6271 },
  "560038": { area: "Indiranagar", city: "Bengaluru", lat: 12.9784, lng: 77.6408 },
  "560071": { area: "Domlur", city: "Bengaluru", lat: 12.9610, lng: 77.6387 },
  "560095": { area: "Koramangala 6th Block", city: "Bengaluru", lat: 12.9352, lng: 77.6245 },
  "560102": { area: "HSR Layout", city: "Bengaluru", lat: 12.9121, lng: 77.6446 },
  "560068": { area: "BTM Layout", city: "Bengaluru", lat: 12.9166, lng: 77.6101 },
  "560078": { area: "JP Nagar", city: "Bengaluru", lat: 12.9077, lng: 77.5906 },
  "560001": { area: "Bengaluru GPO", city: "Bengaluru", lat: 12.9762, lng: 77.5993 },
  "560017": { area: "Malleswaram", city: "Bengaluru", lat: 13.0055, lng: 77.5695 },
  "560003": { area: "Malleswaram West", city: "Bengaluru", lat: 13.0106, lng: 77.5600 },
  "560040": { area: "Jayanagar", city: "Bengaluru", lat: 12.9250, lng: 77.5938 },
  "560011": { area: "Basavanagudi", city: "Bengaluru", lat: 12.9422, lng: 77.5731 },
  "560025": { area: "Richmond Town", city: "Bengaluru", lat: 12.9634, lng: 77.6053 },

  // --- Delhi ---
  "110001": { area: "Connaught Place", city: "Delhi", lat: 28.6315, lng: 77.2167 },
  "110016": { area: "Hauz Khas", city: "Delhi", lat: 28.5494, lng: 77.2001 },
  "110019": { area: "Kalkaji", city: "Delhi", lat: 28.5355, lng: 77.2588 },
  "110024": { area: "Sarita Vihar", city: "Delhi", lat: 28.5296, lng: 77.2907 },
  "110017": { area: "Green Park", city: "Delhi", lat: 28.5610, lng: 77.2064 },
  "110034": { area: "Model Town", city: "Delhi", lat: 28.7115, lng: 77.1912 },
  "110048": { area: "Chirag Delhi", city: "Delhi", lat: 28.5423, lng: 77.2410 },
  "110058": { area: "Vikaspuri", city: "Delhi", lat: 28.6408, lng: 77.0663 },
  "110065": { area: "East of Kailash", city: "Delhi", lat: 28.5581, lng: 77.2493 },
  "110092": { area: "Yamuna Vihar", city: "Delhi", lat: 28.6900, lng: 77.2830 },
  "110096": { area: "Mayur Vihar", city: "Delhi", lat: 28.6089, lng: 77.2903 },

  // --- Mumbai ---
  "400001": { area: "Fort", city: "Mumbai", lat: 18.9339, lng: 72.8355 },
  "400050": { area: "Bandra West", city: "Mumbai", lat: 19.0596, lng: 72.8295 },
  "400052": { area: "Bandra East", city: "Mumbai", lat: 19.0662, lng: 72.8404 },
  "400058": { area: "Andheri East", city: "Mumbai", lat: 19.1197, lng: 72.8697 },
  "400053": { area: "Andheri West", city: "Mumbai", lat: 19.1364, lng: 72.8296 },
  "400070": { area: "Kurla", city: "Mumbai", lat: 19.0728, lng: 72.8794 },
  "400071": { area: "Chembur", city: "Mumbai", lat: 19.0522, lng: 72.9005 },
  "400018": { area: "Worli", city: "Mumbai", lat: 19.0176, lng: 72.8151 },
  "400028": { area: "Dadar West", city: "Mumbai", lat: 19.0186, lng: 72.8420 },
  "400614": { area: "Vashi", city: "Mumbai", lat: 19.0771, lng: 73.0028 },

  // --- Hyderabad ---
  "500001": { area: "Abids", city: "Hyderabad", lat: 17.3899, lng: 78.4738 },
  "500016": { area: "Begumpet", city: "Hyderabad", lat: 17.4400, lng: 78.4661 },
  "500033": { area: "Madhapur", city: "Hyderabad", lat: 17.4483, lng: 78.3915 },
  "500034": { area: "Jubilee Hills", city: "Hyderabad", lat: 17.4325, lng: 78.4071 },
  "500032": { area: "Gachibowli", city: "Hyderabad", lat: 17.4401, lng: 78.3489 },
  "500081": { area: "HITEC City", city: "Hyderabad", lat: 17.4483, lng: 78.3809 },
  "500082": { area: "Kukatpally", city: "Hyderabad", lat: 17.4849, lng: 78.4108 },
  "500028": { area: "L.B. Nagar", city: "Hyderabad", lat: 17.3466, lng: 78.5524 },
  "500018": { area: "Secunderabad", city: "Hyderabad", lat: 17.4399, lng: 78.4983 }
};

window.haversineKm = function (lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Nearest known pincode within maxKm (default 5). Returns {code, area, city, lat, lng, distKm} or null.
window.findNearestPincode = function (lat, lng, maxKm) {
  maxKm = maxKm || 5;
  var best = null, bestDist = Infinity;
  for (var code in window.PINCODES) {
    var p = window.PINCODES[code];
    var d = window.haversineKm(lat, lng, p.lat, p.lng);
    if (d < bestDist) { bestDist = d; best = Object.assign({ code: code, distKm: d }, p); }
  }
  return best && bestDist <= maxKm ? best : null;
};

// Case-insensitive exact match on area name or alias. Returns {code, area, city, lat, lng} or null.
window.findPincodeByArea = function (q) {
  q = (q || "").trim().toLowerCase();
  if (!q) return null;
  for (var code in window.PINCODES) {
    var p = window.PINCODES[code];
    var names = [p.area].concat(p.aliases || []);
    for (var i = 0; i < names.length; i++) {
      if (names[i].toLowerCase() === q) return Object.assign({ code: code }, p);
    }
  }
  return null;
};
