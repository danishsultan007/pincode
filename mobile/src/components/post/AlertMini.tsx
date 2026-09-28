import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { colors, radius, space } from '@/theme/tokens';
import { fmtKm, timeAgo } from '@/lib/format';
import type { PostCard } from '@/types/models';

export type AlertMiniProps = { post: PostCard };

// 220px compact alert card for the AlertsStrip (MOBILE-PLAN.md §7.3).
export function AlertMini({ post }: AlertMiniProps) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/post/${post.id}`)} style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.dot} />
        <Text variant="label" style={{ color: colors.alert }}>
          ALERT
        </Text>
        <Text variant="meta">
          {typeof post.distKm === 'number' ? `${fmtKm(post.distKm)} · ` : ''}
          {timeAgo(post.created_at)}
        </Text>
      </View>
      <Text variant="body" numberOfLines={2}>
        {post.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 220,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderLeftWidth: 2,
    borderColor: colors.line,
    borderLeftColor: colors.alert,
    padding: space.s3,
    gap: space.s1,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.alert },
});
