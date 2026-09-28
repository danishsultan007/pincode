import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/ui/Icon';
import { Text } from '@/components/ui/Text';
import { colors, space } from '@/theme/tokens';
import { fmtTime, fmtWhen, relAge } from '@/lib/format';
import { copy } from '@/lib/copy';
import type { PostCard } from '@/types/models';

export type PostStatusLineProps = { post: PostCard };

// PostStatusLine rules per MOBILE-PLAN.md §7.3 (D5).
export function PostStatusLine({ post }: PostStatusLineProps) {
  if (post.type === 'event') {
    if (!post.starts_at) return null;
    return (
      <Text variant="secondary" style={styles.neutral}>
        {fmtWhen(post.starts_at)}
      </Text>
    );
  }

  if (post.type === 'alert') {
    if (post.still_on_count > 0) {
      return (
        <Text variant="secondary" style={styles.neutral}>
          {copy.post.stillOnConfirmed(post.still_on_count, post.last_confirmed_at ? `${relAge(post.last_confirmed_at)} ago` : '')}
        </Text>
      );
    }
    return (
      <Text variant="secondary" style={styles.neutral}>
        {copy.post.until(fmtTime(post.expires_at))}
      </Text>
    );
  }

  // type === 'ask'
  if (post.solved_comment_id && post.first_answer_at) {
    const mins = Math.max(1, Math.round((new Date(post.solved_at ?? post.first_answer_at).getTime() - new Date(post.created_at).getTime()) / 60000));
    return (
      <View style={styles.row}>
        <Icon name="check" size={14} color={colors.accent} />
        <Text variant="secondary" style={styles.accent}>
          {copy.post.answeredIn(mins)}
        </Text>
      </View>
    );
  }
  if (post.answer_count > 0) {
    return (
      <Text variant="secondary" style={styles.neutral}>
        {copy.post.answersCount(post.answer_count)}
      </Text>
    );
  }
  if (post.kind === 'request') {
    return (
      <Text variant="secondary" style={styles.accent}>
        {copy.post.noAnswersYet}
      </Text>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s1 },
  neutral: {},
  accent: { color: colors.accent },
});
