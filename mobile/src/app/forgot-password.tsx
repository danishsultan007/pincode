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
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email || loading) return;
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
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
        title="Forgot password"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.form}>
        {sent ? (
          <Text variant="body">Check your inbox for a reset link.</Text>
        ) : (
          <>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              onSubmitEditing={submit}
            />
            <Button label="Send reset link" onPress={submit} loading={loading} disabled={!email} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { padding: space.s4, gap: space.s3 },
});
