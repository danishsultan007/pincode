import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { COMMUNITY_CATEGORIES } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { Avatar } from '@/components/ui/Avatar';
import { colors, radius, space } from '@/theme/tokens';
import type { CommunityCard as CommunityCardModel } from '@/types/models';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNITY_CATEGORIES.map((c) => [c.code, c.label])
);

export type CommunityHeaderProps = {
  community: CommunityCardModel;
  onJoin: () => void;
  onLeave: () => void;
  onToggleNotify: () => void;
  joining?: boolean;
  leaving?: boolean;
};

// MOBILE-PLAN.md §4 Community page: name, "category · area", member count,
// Join/Leave, "Notify me about new posts" toggle for members.
export function CommunityHeader({ community, onJoin, onLeave, onToggleNotify, joining, leaving }: CommunityHeaderProps) {
  const isMember = !!community.my_role;
  const isOwner = community.my_role === 'owner';

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Avatar name={community.name} size={64} shape="rounded" />
        <View style={styles.topText}>
          <Text variant="title">{community.name}</Text>
          <Text variant="secondary">
            {[CATEGORY_LABEL[community.category] ?? community.category, community.area].filter(Boolean).join(' · ')}
          </Text>
          <Text variant="meta">{copy.communities.membersCount(community.member_count)}</Text>
        </View>
      </View>
      <View style={styles.row}>
        {isMember ? (
          !isOwner ? <Button label={copy.communities.leave} size="sm" variant="ghost" loading={leaving} onPress={onLeave} /> : null
        ) : (
          <Button label={copy.communities.join} size="sm" loading={joining} onPress={onJoin} />
        )}
        {isMember ? (
          <Pressable
            style={[styles.notifyRow, { backgroundColor: community.my_notify_posts ? colors.accentSoft : colors.surface2 }]}
            onPress={onToggleNotify} hitSlop={8}>
            <Icon name="bell" size={14} color={community.my_notify_posts ? colors.accent : colors.ink3} />
            <Text variant="meta" style={community.my_notify_posts ? styles.notifyOn : undefined}>
              {copy.communities.notifyNewPosts}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.s4, gap: space.s3 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.s4 },
  topText: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, flexWrap: 'wrap' },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: space.s3, borderRadius: radius.pill },
  notifyOn: { color: colors.accent },
});
