// Small offline pincode -> {area, city, lat, lng} lookup, checked before
// Nominatim. Ported verbatim (as typed data) from ../../../pincodes.js.
// Covers the seed cities used in the prototype. Not exhaustive.
import { haversineKm } from './geo';

export type PincodeEntry = {
  area: string;
  aliases?: string[];
  city: string;
  lat: number;
  lng: number;
};

export const PINCODES: Record<string, PincodeEntry> = {
  // --- Home market: Mahadevapura belt, Bengaluru ---
  // Approximate centroids; verify against India Post / OSM before production.
  '560048': { area: 'Mahadevapura', aliases: ['Hoodi'], city: 'Bengaluru', lat: 12.9915, lng: 77.6944 },
  '560036': { area: 'KR Puram', aliases: ['Krishnarajapuram', 'K R Puram'], city: 'Bengaluru', lat: 13.0077, lng: 77.696 },
  '560103': { area: 'Bellandur', city: 'Bengaluru', lat: 12.926, lng: 77.6762 },
  '560037': { area: 'Marathahalli', aliases: ['Brookefield', 'Kundalahalli'], city: 'Bengaluru', lat: 12.9569, lng: 77.7011 },
  '560066': { area: 'Whitefield', aliases: ['ITPL'], city: 'Bengaluru', lat: 12.9698, lng: 77.75 },

  // --- Rest of Bengaluru ---
  '560034': { area: 'Koramangala', city: 'Bengaluru', lat: 12.9279, lng: 77.6271 },
  '560038': { area: 'Indiranagar', city: 'Bengaluru', lat: 12.9784, lng: 77.6408 },
  '560071': { area: 'Domlur', city: 'Bengaluru', lat: 12.961, lng: 77.6387 },
  '560095': { area: 'Koramangala 6th Block', city: 'Bengaluru', lat: 12.9352, lng: 77.6245 },
  '560102': { area: 'HSR Layout', city: 'Bengaluru', lat: 12.9121, lng: 77.6446 },
  '560068': { area: 'BTM Layout', city: 'Bengaluru', lat: 12.9166, lng: 77.6101 },
  '560078': { area: 'JP Nagar', city: 'Bengaluru', lat: 12.9077, lng: 77.5906 },
  '560001': { area: 'Bengaluru GPO', city: 'Bengaluru', lat: 12.9762, lng: 77.5993 },
  '560017': { area: 'Malleswaram', city: 'Bengaluru', lat: 13.0055, lng: 77.5695 },
  '560003': { area: 'Malleswaram West', city: 'Bengaluru', lat: 13.0106, lng: 77.56 },
  '560040': { area: 'Jayanagar', city: 'Bengaluru', lat: 12.925, lng: 77.5938 },
  '560011': { area: 'Basavanagudi', city: 'Bengaluru', lat: 12.9422, lng: 77.5731 },
  '560025': { area: 'Richmond Town', city: 'Bengaluru', lat: 12.9634, lng: 77.6053 },

  // --- Delhi ---
  '110001': { area: 'Connaught Place', city: 'Delhi', lat: 28.6315, lng: 77.2167 },
  '110016': { area: 'Hauz Khas', city: 'Delhi', lat: 28.5494, lng: 77.2001 },
  '110019': { area: 'Kalkaji', city: 'Delhi', lat: 28.5355, lng: 77.2588 },
  '110024': { area: 'Sarita Vihar', city: 'Delhi', lat: 28.5296, lng: 77.2907 },
  '110017': { area: 'Green Park', city: 'Delhi', lat: 28.561, lng: 77.2064 },
  '110034': { area: 'Model Town', city: 'Delhi', lat: 28.7115, lng: 77.1912 },
  '110048': { area: 'Chirag Delhi', city: 'Delhi', lat: 28.5423, lng: 77.241 },
  '110058': { area: 'Vikaspuri', city: 'Delhi', lat: 28.6408, lng: 77.0663 },
  '110065': { area: 'East of Kailash', city: 'Delhi', lat: 28.5581, lng: 77.2493 },
  '110092': { area: 'Yamuna Vihar', city: 'Delhi', lat: 28.69, lng: 77.283 },
  '110096': { area: 'Mayur Vihar', city: 'Delhi', lat: 28.6089, lng: 77.2903 },

  // --- Mumbai ---
  '400001': { area: 'Fort', city: 'Mumbai', lat: 18.9339, lng: 72.8355 },
  '400050': { area: 'Bandra West', city: 'Mumbai', lat: 19.0596, lng: 72.8295 },
  '400052': { area: 'Bandra East', city: 'Mumbai', lat: 19.0662, lng: 72.8404 },
  '400058': { area: 'Andheri East', city: 'Mumbai', lat: 19.1197, lng: 72.8697 },
  '400053': { area: 'Andheri West', city: 'Mumbai', lat: 19.1364, lng: 72.8296 },
  '400070': { area: 'Kurla', city: 'Mumbai', lat: 19.0728, lng: 72.8794 },
  '400071': { area: 'Chembur', city: 'Mumbai', lat: 19.0522, lng: 72.9005 },
  '400018': { area: 'Worli', city: 'Mumbai', lat: 19.0176, lng: 72.8151 },
  '400028': { area: 'Dadar West', city: 'Mumbai', lat: 19.0186, lng: 72.842 },
  '400614': { area: 'Vashi', city: 'Mumbai', lat: 19.0771, lng: 73.0028 },

  // --- Hyderabad ---
  '500001': { area: 'Abids', city: 'Hyderabad', lat: 17.3899, lng: 78.4738 },
  '500016': { area: 'Begumpet', city: 'Hyderabad', lat: 17.44, lng: 78.4661 },
  '500033': { area: 'Madhapur', city: 'Hyderabad', lat: 17.4483, lng: 78.3915 },
  '500034': { area: 'Jubilee Hills', city: 'Hyderabad', lat: 17.4325, lng: 78.4071 },
  '500032': { area: 'Gachibowli', city: 'Hyderabad', lat: 17.4401, lng: 78.3489 },
  '500081': { area: 'HITEC City', city: 'Hyderabad', lat: 17.4483, lng: 78.3809 },
  '500082': { area: 'Kukatpally', city: 'Hyderabad', lat: 17.4849, lng: 78.4108 },
  '500028': { area: 'L.B. Nagar', city: 'Hyderabad', lat: 17.3466, lng: 78.5524 },
  '500018': { area: 'Secunderabad', city: 'Hyderabad', lat: 17.4399, lng: 78.4983 },
};

export type NearestPincode = PincodeEntry & { code: string; distKm: number };

// Nearest known pincode within maxKm (default 5km).
export function findNearestPincode(lat: number, lng: number, maxKm = 5): NearestPincode | null {
  let best: NearestPincode | null = null;
  let bestDist = Infinity;
  for (const code in PINCODES) {
    const p = PINCODES[code];
    const d = haversineKm(lat, lng, p.lat, p.lng);
    if (d < bestDist) {
      bestDist = d;
      best = { ...p, code, distKm: d };
    }
  }
  return best && bestDist <= maxKm ? best : null;
}

export type FoundPincode = PincodeEntry & { code: string };

// Case-insensitive exact match on area name or alias.
export function findPincodeByArea(q: string): FoundPincode | null {
  const query = (q || '').trim().toLowerCase();
  if (!query) return null;
  for (const code in PINCODES) {
    const p = PINCODES[code];
    const names = [p.area, ...(p.aliases ?? [])];
    for (const name of names) {
      if (name.toLowerCase() === query) return { ...p, code };
    }
  }
  return null;
}
