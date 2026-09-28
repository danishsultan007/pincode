import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { COMMUNITY_CATEGORIES } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { colors, space } from '@/theme/tokens';
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
      <Text variant="title">{community.name}</Text>
      <Text variant="secondary">
        {[CATEGORY_LABEL[community.category] ?? community.category, community.area].filter(Boolean).join(' · ')}
      </Text>
      <Text variant="meta">{copy.communities.membersCount(community.member_count)}</Text>
      <View style={styles.row}>
        {isMember ? (
          !isOwner ? <Button label={copy.communities.leave} size="sm" variant="ghost" loading={leaving} onPress={onLeave} /> : null
        ) : (
          <Button label={copy.communities.join} size="sm" loading={joining} onPress={onJoin} />
        )}
        {isMember ? (
          <Pressable style={styles.notifyRow} onPress={onToggleNotify} hitSlop={8}>
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
  wrap: { padding: space.s4, gap: space.s1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s2, flexWrap: 'wrap' },
  notifyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notifyOn: { color: colors.accent },
});
