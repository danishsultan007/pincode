import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { confirmAsync } from '@/lib/confirm';
import { deleteMyAccount } from '@/api/profiles';
import { messageFor } from '@/lib/errors';
import { SUPPORT_EMAIL } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

// Public page (no auth gate): Google Play requires a web URL where people can
// request deletion of their account and data, including without the app.
export default function DeleteAccount() {
  const router = useRouter();
  const toast = useToast();
  const { user, signOut } = useAuth();
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    const ok1 = await confirmAsync(
      copy.settings.deleteAccount,
      'This permanently deletes your account, posts, comments, messages and uploaded photos. This cannot be undone.',
      { destructive: true, confirmLabel: 'Continue' }
    );
    if (!ok1) return;
    const ok2 = await confirmAsync('Are you absolutely sure?', 'This is your final confirmation.', {
      destructive: true,
      confirmLabel: 'Delete forever',
    });
    if (!ok2) return;
    setBusy(true);
    try {
      await deleteMyAccount();
      await signOut();
      router.replace('/welcome');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Header large title="Delete your account" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <Text variant="body">
          Deleting your pincode account permanently removes your profile, posts, comments, reactions, messages you sent,
          and the photos you uploaded. This cannot be undone.
        </Text>
        {user ? (
          <Button label={copy.settings.deleteAccount} variant="danger" loading={busy} onPress={handleDelete} />
        ) : (
          <>
            <Text variant="body">Sign in to delete your account right here.</Text>
            <Button label="Sign in to delete my account" onPress={() => router.push('/sign-in')} />
            <Text variant="body">
              Can't sign in? Email {SUPPORT_EMAIL} from the email address on your account (or tell us your username or
              phone number) and we'll delete it for you.
            </Text>
            <Button
              label={`Email ${SUPPORT_EMAIL}`}
              variant="ghost"
              onPress={() =>
                Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my pincode account')}`)
              }
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.s4, paddingBottom: space.s6, gap: space.s4 },
});
