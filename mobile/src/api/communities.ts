// Thin Supabase calls for communities (MOBILE-PLAN.md §2.7/§2.8). No
// react-query here — see hooks/useCommunities.ts.

import { supabase } from '@/lib/supabase';
import type {
  CommunityCard,
  CommunityEligibility,
  CommunityKind,
  CommunityMemberRow,
  CommunityRole,
} from '@/types/models';
import type { CommunityCategory } from '@/lib/constants';

export type CommunitiesNearInput = {
  lat: number;
  lng: number;
  radiusKm?: number | null;
  category?: CommunityCategory | null;
  kind?: CommunityKind | null;
  sort?: 'nearby' | 'members' | 'newest';
  q?: string | null;
  limit?: number;
  offset?: number;
};

export async function communitiesNear(input: CommunitiesNearInput): Promise<CommunityCard[]> {
  const { data, error } = await supabase.rpc('communities_near', {
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm ?? 25,
    p_category: input.category ?? null,
    p_kind: input.kind ?? null,
    p_sort: input.sort ?? 'nearby',
    p_q: input.q ?? null,
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return (data as CommunityCard[] | null) ?? [];
}

// "Your communities" (MOBILE-PLAN.md §4 Communities tab): community_cards
// where my_role is not null.
export async function myCommunities(): Promise<CommunityCard[]> {
  const { data, error } = await supabase
    .from('community_cards')
    .select('*')
    .not('my_role', 'is', null)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as CommunityCard[] | null) ?? [];
}

export async function getCommunityBySlug(slug: string): Promise<CommunityCard | null> {
  const { data, error } = await supabase.from('community_cards').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return (data as CommunityCard | null) ?? null;
}

export async function getCommunityById(id: string): Promise<CommunityCard | null> {
  const { data, error } = await supabase.from('community_cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as CommunityCard | null) ?? null;
}

export async function canCreateCommunity(): Promise<CommunityEligibility> {
  const { data, error } = await supabase.rpc('can_create_community');
  if (error) throw error;
  return data as CommunityEligibility;
}

export async function slugAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('slug_available', { p_slug: slug });
  if (error) throw error;
  return !!data;
}

export type CreateCommunityInput = {
  slug: string;
  name: string;
  description: string;
  rules: string[];
  kind: CommunityKind;
  category: CommunityCategory;
  lat: number;
  lng: number;
  radiusKm: number;
  pincode: string | null;
  area: string | null;
  city: string | null;
};

export async function createCommunity(input: CreateCommunityInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_community', {
    p_slug: input.slug,
    p_name: input.name,
    p_description: input.description,
    p_rules: input.rules,
    p_kind: input.kind,
    p_category: input.category,
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm,
    p_pincode: input.pincode,
    p_area: input.area,
    p_city: input.city,
  });
  if (error) throw error;
  return data as string;
}

export type UpdateCommunityInput = {
  name: string;
  description: string;
  rules: string[];
  category: CommunityCategory;
  radiusKm: number;
};

// A moderator may change description/rules; only the owner (or an admin) may
// change name/category/radius (MOBILE-PLAN.md §2.7) — the RPC itself enforces
// this, so a moderator's edit form disables the owner-only fields and just
// resubmits their current values.
export async function updateCommunity(id: string, input: UpdateCommunityInput): Promise<void> {
  const { error } = await supabase.rpc('update_community', {
    p_id: id,
    p_name: input.name,
    p_description: input.description,
    p_rules: input.rules,
    p_category: input.category,
    p_radius_km: input.radiusKm,
  });
  if (error) throw error;
}

// join_community/leave_community are direct table ops under RLS, not RPCs
// (MOBILE-PLAN.md §2.7). `role` is left unset so the column default
// ('member') applies — the cmem_join policy requires role = 'member' anyway.
// user_id must be sent explicitly (no prepare trigger defaults it); the grant
// allows it and cmem_join pins it to auth.uid().
export async function joinCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .insert({ community_id: communityId, user_id: userId });
  if (error) throw error;
}

export async function leaveCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function setNotifyPosts(communityId: string, userId: string, notify: boolean): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .update({ notify_posts: notify })
    .eq('community_id', communityId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function listMembers(communityId: string): Promise<CommunityMemberRow[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('community_id, user_id, role, notify_posts, joined_at, profiles(username, display_name, avatar_url, reputation)')
    .eq('community_id', communityId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const roleOrder: Record<CommunityRole, number> = { owner: 0, moderator: 1, member: 2 };
  return rows
    .map((row) => ({
      community_id: row.community_id as string,
      user_id: row.user_id as string,
      role: row.role as CommunityRole,
      notify_posts: !!row.notify_posts,
      joined_at: row.joined_at as string,
      username: (row.profiles?.username as string | null) ?? null,
      display_name: (row.profiles?.display_name as string) ?? '',
      avatar_url: (row.profiles?.avatar_url as string | null) ?? null,
      reputation: (row.profiles?.reputation as number) ?? 0,
    }))
    .sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);
}

export async function setCommunityRole(communityId: string, userId: string, role: 'moderator' | 'member'): Promise<void> {
  const { error } = await supabase.rpc('set_community_role', { p_comm: communityId, p_user: userId, p_role: role });
  if (error) throw error;
}

export async function removeCommunityMember(
  communityId: string,
  userId: string,
  reason: string | null,
  ban = true
): Promise<void> {
  const { error } = await supabase.rpc('remove_community_member', {
    p_comm: communityId,
    p_user: userId,
    p_reason: reason,
    p_ban: ban,
  });
  if (error) throw error;
}

export async function unbanCommunityMember(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('unban_community_member', { p_comm: communityId, p_user: userId });
  if (error) throw error;
}

export async function modSetPostRemoved(postId: string, removed: boolean, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('mod_set_post_removed', { p_post: postId, p_removed: removed, p_reason: reason });
  if (error) throw error;
}
