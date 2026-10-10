import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { useAuth } from '@/providers/AuthProvider';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

// Settings → Change password (or "Set a password" for Google-only accounts,
// which then can also sign in with email + password).
export default function ChangePassword() {
  const { user } = useAuth();
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [];
  const hasPassword = providers.includes('email');

  return (
    <Screen scroll>
      <Header
        large
        title={hasPassword ? copy.settings.changePassword : copy.settings.setPassword}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.form}>
        <Text variant="secondary">
          {hasPassword
            ? 'Choose a new password. You stay signed in on this device.'
            : `You signed up with Google. Set a password to also sign in with ${user?.email ?? 'your email'}.`}
        </Text>
        <NewPasswordForm submitLabel={hasPassword ? 'Change password' : 'Set password'} onDone={() => goBack()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
