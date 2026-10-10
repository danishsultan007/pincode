import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { signInWithIdentifier } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

export default function SignIn() {
  const router = useRouter();
  const toast = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = !!identifier.trim() && !!password && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await signInWithIdentifier(identifier, password);
      router.replace('/');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll>
      <Header large title="Sign in" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.form}>
        <TextField
          label="Email, username or phone"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoComplete="username"
          placeholder="you@example.com"
          onSubmitEditing={submit}
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          onSubmitEditing={submit}
        />
        <Button size="lg" label="Sign in" onPress={submit} loading={loading} disabled={!canSubmit} />
        <Button label={copy.auth.forgotPassword} variant="text" onPress={() => router.push('/forgot-password')} />
        <Button label="Create an account" variant="text" onPress={() => router.replace('/sign-up')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
