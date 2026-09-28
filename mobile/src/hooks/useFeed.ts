import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as postsApi from '@/api/posts';
import { useLocation } from '@/providers/LocationProvider';
import { haversineKm } from '@/lib/geo';
import { buildFeedGroups } from '@/lib/feedGroups';
import { isPostReportedLocally } from '@/api/moderation';
import type { PostCard, PostType } from '@/types/models';

// Nearby feed (MOBILE-PLAN.md §4 Home). List and map modes share this hook;
// the map draws every fetched item (plus the separate alerts strip query),
// the list groups them into rings via buildFeedGroups.

export type FeedFilter = 'all' | 'unanswered' | 'alerts' | 'events';
export type FeedSort = 'newest' | 'nearest';

function filterTypes(filter: FeedFilter): PostType[] | null {
  if (filter === 'alerts') return ['alert'];
  if (filter === 'events') return ['event'];
  if (filter === 'unanswered') return ['ask'];
  return null;
}

// PostCard.distKm is optional in the model (only set client-side); the feed
// hooks always compute it, so downstream consumers (FeedList, buildFeedGroups)
// can rely on it being present.
export type FeedPost = PostCard & { distKm: number };

// Excludes posts the viewer reported this session (MOBILE-PLAN.md §4 Report),
// on top of whatever posts_near/search_posts already filtered server-side.
function withDistance(items: PostCard[], lat: number, lng: number): FeedPost[] {
  return items
    .filter((p) => !isPostReportedLocally(p.id))
    .map((p) => ({ ...p, distKm: haversineKm(lat, lng, p.lat, p.lng) }));
}

export function useFeed(filter: FeedFilter, sort: FeedSort) {
  const location = useLocation();
  const fetchRadiusKm = Math.max(location.radius, 10);
  const types = filterTypes(filter);
  const unanswered = filter === 'unanswered';

  const query = useQuery({
    queryKey: ['feed', location.lat, location.lng, fetchRadiusKm, filter, sort],
    queryFn: () =>
      postsApi.postsNear({
        lat: location.lat,
        lng: location.lng,
        radiusKm: fetchRadiusKm,
        types,
        unanswered,
        sort,
      }),
  });

  const items = useMemo(
    () => withDistance(query.data ?? [], location.lat, location.lng),
    [query.data, location.lat, location.lng]
  );

  const groups = useMemo(() => buildFeedGroups(items, location.radius), [items, location.radius]);

  return { ...query, items, groups, radius: location.radius };
}

// Alerts strip (All filter only, per the spec). Always sorted nearest-first
// within the user's chosen radius.
export function useAlerts(enabled: boolean) {
  const location = useLocation();
  const query = useQuery({
    queryKey: ['alerts', location.lat, location.lng, location.radius],
    queryFn: () =>
      postsApi.postsNear({
        lat: location.lat,
        lng: location.lng,
        radiusKm: location.radius,
        types: ['alert'],
        sort: 'nearest',
      }),
    enabled,
  });
  const items = useMemo(
    () => withDistance(query.data ?? [], location.lat, location.lng),
    [query.data, location.lat, location.lng]
  );
  return { ...query, items };
}

export function useSearchFeed(q: string, searchRadiusKm: number | null) {
  const location = useLocation();
  const trimmed = q.trim();
  const query = useQuery({
    queryKey: ['feed-search', trimmed, location.lat, location.lng, searchRadiusKm, location.radius],
    queryFn: () =>
      postsApi.searchPosts({
        q: trimmed,
        lat: location.lat,
        lng: location.lng,
        maxKm: searchRadiusKm ?? location.radius,
        nearKm: location.radius,
      }),
    enabled: trimmed.length > 0,
  });
  const items = useMemo(
    () => withDistance(query.data ?? [], location.lat, location.lng),
    [query.data, location.lat, location.lng]
  );
  return { ...query, items };
}
