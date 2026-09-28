// Thin Supabase call for the Users tab of global search (MOBILE-PLAN.md
// §2.8/§4 Search tab). Posts and Communities reuse api/posts.ts#searchPosts
// and api/communities.ts#communitiesNear (called with radiusKm: null so the
// distance filter is skipped and results stay nearby-first via st_distance
// ordering) — see hooks/useSearch.ts.

import { supabase } from '@/lib/supabase';
import type { UserSearchResult } from '@/types/models';

export type SearchUsersInput = {
  q: string;
  limit?: number;
  offset?: number;
};

export async function searchUsers(input: SearchUsersInput): Promise<UserSearchResult[]> {
  const { data, error } = await supabase.rpc('search_users', {
    p_q: input.q,
    p_limit: input.limit ?? 30,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return (data as UserSearchResult[] | null) ?? [];
}
