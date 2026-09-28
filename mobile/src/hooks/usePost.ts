import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as postsApi from '@/api/posts';
import { useAuth } from '@/providers/AuthProvider';
import type { PostCard, PostType } from '@/types/models';

// Post detail (MOBILE-PLAN.md §4 Post detail). Threaded comments (reads,
// replies, votes, reactions, mark_solved) live in hooks/useComments.ts.

export function usePost(id: string | undefined) {
  return useQuery<PostCard | null>({
    queryKey: ['post', id],
    queryFn: () => postsApi.getPost(id as string),
    enabled: !!id,
  });
}

// Exported so hooks/useComments.ts (useMarkSolved, useCreateComment) can
// invalidate the post/feed caches too — comment_count, answer_count and
// solved_comment_id all live on the post.
export function useInvalidatePost(postId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['post', postId] });
    queryClient.invalidateQueries({ queryKey: ['feed'] });
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
    queryClient.invalidateQueries({ queryKey: ['feed-search'] });
  };
}

export function useTogglePostVote(postId: string) {
  const invalidate = useInvalidatePost(postId);
  return useMutation({
    mutationFn: (on: boolean) => postsApi.togglePostVote(postId, on),
    onSuccess: invalidate,
  });
}

export function useTogglePostReaction(postId: string) {
  const invalidate = useInvalidatePost(postId);
  return useMutation({
    mutationFn: ({ reaction, on }: { reaction: string; on: boolean }) =>
      postsApi.togglePostReaction(postId, reaction, on),
    onSuccess: invalidate,
  });
}

export function useConfirmAlert(postId: string) {
  const invalidate = useInvalidatePost(postId);
  return useMutation({
    mutationFn: (kind: 'still_on' | 'resolved') => postsApi.confirmAlert(postId, kind),
    onSuccess: invalidate,
  });
}

export function useMarkPostResolved(postId: string) {
  const invalidate = useInvalidatePost(postId);
  return useMutation({
    mutationFn: () => postsApi.markPostResolved(postId),
    onSuccess: invalidate,
  });
}

export function useDeletePost(postId: string) {
  const invalidate = useInvalidatePost(postId);
  return useMutation({
    mutationFn: () => postsApi.deletePost(postId),
    onSuccess: invalidate,
  });
}

export function useUpdatePost(postId: string) {
  const invalidate = useInvalidatePost(postId);
  return useMutation({
    mutationFn: (input: postsApi.UpdatePostInput) => postsApi.updatePost(postId, input),
    onSuccess: invalidate,
  });
}

export function useRevealPhone(postId: string) {
  return useMutation({ mutationFn: () => postsApi.revealPostPhone(postId) });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: postsApi.CreatePostInput) => postsApi.createPost(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useUploadPostImage() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (uri: string) => {
      if (!user) throw new Error('not_authenticated');
      return postsApi.uploadPostImage(user.id, uri);
    },
  });
}

export type { PostType };
