import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { updatePassword } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { messageFor } from '@/lib/errors';
import { space } from '@/theme/tokens';

// Reached after the recovery email's link (via auth/callback), which fires
// an onAuthStateChange('PASSWORD_RECOVERY') event (MOBILE-PLAN.md §5.3).
export default function ResetPassword() {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async () => {
    setLoading(true);
    try {
      await updatePassword(password);
      toast.show('Password updated.');
      router.replace('/');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Header large title="Reset password" />
      <View style={styles.form}>
        {!ready ? (
          <Text variant="secondary">Open the reset link from your email to continue.</Text>
        ) : (
          <>
            <TextField
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              hint="At least 8 characters"
            />
            <TextField
              label="Confirm password"
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              error={confirm && confirm !== password ? "Passwords don't match" : undefined}
            />
            <Button
              size="lg"
              label="Update password"
              onPress={submit}
              loading={loading}
              disabled={password.length < 8 || password !== confirm}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
