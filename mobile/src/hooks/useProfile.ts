import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as profilesApi from '@/api/profiles';
import * as postsApi from '@/api/posts';
import * as commentsApi from '@/api/comments';
import { useAuth } from '@/providers/AuthProvider';
import type { CommentCard, PostCard, PublicProfileBundle } from '@/types/models';

// Profile Posts/Answers tabs (MOBILE-PLAN.md §4 Profile / Public profile).
export function useAuthorPosts(authorId: string | undefined) {
  return useQuery<PostCard[]>({
    queryKey: ['author-posts', authorId],
    queryFn: () => postsApi.listPostsByAuthor(authorId as string),
    enabled: !!authorId,
  });
}

export function useAuthorAnswers(authorId: string | undefined) {
  return useQuery<CommentCard[]>({
    queryKey: ['author-answers', authorId],
    queryFn: () => commentsApi.listAnswersByAuthor(authorId as string),
    enabled: !!authorId,
  });
}

export function usePublicProfile(username: string | undefined) {
  return useQuery<PublicProfileBundle | null>({
    queryKey: ['profile', username],
    queryFn: () => profilesApi.getProfileByUsername(username as string),
    enabled: !!username,
  });
}

export function useUpdateProfile() {
  const { user, refreshMe } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: profilesApi.ProfileEditInput) => {
      if (!user) throw new Error('not_authenticated');
      return profilesApi.updateMyProfile(user.id, input);
    },
    onSuccess: async () => {
      await refreshMe();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUploadAvatar() {
  const { user } = useAuth();
  const updateProfile = useUpdateProfile();

  return useMutation({
    mutationFn: async (uri: string) => {
      if (!user) throw new Error('not_authenticated');
      const url = await profilesApi.uploadAvatar(user.id, uri);
      await updateProfile.mutateAsync({ avatar_url: url });
      return url;
    },
  });
}

export function useBlockedUsers() {
  return useQuery({ queryKey: ['blocked-users'], queryFn: profilesApi.listBlockedUsers });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => profilesApi.unblockUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['blocked-users'] }),
  });
}
