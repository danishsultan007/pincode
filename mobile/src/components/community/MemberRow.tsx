import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { space } from '@/theme/tokens';
import type { CommunityRole } from '@/types/models';

export type MemberRowProps = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: CommunityRole;
  onMore?: () => void;
};

const ROLE_LABEL: Record<CommunityRole, string> = { owner: 'Owner', moderator: 'Moderator', member: 'Member' };

// A member row for the community Members list (MOBILE-PLAN.md §4 Community
// page / members.tsx): avatar, name, role tag, and an optional overflow menu
// for owner/mod actions (Make/Remove moderator, Remove member).
export function MemberRow({ username, displayName, avatarUrl, role, onMore }: MemberRowProps) {
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.identity}
        onPress={() => username && router.push(`/user/${username}`)}
        disabled={!username}
      >
        <Avatar uri={avatarUrl} name={displayName} size={36} />
        <View style={styles.body}>
          <Text variant="body" numberOfLines={1}>
            {displayName}
          </Text>
          {username ? <Text variant="meta">@{username}</Text> : null}
        </View>
      </Pressable>
      {role !== 'member' ? <Badge label={ROLE_LABEL[role]} tone={role === 'owner' ? 'accent' : 'neutral'} /> : null}
      {onMore ? <IconButton name="more" label="More" onPress={onMore} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s3,
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    minHeight: 44,
  },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  body: { flex: 1, gap: 2 },
});
