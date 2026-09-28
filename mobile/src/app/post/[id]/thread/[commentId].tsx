import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { CommentThread } from '@/components/comments/CommentThread';
import { CommentComposer } from '@/components/comments/CommentComposer';
import { usePost } from '@/hooks/usePost';
import {
  useComments,
  useCreateComment,
  useToggleCommentVote,
  useToggleCommentReaction,
  useMarkSolved,
  useDeleteComment,
} from '@/hooks/useComments';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { findNode, rebaseDepth } from '@/lib/tree';
import { messageFor } from '@/lib/errors';
import { actionSheet, confirmAsync } from '@/lib/confirm';
import { copy } from '@/lib/copy';
import { colors, space } from '@/theme/tokens';
import type { ReactionCode } from '@/lib/constants';
import type { CommentCard } from '@/types/models';
import { goBack } from '@/lib/nav';

// The "Continue this thread" destination (MOBILE-PLAN.md §4 Thread, §7.3):
// renders the subtree rooted at commentId with depth re-based to 0, reusing
// the ['comments', postId] cache so no second fetch happens.
export default function ThreadScreen() {
  const { id: postId, commentId } = useLocalSearchParams<{ id: string; commentId: string }>();
  const router = useRouter();
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const { user, me } = useAuth();

  // MOBILE-PLAN.md §6 Moderation flow #4: disable the composer instead of
  // letting the RLS error surface after the user has typed a reply.
  const isSuspended =
    !!me &&
    (me.profile.ban_permanent || (!!me.profile.banned_until && new Date(me.profile.banned_until) > new Date()));

  const { data: post, isLoading: postLoading } = usePost(postId);
  const { comments, tree, isLoading: commentsLoading } = useComments(postId, post?.solved_comment_id);

  const createComment = useCreateComment(postId ?? '');
  const commentVoteMutation = useToggleCommentVote(postId ?? '');
  const commentReactionMutation = useToggleCommentReaction(postId ?? '');
  const solveMutation = useMarkSolved(postId ?? '');
  const deleteCommentMutation = useDeleteComment(postId ?? '');

  const rootNode = findNode(tree, commentId as string);
  const rebasedRoot = rootNode ? rebaseDepth(rootNode) : null;

  const defaultReplyTarget = rootNode
    ? { id: rootNode.id, username: rootNode.author_username ?? rootNode.author_display_name }
    : null;
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(defaultReplyTarget);
  const [commentBody, setCommentBody] = useState('');

  if (postLoading || commentsLoading) return null;

  if (!post || !rebasedRoot) {
    return (
      <Screen>
        <Header left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
        <EmptyState title="Not found" text={copy.post.postGone} />
      </Screen>
    );
  }

  const handleBackToPost = () => router.push(`/post/${postId}`);

  const handleSendComment = () => {
    if (!requireAuth()) return;
    const body = commentBody.trim();
    if (!body) return;
    const parentId = replyingTo?.id ?? rootNode?.id ?? null;
    createComment.mutate(
      { body, parentId },
      {
        onSuccess: () => setCommentBody(''),
        onError: (err) => toast.show(messageFor(err)),
      }
    );
  };

  const handleReply = (comment: CommentCard) => {
    if (!requireAuth()) return;
    setReplyingTo({ id: comment.id, username: comment.author_username ?? comment.author_display_name });
  };

  const handleCommentVote = (comment: CommentCard) => {
    if (!requireAuth()) return;
    if (user && user.id === comment.author_id) {
      toast.show(copy.post.selfVote);
      return;
    }
    commentVoteMutation.mutate(
      { commentId: comment.id, on: !comment.my_vote },
      { onError: (err) => toast.show(messageFor(err)) }
    );
  };

  const handleCommentReact = (commentId2: string, code: ReactionCode) => {
    if (!requireAuth()) return;
    const comment = comments.find((c) => c.id === commentId2);
    const on = !comment?.my_reactions.includes(code);
    commentReactionMutation.mutate({ commentId: commentId2, reaction: code, on }, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleToggleSolved = (comment: CommentCard) => {
    const isSolved = post.solved_comment_id === comment.id;
    solveMutation.mutate(isSolved ? null : comment.id, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleCommentMore = (comment: CommentCard) => {
    const isOwn = !!user && user.id === comment.author_id;
    if (isOwn) {
      actionSheet('Comment', [
        {
          label: copy.post.deleteComment,
          destructive: true,
          onPress: async () => {
            const ok = await confirmAsync(copy.post.deleteComment, undefined, {
              destructive: true,
              confirmLabel: copy.post.delete,
            });
            if (ok) deleteCommentMutation.mutate(comment.id, { onError: (err) => toast.show(messageFor(err)) });
          },
        },
      ]);
      return;
    }
    actionSheet('Comment', [
      {
        label: copy.post.report,
        onPress: () => {
          if (!requireAuth()) return;
          router.push({ pathname: '/report', params: { targetType: 'comment', targetId: comment.id } });
        },
      },
    ]);
  };

  return (
    <Screen edges={['top']}>
      <Header title="Thread" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <Pressable style={styles.backToPost} onPress={handleBackToPost}>
        <Icon name="chevron-left" size={14} color={colors.accent} />
        <Text variant="secondary" style={{ color: colors.accent }}>
          {copy.post.backToPost}
        </Text>
      </Pressable>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <CommentThread
            postId={postId as string}
            roots={[rebasedRoot]}
            postAuthorId={post.author_id}
            solvedCommentId={post.solved_comment_id}
            viewerId={user?.id}
            onReply={handleReply}
            onVote={handleCommentVote}
            onReact={handleCommentReact}
            onSolve={handleToggleSolved}
            onMore={handleCommentMore}
          />
        </ScrollView>

        <CommentComposer
          value={commentBody}
          onChangeText={setCommentBody}
          onSubmit={handleSendComment}
          placeholder={isSuspended ? copy.moderation.composerDisabled : copy.post.addComment}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(defaultReplyTarget)}
          disabled={isSuspended}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backToPost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.s4,
    paddingBottom: space.s2,
  },
  content: { padding: space.s4, paddingTop: 0, gap: space.s1, paddingBottom: space.s6 },
});
