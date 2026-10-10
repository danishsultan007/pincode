import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as commentsApi from '@/api/comments';
import { useInvalidatePost } from '@/hooks/usePost';
import { invalidateAfter, type InvalidateKind } from '@/lib/invalidate';
import { buildCommentTree } from '@/lib/tree';
import type { CommentCard, CommentNode } from '@/types/models';
import type { ReactionCode } from '@/lib/constants';

// Threaded comments (MOBILE-PLAN.md §4 Post detail / Thread, §7.3). Query
// key ['comments', postId] is shared with the (now removed) P3 flat reader,
// so post/[id]/thread/[commentId] can reuse this same cache without a
// second fetch.

export function useComments(postId: string | undefined, solvedCommentId?: string | null) {
  const query = useQuery<CommentCard[]>({
    queryKey: ['comments', postId],
    queryFn: () => commentsApi.getComments(postId as string),
    enabled: !!postId,
  });
  const tree: CommentNode[] = buildCommentTree(query.data ?? [], solvedCommentId);
  return { ...query, comments: query.data ?? [], tree };
}

function useInvalidateComments(postId: string, kind: InvalidateKind = 'comment') {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    invalidateAfter(queryClient, kind);
  };
}

export function useCreateComment(postId: string) {
  const invalidateComments = useInvalidateComments(postId);
  const invalidatePost = useInvalidatePost(postId, 'comment');
  return useMutation({
    mutationFn: (input: { body: string; parentId?: string | null }) =>
      commentsApi.createComment({ postId, body: input.body, parentId: input.parentId ?? null }),
    onSuccess: () => {
      invalidateComments();
      invalidatePost(); // comment_count / answer_count / first_answer_at changed
    },
  });
}

export function useToggleCommentVote(postId: string) {
  const invalidateComments = useInvalidateComments(postId, 'comment-vote');
  return useMutation({
    mutationFn: ({ commentId, on }: { commentId: string; on: boolean }) =>
      commentsApi.toggleCommentVote(commentId, on),
    onSuccess: invalidateComments,
  });
}

export function useToggleCommentReaction(postId: string) {
  const invalidateComments = useInvalidateComments(postId, 'comment-vote');
  return useMutation({
    mutationFn: ({ commentId, reaction, on }: { commentId: string; reaction: ReactionCode; on: boolean }) =>
      commentsApi.toggleCommentReaction(commentId, reaction, on),
    onSuccess: invalidateComments,
  });
}

export function useDeleteComment(postId: string) {
  const invalidateComments = useInvalidateComments(postId);
  const invalidatePost = useInvalidatePost(postId, 'comment');
  return useMutation({
    mutationFn: (commentId: string) => commentsApi.deleteComment(commentId),
    onSuccess: () => {
      invalidateComments();
      invalidatePost(); // may have unsolved the post (delete_comment calls _set_solved)
    },
  });
}

export function useMarkSolved(postId: string) {
  const invalidateComments = useInvalidateComments(postId);
  const invalidatePost = useInvalidatePost(postId, 'comment');
  return useMutation({
    mutationFn: (commentId: string | null) => commentsApi.markSolved(postId, commentId),
    onSuccess: () => {
      invalidateComments();
      invalidatePost();
    },
  });
}
