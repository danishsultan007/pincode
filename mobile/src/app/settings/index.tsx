import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { ListRow } from '@/components/ui/ListRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Divider } from '@/components/ui/Divider';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { confirmAsync } from '@/lib/confirm';
import { deleteMyAccount } from '@/api/profiles';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

export default function Settings() {
  const router = useRouter();
  const toast = useToast();
  const { me, signOut } = useAuth();

  if (!me) return null;

  const handleSignOut = async () => {
    const ok = await confirmAsync(copy.settings.signOut, 'Are you sure you want to sign out?');
    if (!ok) return;
    await signOut();
    router.replace('/welcome');
  };

  const handleDelete = async () => {
    const ok1 = await confirmAsync(
      copy.settings.deleteAccount,
      'This permanently deletes your account and everything you posted. This cannot be undone.',
      { destructive: true }
    );
    if (!ok1) return;
    const ok2 = await confirmAsync('Are you absolutely sure?', 'This is your final confirmation.', {
      destructive: true,
      confirmLabel: 'Delete forever',
    });
    if (!ok2) return;
    try {
      await deleteMyAccount();
      await signOut();
      router.replace('/welcome');
    } catch (err) {
      toast.show(messageFor(err));
    }
  };

  return (
    <Screen scroll>
      <Header title="Settings" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <SectionTitle title="Account" />
      <ListRow
        title="Username"
        subtitle={me.profile.username ? `@${me.profile.username}` : 'Not set'}
        chevron
        onPress={() => router.push('/settings/username')}
      />
      <ListRow
        title="Phone"
        subtitle={me.private.phone_e164 ?? 'Not set'}
        chevron
        onPress={() => router.push('/settings/phone')}
      />
      <ListRow
        title="Home area"
        subtitle={me.profile.home_area ?? 'Not set'}
        chevron
        onPress={() => router.push('/profile/edit')}
      />
      <Divider />
      <SectionTitle title="Privacy" />
      <ListRow title="Notifications" chevron onPress={() => router.push('/settings/notifications')} />
      <ListRow title={copy.settings.blockedUsers} chevron onPress={() => router.push('/settings/blocked')} />
      <Divider />
      <SectionTitle title="About" />
      <ListRow title={copy.settings.guidelines} chevron onPress={() => router.push('/guidelines')} />
      {me.profile.role === 'admin' ? (
        <>
          <Divider />
          <SectionTitle title="Admin" />
          <ListRow title={copy.settings.admin} chevron onPress={() => router.push('/admin')} />
        </>
      ) : null}
      <Divider />
      <View style={styles.dangerZone}>
        <ListRow title={copy.settings.signOut} onPress={handleSignOut} />
        <ListRow title={copy.settings.deleteAccount} onPress={handleDelete} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dangerZone: { paddingBottom: space.s6 },
});
