import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { COMMUNITY_CATEGORIES } from '@/lib/constants';
import { fmtKm } from '@/lib/format';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import type { CommunityCard as CommunityCardModel } from '@/types/models';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNITY_CATEGORIES.map((c) => [c.code, c.label])
);

export type CommunityCardProps = {
  community: CommunityCardModel & { distKm?: number };
  onJoin?: () => void;
  onLeave?: () => void;
  joining?: boolean;
  leaving?: boolean;
};

// List/search row for a community (MOBILE-PLAN.md §4 Communities tab):
// name, "Parents · Hoodi · 1.2 km", "124 members", Join button. Shared with
// the P7 search "Communities" tab results.
export function CommunityCard({ community, onJoin, onLeave, joining, leaving }: CommunityCardProps) {
  const router = useRouter();
  const isMember = !!community.my_role;
  const isOwner = community.my_role === 'owner';

  const meta = [
    CATEGORY_LABEL[community.category] ?? community.category,
    community.area,
    typeof community.distKm === 'number' ? fmtKm(community.distKm) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card onPress={() => router.push(`/community/${community.slug}`)}>
      <View style={styles.row}>
        <Avatar name={community.name} size={48} shape="rounded" />
        <View style={styles.body}>
          <Text variant="cardTitle" numberOfLines={1}>
            {community.name}
          </Text>
          {meta ? (
            <Text variant="meta" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
          <Text variant="meta">{copy.communities.membersCount(community.member_count)}</Text>
        </View>
        {!isMember && onJoin ? (
          <Button label={copy.communities.join} size="sm" variant="ghost" loading={joining} onPress={onJoin} />
        ) : null}
        {isMember && !isOwner && onLeave ? (
          <Button label={copy.communities.leave} size="sm" variant="text" loading={leaving} onPress={onLeave} />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  body: { flex: 1, gap: 2 },
});
