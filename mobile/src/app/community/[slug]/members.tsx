import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { MemberRow } from '@/components/community/MemberRow';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import {
  useCommunity,
  useCommunityMembers,
  useRemoveCommunityMember,
  useSetCommunityRole,
} from '@/hooks/useCommunities';
import { actionSheet, confirmAsync } from '@/lib/confirm';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import type { CommunityMemberRow } from '@/types/models';
import { goBack } from '@/lib/nav';

// Full member list with owner/mod management (MOBILE-PLAN.md §4 Community
// page "Members": owner sees Make/Remove moderator, mods see Remove member
// with an optional ban). Reached from the community page's Members segment.
export default function CommunityMembers() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const toast = useToast();
  const { user } = useAuth();

  const { data: community } = useCommunity(slug);
  const { data: members, refetch, isRefetching } = useCommunityMembers(community?.id);

  const setRoleMutation = useSetCommunityRole(community?.id ?? '');
  const removeMutation = useRemoveCommunityMember(community?.id ?? '');

  if (!community) return null;

  const myRole = community.my_role;
  const isOwner = myRole === 'owner';
  const isMod = isOwner || myRole === 'moderator';

  const handleMakeModerator = (m: CommunityMemberRow) => {
    setRoleMutation.mutate(
      { userId: m.user_id, role: 'moderator' },
      { onError: (err) => toast.show(messageFor(err)) }
    );
  };

  const handleRemoveModerator = (m: CommunityMemberRow) => {
    setRoleMutation.mutate(
      { userId: m.user_id, role: 'member' },
      { onError: (err) => toast.show(messageFor(err)) }
    );
  };

  const handleRemoveMember = async (m: CommunityMemberRow, ban: boolean) => {
    const ok = await confirmAsync(copy.communities.removeMember, ban ? copy.communities.banMember : undefined, {
      confirmLabel: copy.communities.removeMember,
      destructive: true,
    });
    if (!ok) return;
    removeMutation.mutate(
      { userId: m.user_id, reason: null, ban },
      {
        onSuccess: () => toast.show(copy.communities.removedFromCommunity),
        onError: (err) => toast.show(messageFor(err)),
      }
    );
  };

  const openMenu = (m: CommunityMemberRow) => {
    if (m.role === 'owner') return;
    const options: { label: string; destructive?: boolean; onPress: () => void }[] = [];
    if (isOwner) {
      if (m.role === 'moderator') {
        options.push({ label: copy.communities.removeModerator, onPress: () => handleRemoveModerator(m) });
      } else {
        options.push({ label: copy.communities.makeModerator, onPress: () => handleMakeModerator(m) });
      }
    }
    if (isMod) {
      options.push({ label: copy.communities.removeMember, destructive: true, onPress: () => handleRemoveMember(m, true) });
    }
    if (!options.length) return;
    actionSheet(m.display_name, options);
  };

  return (
    <Screen edges={['top']}>
      <Header
        title={copy.communities.manageMembers}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <FlatList
        data={members ?? []}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={styles.content}
        refreshing={isRefetching}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <MemberRow
            userId={item.user_id}
            username={item.username}
            displayName={item.display_name}
            avatarUrl={item.avatar_url}
            role={item.role}
            onMore={isMod && item.user_id !== user?.id && item.role !== 'owner' ? () => openMenu(item) : undefined}
          />
        )}
        ListEmptyComponent={<EmptyState title="No members yet" />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.s6 },
});
