import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBlockedUsers, useUnblockUser } from '@/hooks/useProfile';
import { useToast } from '@/providers/ToastProvider';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

export default function BlockedUsers() {
  const toast = useToast();
  const { data, isLoading } = useBlockedUsers();
  const unblock = useUnblockUser();

  const handleUnblock = async (id: string) => {
    try {
      await unblock.mutateAsync(id);
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  return (
    <Screen scroll>
      <Header
        title={copy.settings.blockedUsers}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      {!isLoading && (!data || data.length === 0) ? (
        <EmptyState title="No blocked users" text="Accounts you block will show up here." />
      ) : (
        <View style={styles.list}>
          {(data ?? []).map((u) => (
            <ListRow
              key={u.id}
              left={<Avatar uri={u.avatar_url} name={u.display_name || u.username || '?'} />}
              title={u.display_name || u.username || 'User'}
              subtitle={u.username ? `@${u.username}` : undefined}
              right={<Button label={copy.profile.unblock} size="sm" variant="ghost" onPress={() => handleUnblock(u.id)} />}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: space.s6 },
});
