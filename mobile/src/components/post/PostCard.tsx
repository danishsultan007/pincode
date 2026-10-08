import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { TypeLabel } from './TypeLabel';
import { PostStatusLine } from './PostStatusLine';
import { VoteButton } from './VoteButton';
import { colors, radius, space } from '@/theme/tokens';
import { fmtKm, timeAgo } from '@/lib/format';
import { useTogglePostVote } from '@/hooks/usePost';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { messageFor } from '@/lib/errors';
import type { PostCard as PostCardModel } from '@/types/models';

export type PostCardProps = { post: PostCardModel };

// Card anatomy: top row type pill + tag + right "2.1 km · 3h"; title clamped
// to 2 lines; body clamped to 2 lines; foot VoteButton, PostStatusLine,
// "area · pincode".
export function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const { user } = useAuth();
  const vote = useTogglePostVote(post.id);

  const isPast = post.status === 'resolved' || post.is_expired;
  // Only the author sees this — everyone else's feed query already excludes
  // non-visible posts (posts_near / post_cards RLS), so a pending/removed
  // post only ever reaches the client here when it's the viewer's own.
  const isMine = post.author_id === user?.id;
  const modBadge =
    isMine && post.mod_status === 'pending'
      ? { label: 'Under review', tone: 'warn' as const }
      : isMine && post.mod_status === 'removed'
      ? { label: 'Removed', tone: 'danger' as const }
      : null;

  const handleVote = () => {
    if (!requireAuth()) return;
    vote.mutate(!post.my_vote, {
      onError: (err) => toast.show(messageFor(err)),
    });
  };

  return (
    <Card
      onPress={() => router.push(`/post/${post.id}`)}
      variant={post.type === 'alert' ? 'alert' : isPast ? 'past' : 'default'}
    >
      <View style={styles.topRow}>
        <View style={styles.topLeft}>
          <TypeLabel type={post.type} kind={post.kind} />
          {post.tag ? (
            <Text variant="meta" numberOfLines={1} style={styles.tag}>
              {post.tag}
            </Text>
          ) : null}
        </View>
        <Text variant="meta" numeric>
          {typeof post.distKm === 'number' ? `${fmtKm(post.distKm)} · ` : ''}
          {timeAgo(post.created_at)}
        </Text>
      </View>

      {modBadge ? <Badge label={modBadge.label} tone={modBadge.tone} /> : null}

      <View style={styles.textBlock}>
        <Text variant="cardTitle" numberOfLines={2}>
          {post.title}
        </Text>
        {post.community_name ? (
          <Text variant="meta" numberOfLines={1} style={styles.community}>
            in {post.community_name}
          </Text>
        ) : null}
        {post.body ? (
          <Text variant="bodySm" numberOfLines={2}>
            {post.body}
          </Text>
        ) : null}
      </View>

      {post.image_url ? <Image source={{ uri: post.image_url }} style={styles.image} /> : null}

      <View style={styles.footRow}>
        <VoteButton count={post.upvote_count} mine={post.my_vote} onPress={handleVote} />
        <View style={styles.status}>
          <PostStatusLine post={post} />
        </View>
        <Text variant="meta" numberOfLines={1} style={styles.footArea}>
          {[post.area, post.pincode].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s2 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexShrink: 1, minWidth: 0 },
  tag: { flexShrink: 1 },
  textBlock: { gap: 4 },
  community: { color: colors.accent, fontWeight: '600' },
  image: { width: '100%', height: 184, borderRadius: radius.md, backgroundColor: colors.surface2 },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  status: { flex: 1, minWidth: 0 },
  footArea: { flexShrink: 1, maxWidth: '45%', textAlign: 'right' },
});
