// Thin Supabase calls for posts (MOBILE-PLAN.md §2.8/§2.3). No react-query
// here — see hooks/useFeed.ts and hooks/usePost.ts. Comments (threaded
// reads/writes, votes, reactions, mark_solved) live in api/comments.ts.

import { supabase } from '@/lib/supabase';
import { readImage } from '@/lib/readImage';
import type { PostCard, PostKind, PostType } from '@/types/models';

export type PostsNearInput = {
  lat: number;
  lng: number;
  radiusKm: number;
  types?: PostType[] | null;
  unanswered?: boolean;
  sort?: 'newest' | 'nearest';
  communityId?: string | null;
  includeExpired?: boolean;
  limit?: number;
  offset?: number;
};

export async function postsNear(input: PostsNearInput): Promise<PostCard[]> {
  const { data, error } = await supabase.rpc('posts_near', {
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_km: input.radiusKm,
    p_types: input.types ?? null,
    p_unanswered: input.unanswered ?? false,
    p_sort: input.sort ?? 'newest',
    p_community_id: input.communityId ?? null,
    p_include_expired: input.includeExpired ?? false,
    p_limit: input.limit ?? 200,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return (data as PostCard[] | null) ?? [];
}

export type SearchPostsInput = {
  q: string;
  lat: number;
  lng: number;
  maxKm?: number;
  nearKm?: number;
  limit?: number;
  offset?: number;
};

export async function searchPosts(input: SearchPostsInput): Promise<PostCard[]> {
  const { data, error } = await supabase.rpc('search_posts', {
    p_q: input.q,
    p_lat: input.lat,
    p_lng: input.lng,
    p_max_km: input.maxKm ?? 50,
    p_near_km: input.nearKm ?? 5,
    p_limit: input.limit ?? 30,
    p_offset: input.offset ?? 0,
  });
  if (error) throw error;
  return (data as PostCard[] | null) ?? [];
}

export async function getPost(id: string): Promise<PostCard | null> {
  const { data, error } = await supabase.from('post_cards').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as PostCard | null) ?? null;
}

// Profile "Posts" / "Answers" tabs (MOBILE-PLAN.md §4 Profile).
export async function listPostsByAuthor(authorId: string): Promise<PostCard[]> {
  const { data, error } = await supabase
    .from('post_cards')
    .select('*')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as PostCard[] | null) ?? [];
}

export type CreatePostInput = {
  type: PostType;
  kind?: PostKind | null;
  tag?: string | null;
  title: string;
  body: string;
  phone_e164?: string | null;
  lat: number;
  lng: number;
  pincode?: string | null;
  area?: string | null;
  city?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  community_id?: string | null;
  image_url?: string | null;
};

export async function createPost(input: CreatePostInput): Promise<{ id: string; mod_status: string }> {
  const { data, error } = await supabase.from('posts').insert(input).select('id, mod_status').single();
  if (error) throw error;
  return data as { id: string; mod_status: string };
}

export type UpdatePostInput = Partial<Pick<CreatePostInput, 'title' | 'body' | 'tag' | 'image_url'>> & {
  status?: 'active' | 'resolved';
};

export async function updatePost(id: string, input: UpdatePostInput): Promise<void> {
  const { error } = await supabase.from('posts').update(input).eq('id', id);
  if (error) throw error;
}

// Mirrors profilesApi.uploadAvatar (api/profiles.ts) but for the
// 'post-images' bucket. No aspect crop/allowsEditing on the picker side
// (compose.tsx) so an animated GIF passes through unmodified instead of
// being flattened to a single frame.
export async function uploadPostImage(uid: string, uri: string): Promise<string> {
  const { bytes, mime, ext } = await readImage(uri);
  const path = `${uid}/post-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('post-images').upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('post-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function deletePost(id: string): Promise<void> {
  const { error } = await supabase.from('posts').delete().eq('id', id);
  if (error) throw error;
}

export async function markPostResolved(id: string): Promise<void> {
  const { error } = await supabase.from('posts').update({ status: 'resolved' }).eq('id', id);
  if (error) throw error;
}

export async function revealPostPhone(id: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('reveal_post_phone', { p_post: id });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function togglePostVote(postId: string, on: boolean): Promise<void> {
  if (on) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('not_authenticated');
    const { error } = await supabase.from('post_votes').insert({ post_id: postId, user_id: uid });
    if (error) throw error;
  } else {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error('not_authenticated');
    const { error } = await supabase.from('post_votes').delete().eq('post_id', postId).eq('user_id', uid);
    if (error) throw error;
  }
}

export async function togglePostReaction(postId: string, reaction: string, on: boolean): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (on) {
    const { error } = await supabase.from('post_reactions').insert({ post_id: postId, user_id: uid, reaction });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', uid)
      .eq('reaction', reaction);
    if (error) throw error;
  }
}

export async function confirmAlert(postId: string, kind: 'still_on' | 'resolved'): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('not_authenticated');
  const { error } = await supabase.from('alert_confirmations').insert({ post_id: postId, user_id: uid, kind });
  if (error) throw error;
}

