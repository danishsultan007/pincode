import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { sendPasswordReset } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

export default function ForgotPassword() {
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (identifier.trim().length < 3 || loading) return;
    setLoading(true);
    try {
      await sendPasswordReset(identifier);
      setSent(true);
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Header
        large
        title="Forgot password"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.form}>
        {sent ? (
          <Text variant="body">If an account matches, we've sent a password reset link to its email address. Check your inbox (and spam).</Text>
        ) : (
          <>
            <TextField
              label="Email, username or phone"
              placeholder="you@example.com"
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              onSubmitEditing={submit}
            />
            <Button size="lg" label="Send reset link" onPress={submit} loading={loading} disabled={identifier.trim().length < 3} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
