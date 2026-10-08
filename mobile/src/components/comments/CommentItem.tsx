import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Icon } from '@/components/ui/Icon';
import { ReactionBar } from '@/components/post/ReactionBar';
import { timeAgo } from '@/lib/format';
import { copy } from '@/lib/copy';
import { colors, radius, space } from '@/theme/tokens';
import type { ReactionCode } from '@/lib/constants';
import type { CommentCard } from '@/types/models';

const INDENT = 16;

export type CommentItemProps = {
  comment: CommentCard;
  depth: number;
  isPostAuthor: boolean;
  isSolved: boolean;
  canSolve: boolean;
  onReply: () => void;
  onVote: () => void;
  onReact: (code: ReactionCode) => void;
  onSolve: () => void;
  onMore: () => void;
};

// MOBILE-PLAN.md §7.3: indent 16 px per depth level with a 1 px `line` rail.
// Vote label: "Helpful · n" for answers (is_answer), "Upvote · n" otherwise.
export function CommentItem({
  comment,
  depth,
  isPostAuthor,
  isSolved,
  canSolve,
  onReply,
  onVote,
  onReact,
  onSolve,
  onMore,
}: CommentItemProps) {
  const router = useRouter();

  return (
    <View style={[styles.row, { marginLeft: depth * INDENT }]}>
      {depth > 0 ? <View style={styles.rail} /> : null}
      <View style={styles.body}>
        <View style={styles.header}>
          <Pressable
            style={styles.authorRow}
            onPress={() => comment.author_username && router.push(`/user/${comment.author_username}`)}
          >
            <Avatar uri={comment.author_avatar_url} name={comment.author_display_name} size={24} />
            <Text variant="secondary" style={{ color: colors.ink, fontWeight: '600' }}>{comment.author_display_name}</Text>
          </Pressable>
          {isPostAuthor ? <Badge label="OP" /> : null}
          <Text variant="meta">· {timeAgo(comment.created_at)}</Text>
          {isSolved ? <Badge label="Solved" tone="accent" /> : null}
        </View>

        <Text variant="body" style={comment.is_deleted ? { color: colors.ink3, fontStyle: 'italic' } : undefined}>
          {comment.is_deleted ? copy.post.deletedComment : comment.body}
        </Text>

        {!comment.is_deleted ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: comment.my_vote }}
              onPress={onVote}
              hitSlop={6}
              style={[styles.voteChip, comment.my_vote ? styles.voteChipActive : styles.voteChipIdle]}
            >
              <Icon name="arrow-up" size={14} color={comment.my_vote ? colors.accent : colors.ink2} />
              <Text
                variant="secondary"
                numeric
                style={{ color: comment.my_vote ? colors.accent : colors.ink2, fontWeight: '600' }}
              >
                {comment.is_answer ? copy.post.helpful(comment.upvote_count) : copy.post.upvote(comment.upvote_count)}
              </Text>
            </Pressable>
            <ReactionBar counts={comment.reaction_counts} mine={comment.my_reactions} onToggle={onReact} />
            <Button label={copy.post.reply} size="sm" variant="text" onPress={onReply} />
            {canSolve ? (
              <Button
                label={isSolved ? copy.post.unmarkSolved : copy.post.markSolvedAction}
                size="sm"
                variant="text"
                onPress={onSolve}
              />
            ) : null}
            <IconButton name="more" label="More" onPress={onMore} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.s2, paddingVertical: space.s3 },
  rail: { width: 2, borderRadius: 1, backgroundColor: colors.line, marginRight: space.s2 },
  body: { flex: 1, gap: space.s1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.s1, flexWrap: 'wrap' },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: space.s1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.s2, flexWrap: 'wrap' },
  voteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: space.s2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  voteChipIdle: { backgroundColor: colors.surface2, borderColor: 'transparent' },
  voteChipActive: { backgroundColor: colors.accentSoft, borderColor: 'transparent' },
});
