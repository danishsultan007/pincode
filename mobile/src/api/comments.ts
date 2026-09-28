// Thin Supabase calls for the threaded comments system (MOBILE-PLAN.md
// §2.3/§2.8/§7.3, P4). Flat P3 comment helpers (getComments, createAnswer,
// toggleCommentVote, markSolved) used to live in api/posts.ts — they moved
// here so comments have one code path. Query key stays ['comments', postId].

import { supabase } from '@/lib/supabase';
import type { CommentCard } from '@/types/models';
import type { ReactionCode } from '@/lib/constants';

export async function getComments(postId: string): Promise<CommentCard[]> {
  const { data, error } = await supabase
    .from('comment_cards')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data as CommentCard[] | null) ?? [];
}

// Profile "Answers" tab (MOBILE-PLAN.md §4 Profile).
export async function listAnswersByAuthor(authorId: string): Promise<CommentCard[]> {
  const { data, error } = await supabase
    .from('comment_cards')
    .select('*')
    .eq('author_id', authorId)
    .eq('is_answer', true)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data as CommentCard[] | null) ?? [];
}

export type CreateCommentInput = {
  postId: string;
  body: string;
  parentId?: string | null;
};

// A reply notifies the parent comment's author and the post author — that's
// done server-side by t60_comments_notify (MOBILE-PLAN.md §2.5); the client
// only needs to insert with parent_id set.
export async function createComment(input: CreateCommentInput): Promise<CommentCard> {
  const { data, error } = await supabase
    .from('comments')
    .insert({ post_id: input.postId, body: input.body, parent_id: input.parentId ?? null })
    .select('id')
    .single();
  if (error) throw error;
  const inserted = data as { id: string };
  const { data: card, error: cardError } = await supabase
    .from('comment_cards')
    .select('*')
    .eq('id', inserted.id)
    .single();
  if (cardError) throw cardError;
  return card as CommentCard;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_comment', { p_id: id });
  if (error) throw error;
}

export async function toggleCommentVote(commentId: string, on: boolean): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (on) {
    const { error } = await supabase.from('comment_votes').insert({ comment_id: commentId, user_id: uid });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('comment_votes').delete().eq('comment_id', commentId).eq('user_id', uid);
    if (error) throw error;
  }
}

export async function toggleCommentReaction(commentId: string, reaction: ReactionCode, on: boolean): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error('not_authenticated');
  if (on) {
    const { error } = await supabase.from('comment_reactions').insert({ comment_id: commentId, user_id: uid, reaction });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', uid)
      .eq('reaction', reaction);
    if (error) throw error;
  }
}

export async function markSolved(postId: string, commentId: string | null): Promise<void> {
  const { error } = await supabase.rpc('mark_solved', { p_post: postId, p_comment: commentId });
  if (error) throw error;
}
