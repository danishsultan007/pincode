// Location helpers (MOBILE-PLAN.md §7.4): current position, reverse and
// forward geocoding. Offline pincode lookup first, then platform APIs.

import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { DEFAULT_LOC, SUPPORT_EMAIL } from './constants';
import { findNearestPincode, findPincodeByArea, PINCODES } from './pincodes';

export type Coords = { lat: number; lng: number };
export type GeocodeResult = { area: string; city: string; pincode: string | null };

const POSITION_TIMEOUT_MS = 10_000;

export async function getCurrentPosition(): Promise<Coords> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('location_denied');

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('location_timeout')), POSITION_TIMEOUT_MS);
  });

  const pos = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    timeout,
  ]);
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

// Nominatim usage policy: max 1 request/second, and an identifying param.
let lastNominatimAt = 0;
const NOMINATIM_MIN_GAP_MS = 1100;
const NOMINATIM_EMAIL = SUPPORT_EMAIL;
const reverseCache = new Map<string, GeocodeResult | null>();

async function throttleNominatim(): Promise<void> {
  const wait = NOMINATIM_MIN_GAP_MS - (Date.now() - lastNominatimAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastNominatimAt = Date.now();
}

async function nominatimReverse(lat: number, lng: number): Promise<GeocodeResult | null> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseCache.has(key)) return reverseCache.get(key) ?? null;

  await throttleNominatim();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&email=${NOMINATIM_EMAIL}`
    );
    const data = await res.json();
    const addr = data?.address ?? {};
    const result: GeocodeResult = {
      area:
        addr.suburb || addr.neighbourhood || addr.village || addr.town || addr.city_district || addr.city || 'Nearby',
      city: addr.city || addr.town || addr.state_district || addr.state || '',
      pincode: addr.postcode ?? null,
    };
    reverseCache.set(key, result);
    return result;
  } catch {
    reverseCache.set(key, null);
    return null;
  }
}

// Offline pincode lookup within 3 km -> native reverse geocode -> Nominatim
// on web (or as a native fallback) -> DEFAULT_LOC as a last resort.
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult> {
  const nearest = findNearestPincode(lat, lng, 3);
  if (nearest) return { area: nearest.area, city: nearest.city, pincode: nearest.code };

  if (Platform.OS !== 'web') {
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (place) {
        return {
          area: place.district || place.subregion || place.city || place.name || 'Nearby',
          city: place.city || place.subregion || '',
          pincode: place.postalCode ?? null,
        };
      }
    } catch {
      // fall through to Nominatim
    }
  }

  const remote = await nominatimReverse(lat, lng);
  if (remote) return remote;

  return { area: DEFAULT_LOC.area, city: DEFAULT_LOC.city, pincode: DEFAULT_LOC.pincode };
}

// Offline pincode -> area alias -> Nominatim, ported from the prototype order.
export async function forwardGeocode(query: string): Promise<(GeocodeResult & Coords) | null> {
  const q = query.trim();
  if (!q) return null;

  if (/^[1-9][0-9]{5}$/.test(q) && PINCODES[q]) {
    const entry = PINCODES[q];
    return { lat: entry.lat, lng: entry.lng, area: entry.area, city: entry.city, pincode: q };
  }

  const byArea = findPincodeByArea(q);
  if (byArea) {
    return { lat: byArea.lat, lng: byArea.lng, area: byArea.area, city: byArea.city, pincode: byArea.code };
  }

  await throttleNominatim();
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
        q + ', India'
      )}&limit=1&email=${NOMINATIM_EMAIL}`
    );
    const data = await res.json();
    const hit = data?.[0];
    if (!hit) return null;
    return {
      lat: parseFloat(hit.lat),
      lng: parseFloat(hit.lon),
      area: (hit.display_name as string | undefined)?.split(',')[0] ?? q,
      city: DEFAULT_LOC.city,
      pincode: null,
    };
  } catch {
    return null;
  }
}
