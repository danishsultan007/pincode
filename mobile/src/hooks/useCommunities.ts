import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as communitiesApi from '@/api/communities';
import * as postsApi from '@/api/posts';
import { useAuth } from '@/providers/AuthProvider';
import { useLocation } from '@/providers/LocationProvider';
import { haversineKm } from '@/lib/geo';
import { invalidateAfter } from '@/lib/invalidate';
import type { CommunityCard, CommunityKind } from '@/types/models';
import type { CommunityCategory } from '@/lib/constants';

// Communities discovery + membership (MOBILE-PLAN.md §4 Communities tab /
// Community page / Community new). Post detail (P3) and compose (P3/P6) use
// useMyCommunities and useCommunityById/useModSetPostRemoved from here too.

export type CommunitySort = 'nearby' | 'members' | 'newest';
export type CommunityCardWithDist = CommunityCard & { distKm: number };

function withDistance(items: CommunityCard[], lat: number, lng: number): CommunityCardWithDist[] {
  return items.map((c) => ({ ...c, distKm: haversineKm(lat, lng, c.lat, c.lng) }));
}

export function useCommunitiesNear(radiusKm: number, category: CommunityCategory | null, sort: CommunitySort) {
  const location = useLocation();
  const query = useQuery({
    queryKey: ['communities-near', location.lat, location.lng, radiusKm, category, sort],
    queryFn: () =>
      communitiesApi.communitiesNear({
        lat: location.lat,
        lng: location.lng,
        radiusKm,
        category,
        sort,
      }),
  });
  const items = useMemo(
    () => withDistance(query.data ?? [], location.lat, location.lng),
    [query.data, location.lat, location.lng]
  );
  return { ...query, items };
}

export function useMyCommunities() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['my-communities'],
    queryFn: communitiesApi.myCommunities,
    enabled: !!session,
  });
}

export function useCommunity(slug: string | undefined) {
  return useQuery<CommunityCard | null>({
    queryKey: ['community', slug],
    queryFn: () => communitiesApi.getCommunityBySlug(slug as string),
    enabled: !!slug,
  });
}

// Used by the post detail screen (P3) to tell whether the viewer moderates
// the post's community, for the PostActions "Remove from community" branch.
export function useCommunityById(id: string | null | undefined) {
  return useQuery<CommunityCard | null>({
    queryKey: ['community-by-id', id],
    queryFn: () => communitiesApi.getCommunityById(id as string),
    enabled: !!id,
  });
}

export function useCanCreateCommunity() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['can-create-community'],
    queryFn: communitiesApi.canCreateCommunity,
    enabled: !!session,
  });
}

// Posts inside a community (MOBILE-PLAN.md §4 Community page): posts_near
// with p_community_id set, which drops the distance filter server-side.
export function useCommunityPosts(communityId: string | undefined) {
  const location = useLocation();
  const query = useQuery({
    queryKey: ['community-posts', communityId],
    queryFn: () =>
      postsApi.postsNear({
        lat: location.lat,
        lng: location.lng,
        radiusKm: 999,
        communityId: communityId as string,
        sort: 'newest',
        limit: 200,
      }),
    enabled: !!communityId,
  });
  const items = useMemo(
    () => (query.data ?? []).map((p) => ({ ...p, distKm: haversineKm(location.lat, location.lng, p.lat, p.lng) })),
    [query.data, location.lat, location.lng]
  );
  return { ...query, items };
}

function useInvalidateCommunities() {
  const queryClient = useQueryClient();
  return () => invalidateAfter(queryClient, 'community');
}

export function useJoinCommunity() {
  const invalidate = useInvalidateCommunities();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (communityId: string) => {
      if (!user) throw new Error('not_authenticated');
      return communitiesApi.joinCommunity(communityId, user.id);
    },
    onSuccess: invalidate,
  });
}

export function useLeaveCommunity() {
  const invalidate = useInvalidateCommunities();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (communityId: string) => {
      if (!user) throw new Error('not_authenticated');
      return communitiesApi.leaveCommunity(communityId, user.id);
    },
    onSuccess: invalidate,
  });
}

export function useSetNotifyPosts() {
  const invalidate = useInvalidateCommunities();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ communityId, notify }: { communityId: string; notify: boolean }) => {
      if (!user) throw new Error('not_authenticated');
      return communitiesApi.setNotifyPosts(communityId, user.id, notify);
    },
    onSuccess: invalidate,
  });
}

export function useCommunityMembers(communityId: string | undefined) {
  return useQuery({
    queryKey: ['community-members', communityId],
    queryFn: () => communitiesApi.listMembers(communityId as string),
    enabled: !!communityId,
  });
}

export function useSetCommunityRole(communityId: string) {
  const invalidate = useInvalidateCommunities();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: 'moderator' | 'member' }) =>
      communitiesApi.setCommunityRole(communityId, userId, role),
    onSuccess: invalidate,
  });
}

export function useRemoveCommunityMember(communityId: string) {
  const invalidate = useInvalidateCommunities();
  return useMutation({
    mutationFn: ({ userId, reason, ban }: { userId: string; reason: string | null; ban?: boolean }) =>
      communitiesApi.removeCommunityMember(communityId, userId, reason, ban ?? true),
    onSuccess: invalidate,
  });
}

export function useUnbanCommunityMember(communityId: string) {
  const invalidate = useInvalidateCommunities();
  return useMutation({
    mutationFn: (userId: string) => communitiesApi.unbanCommunityMember(communityId, userId),
    onSuccess: invalidate,
  });
}

export function useUpdateCommunity(communityId: string) {
  const invalidate = useInvalidateCommunities();
  return useMutation({
    mutationFn: (input: communitiesApi.UpdateCommunityInput) => communitiesApi.updateCommunity(communityId, input),
    onSuccess: invalidate,
  });
}

export function useCreateCommunity() {
  const invalidate = useInvalidateCommunities();
  return useMutation({
    mutationFn: (input: communitiesApi.CreateCommunityInput) => communitiesApi.createCommunity(input),
    onSuccess: invalidate,
  });
}

// Community-mod post removal (MOBILE-PLAN.md §2.7 mod_set_post_removed),
// used from PostActions on the post detail screen (P3/P6).
export function useModSetPostRemoved(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ removed, reason }: { removed: boolean; reason: string | null }) =>
      communitiesApi.modSetPostRemoved(postId, removed, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
      invalidateAfter(queryClient, 'moderation');
    },
  });
}

export type { CommunityKind };
