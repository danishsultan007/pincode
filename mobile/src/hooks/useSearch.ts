import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as searchApi from '@/api/search';
import * as postsApi from '@/api/posts';
import * as communitiesApi from '@/api/communities';
import { useLocation } from '@/providers/LocationProvider';
import { haversineKm } from '@/lib/geo';

// Global search (MOBILE-PLAN.md §4 Search tab / §2.8). Each tab's RPC is
// loaded lazily — only the active tab's hook is enabled — and only once the
// (trimmed) query is at least 2 characters, matching the plan's "queries
// only when q.length >= 2 (debounce 300 ms)".

export type SearchTab = 'posts' | 'communities' | 'users';

export const SEARCH_MIN_LEN = 2;
export const SEARCH_DEBOUNCE_MS = 300;
const RECENT_KEY = 'pincode.recentSearches.v1';
const RECENT_MAX = 8;

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function useSearchPostsTab(q: string, active: boolean) {
  const location = useLocation();
  const trimmed = q.trim();
  const enabled = active && trimmed.length >= SEARCH_MIN_LEN;
  const query = useQuery({
    queryKey: ['search-posts', trimmed, location.lat, location.lng, location.radius],
    queryFn: () =>
      postsApi.searchPosts({
        q: trimmed,
        lat: location.lat,
        lng: location.lng,
        maxKm: 50,
        nearKm: location.radius,
        limit: 30,
      }),
    enabled,
  });
  const items = useMemo(
    () => (query.data ?? []).map((p) => ({ ...p, distKm: haversineKm(location.lat, location.lng, p.lat, p.lng) })),
    [query.data, location.lat, location.lng]
  );
  return { ...query, items, enabled };
}

export function useSearchCommunitiesTab(q: string, active: boolean) {
  const location = useLocation();
  const trimmed = q.trim();
  const enabled = active && trimmed.length >= SEARCH_MIN_LEN;
  const query = useQuery({
    queryKey: ['search-communities', trimmed, location.lat, location.lng],
    queryFn: () =>
      communitiesApi.communitiesNear({
        lat: location.lat,
        lng: location.lng,
        radiusKm: null, // no distance filter — nearby-first ordering still applies (§2.8)
        q: trimmed,
        sort: 'nearby',
        limit: 30,
      }),
    enabled,
  });
  const items = useMemo(
    () => (query.data ?? []).map((c) => ({ ...c, distKm: haversineKm(location.lat, location.lng, c.lat, c.lng) })),
    [query.data, location.lat, location.lng]
  );
  return { ...query, items, enabled };
}

export function useSearchUsersTab(q: string, active: boolean) {
  const trimmed = q.trim();
  const enabled = active && trimmed.replace(/^@/, '').trim().length >= SEARCH_MIN_LEN;
  const query = useQuery({
    queryKey: ['search-users', trimmed],
    queryFn: () => searchApi.searchUsers({ q: trimmed, limit: 30 }),
    enabled,
  });
  return { ...query, items: query.data ?? [], enabled };
}

// Recent searches (AsyncStorage, max 8) — MOBILE-PLAN.md §4 Search tab.
export function useRecentSearches() {
  const [items, setItems] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setItems(parsed.filter((x): x is string => typeof x === 'string'));
        } catch {
          // ignore malformed storage
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const add = useCallback((q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setItems((prev) => {
      const next = [trimmed, ...prev.filter((x) => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, RECENT_MAX);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    AsyncStorage.removeItem(RECENT_KEY).catch(() => {});
  }, []);

  return { items, add, clear, loaded };
}
