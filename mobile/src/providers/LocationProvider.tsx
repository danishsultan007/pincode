import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_LOC, RADII } from '@/lib/constants';
import { getCurrentPosition, reverseGeocode } from '@/lib/location';

// Feed center + radius (MOBILE-PLAN.md §1). Persists the last-known location
// and radius to AsyncStorage so a reload doesn't reset to Mahadevapura. The
// Home tab and the /location modal (P3) are the main consumers; onboarding
// (P2) uses `useCurrentLocation` for the "Use my location" step.

export type RadiusKm = (typeof RADII)[number];
export type LocationStatus = 'idle' | 'loading' | 'granted' | 'denied' | 'timeout';

export type LocationState = {
  lat: number;
  lng: number;
  area: string;
  city: string;
  pincode: string | null;
  radius: RadiusKm;
  status: LocationStatus;
};

type SetLocationInput = { lat: number; lng: number; area: string; city: string; pincode: string | null };

type LocationContextValue = LocationState & {
  setRadius: (radius: RadiusKm) => void;
  setLocation: (loc: SetLocationInput) => void;
  useCurrentLocation: () => Promise<void>;
  refresh: () => Promise<void>;
};

const STORAGE_KEY = 'pincode.location.v1';

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<LocationState>({
    lat: DEFAULT_LOC.lat,
    lng: DEFAULT_LOC.lng,
    area: DEFAULT_LOC.area,
    city: DEFAULT_LOC.city,
    pincode: DEFAULT_LOC.pincode,
    radius: 5,
    status: 'idle',
  });

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const saved = JSON.parse(raw) as Partial<LocationState>;
        setState((s) => ({ ...s, ...saved }));
      })
      .catch(() => {
        // ignore — falls back to DEFAULT_LOC
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback((next: Partial<LocationState>) => {
    setState((s) => {
      const merged = { ...s, ...next };
      const toSave = {
        lat: merged.lat,
        lng: merged.lng,
        area: merged.area,
        city: merged.city,
        pincode: merged.pincode,
        radius: merged.radius,
      };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)).catch(() => {});
      return merged;
    });
  }, []);

  const setRadius = useCallback((radius: RadiusKm) => persist({ radius }), [persist]);

  const setLocation = useCallback((loc: SetLocationInput) => persist({ ...loc, status: 'granted' }), [persist]);

  const useCurrentLocation = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const coords = await getCurrentPosition();
      const geo = await reverseGeocode(coords.lat, coords.lng);
      persist({ ...coords, ...geo, status: 'granted' });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setState((s) => ({ ...s, status: message === 'location_timeout' ? 'timeout' : 'denied' }));
    }
  }, [persist]);

  const value: LocationContextValue = {
    ...state,
    setRadius,
    setLocation,
    useCurrentLocation,
    refresh: useCurrentLocation,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocation must be used within a LocationProvider');
  return ctx;
}
