import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Banner';
import { Divider } from '@/components/ui/Divider';
import { TypeLabel } from '@/components/post/TypeLabel';
import { DateBlock } from '@/components/post/DateBlock';
import { PostStatusLine } from '@/components/post/PostStatusLine';
import { VoteButton } from '@/components/post/VoteButton';
import { ReactionBar } from '@/components/post/ReactionBar';
import { PhoneReveal } from '@/components/post/PhoneReveal';
import { ShareRow } from '@/components/post/ShareRow';
import { PostActions } from '@/components/post/PostActions';
import { CommentThread } from '@/components/comments/CommentThread';
import { CommentComposer } from '@/components/comments/CommentComposer';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  usePost,
  useTogglePostVote,
  useTogglePostReaction,
  useConfirmAlert,
  useMarkPostResolved,
  useDeletePost,
  useRevealPhone,
} from '@/hooks/usePost';
import {
  useComments,
  useCreateComment,
  useToggleCommentVote,
  useToggleCommentReaction,
  useMarkSolved,
  useDeleteComment,
} from '@/hooks/useComments';
import { useCommunityById, useModSetPostRemoved } from '@/hooks/useCommunities';
import { useStartConversation } from '@/hooks/useInbox';
import { supabase } from '@/lib/supabase';
import { fmtKm, fmtWhen, timeAgo } from '@/lib/format';
import { messageFor } from '@/lib/errors';
import { actionSheet, confirmAsync } from '@/lib/confirm';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import { Icon } from '@/components/ui/Icon';
import type { ReactionCode } from '@/lib/constants';
import type { CommentCard } from '@/types/models';
import { DetailState } from '@/components/ui/DetailState';
import { goBack } from '@/lib/nav';

export default function PostDetail() {
  const { id, comment: highlightCommentId } = useLocalSearchParams<{ id: string; comment?: string }>();
  const router = useRouter();
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const { user, me } = useAuth();

  const { data: post, isLoading, isError, refetch } = usePost(id);
  const { comments, tree } = useComments(id, post?.solved_comment_id);

  const voteMutation = useTogglePostVote(id ?? '');
  const reactionMutation = useTogglePostReaction(id ?? '');
  const confirmMutation = useConfirmAlert(id ?? '');
  const resolveMutation = useMarkPostResolved(id ?? '');
  const deleteMutation = useDeletePost(id ?? '');
  const createComment = useCreateComment(id ?? '');
  const commentVoteMutation = useToggleCommentVote(id ?? '');
  const commentReactionMutation = useToggleCommentReaction(id ?? '');
  const solveMutation = useMarkSolved(id ?? '');
  const deleteCommentMutation = useDeleteComment(id ?? '');
  const revealPhone = useRevealPhone(id ?? '');
  const { data: postCommunity } = useCommunityById(post?.community_id ?? null);
  const modRemoveMutation = useModSetPostRemoved(id ?? '');

  const [commentBody, setCommentBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const startConversation = useStartConversation();

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!highlightCommentId) return;
    const t = setTimeout(() => {
      const y = offsets.current[highlightCommentId];
      if (typeof y === 'number') scrollRef.current?.scrollTo({ y: Math.max(y - 80, 0), animated: true });
    }, 350);
    return () => clearTimeout(t);
  }, [highlightCommentId, comments.length]);

  if (isLoading) return <DetailState kind="loading" />;
  if (isError) return <DetailState kind="error" onRetry={() => refetch()} />;
  if (!post) return <DetailState kind="notFound" text={copy.post.postGone} />;

  const isAuthor = !!user && user.id === post.author_id;
  const isCommunityMod = !!postCommunity && (postCommunity.my_role === 'owner' || postCommunity.my_role === 'moderator');

  const handleVote = () => {
    if (!requireAuth()) return;
    voteMutation.mutate(!post.my_vote, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleReaction = (code: ReactionCode) => {
    if (!requireAuth()) return;
    const on = !post.my_reactions.includes(code);
    reactionMutation.mutate({ reaction: code, on }, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleConfirm = (kind: 'still_on' | 'resolved') => {
    if (!requireAuth()) return;
    confirmMutation.mutate(kind, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleEdit = () => router.push({ pathname: '/compose', params: { id: post.id } });

  const handleDelete = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => router.replace('/(tabs)'),
      onError: (err) => toast.show(messageFor(err)),
    });
  };

  const handleMarkResolved = () => {
    resolveMutation.mutate(undefined, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleReport = () => {
    if (!requireAuth()) return;
    router.push({ pathname: '/report', params: { targetType: 'post', targetId: post.id } });
  };

  const handleMessage = async () => {
    if (!requireAuth()) return;
    try {
      const conversationId = await startConversation.mutateAsync(post.author_id);
      router.push(`/chat/${conversationId}`);
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  const handleRemoveFromCommunity = () => {
    if (!requireAuth()) return;
    modRemoveMutation.mutate(
      { removed: true, reason: null },
      {
        onSuccess: () => toast.show(copy.communities.removedFromCommunity),
        onError: (err) => toast.show(messageFor(err)),
      }
    );
  };

  const handleToggleBlock = async () => {
    if (!requireAuth() || !user) return;
    try {
      if (isBlocked) {
        await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', post.author_id);
        setIsBlocked(false);
      } else {
        await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: post.author_id });
        setIsBlocked(true);
      }
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  const handleSendComment = () => {
    if (!requireAuth()) return;
    const body = commentBody.trim();
    if (!body) return;
    createComment.mutate(
      { body, parentId: replyingTo?.id ?? null },
      {
        onSuccess: () => {
          setCommentBody('');
          setReplyingTo(null);
        },
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

  const handleCommentReact = (commentId: string, code: ReactionCode) => {
    if (!requireAuth()) return;
    const comment = comments.find((c) => c.id === commentId);
    const on = !comment?.my_reactions.includes(code);
    commentReactionMutation.mutate({ commentId, reaction: code, on }, { onError: (err) => toast.show(messageFor(err)) });
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

  const isPendingOwn = post.mod_status === 'pending' && isAuthor;
  const canWriteAnswer = post.type === 'ask' && !isAuthor;
  // MOBILE-PLAN.md §6 Moderation flow #4: can_participate() is the source of
  // truth server-side; the client disables the composer and explains why
  // instead of letting the RLS error surface after the user has typed a reply.
  const isSuspended =
    !!me &&
    (me.profile.ban_permanent || (!!me.profile.banned_until && new Date(me.profile.banned_until) > new Date()));

  return (
    <Screen edges={['top']}>
      <Header
        title="Post"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
        right={
          <PostActions
            post={post}
            isAuthor={isAuthor}
            isBlocked={isBlocked}
            isCommunityMod={isCommunityMod}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMarkResolved={handleMarkResolved}
            onReport={handleReport}
            onMessage={handleMessage}
            onToggleBlock={handleToggleBlock}
            onRemoveFromCommunity={handleRemoveFromCommunity}
          />
        }
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
      >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isPendingOwn ? <Banner tone="warn" text={copy.post.underReview} /> : null}
        {isSuspended ? (
          <Banner
            tone="warn"
            text={
              me?.profile.ban_permanent
                ? copy.moderation.permanentlyBanned
                : copy.moderation.suspendedUntil(new Date(me!.profile.banned_until as string).toLocaleDateString())
            }
          />
        ) : null}

        <View style={styles.topRow}>
          <TypeLabel type={post.type} kind={post.kind} />
          <Text variant="meta">
            {[post.area, post.pincode, typeof post.distKm === 'number' ? fmtKm(post.distKm) : null, `${timeAgo(post.created_at)} ago`]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {post.community_name && post.community_slug ? (
          <Pressable onPress={() => router.push(`/community/${post.community_slug}`)}>
            <Text variant="secondary" style={{ color: colors.accent, fontWeight: '600' }}>
              in {post.community_name}
            </Text>
          </Pressable>
        ) : null}

        <Text variant="title">{post.title}</Text>

        <View style={styles.badgeRow}>
          {post.type === 'event' && post.starts_at ? (
            <View style={styles.eventRow}>
              <DateBlock startsAt={post.starts_at} />
              <Text variant="secondary">{fmtWhen(post.starts_at)}</Text>
            </View>
          ) : (
            <PostStatusLine post={post} />
          )}
        </View>

        {post.body ? <Text variant="body">{post.body}</Text> : null}
        {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.image} /> : null}

        {post.has_phone ? <PhoneReveal reveal={() => revealPhone.mutateAsync()} /> : null}

        <Divider />

        <Pressable
          style={styles.authorRow}
          onPress={() => post.author_username && router.push(`/user/${post.author_username}`)}
        >
          <Avatar uri={post.author_avatar_url} name={post.author_display_name} size={40} />
          <View>
            <Text variant="body" style={{ fontWeight: '600' }}>{post.author_display_name}</Text>
            {post.author_username ? <Text variant="meta">@{post.author_username}</Text> : null}
          </View>
          <View style={{ flex: 1 }} />
          <Icon name="chevron-right" size={16} color={colors.ink3} />
        </Pressable>

        <View style={styles.actionRow}>
          <VoteButton count={post.upvote_count} mine={post.my_vote} onPress={handleVote} disabled={isAuthor} />
          <ReactionBar counts={post.reaction_counts} mine={post.my_reactions} onToggle={handleReaction} />
        </View>

        {post.type === 'alert' && post.status === 'active' && !isAuthor ? (
          <View style={styles.actionRow}>
            <Button
              label={post.my_confirmation === 'still_on' ? `✓ ${copy.post.stillHappening}` : copy.post.stillHappening}
              variant="ghost"
              size="sm"
              onPress={() => handleConfirm('still_on')}
              disabled={!!post.my_confirmation}
            />
            <Button
              label={post.my_confirmation === 'resolved' ? `✓ ${copy.post.resolved}` : copy.post.resolved}
              variant="ghost"
              size="sm"
              onPress={() => handleConfirm('resolved')}
              disabled={!!post.my_confirmation}
            />
          </View>
        ) : null}

        <ShareRow postId={post.id} title={post.title} />

        <Divider />

        <SectionHeader count={comments.length} type={post.type} />

        <CommentThread
          postId={post.id}
          roots={tree}
          postAuthorId={post.author_id}
          solvedCommentId={post.solved_comment_id}
          viewerId={user?.id}
          onReply={handleReply}
          onVote={handleCommentVote}
          onReact={handleCommentReact}
          onSolve={handleToggleSolved}
          onMore={handleCommentMore}
          highlightCommentId={highlightCommentId}
          onCommentLayout={(commentId, y) => {
            offsets.current[commentId] = y;
          }}
        />

        {!comments.length ? <Text variant="secondary">No answers yet.</Text> : null}
      </ScrollView>

      {!isPendingOwn ? (
        <CommentComposer
          value={commentBody}
          onChangeText={setCommentBody}
          onSubmit={handleSendComment}
          placeholder={
            isSuspended
              ? copy.moderation.composerDisabled
              : replyingTo
                ? copy.post.addComment
                : canWriteAnswer
                  ? copy.post.writeAnswer
                  : copy.post.addComment
          }
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
          disabled={isSuspended}
        />
      ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SectionHeader({ count, type }: { count: number; type: 'ask' | 'alert' | 'event' }) {
  const label = type === 'ask' ? copy.post.answersCount(count) : `${count} comment${count === 1 ? '' : 's'}`;
  return <Text variant="label">{label}</Text>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space.s4, gap: space.s4, paddingBottom: space.s7 },
  image: { width: '100%', height: 260, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    padding: space.s3,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' },
});
