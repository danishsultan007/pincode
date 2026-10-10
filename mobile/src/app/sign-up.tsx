import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AvailabilityHint, AvailabilityState } from '@/components/ui/AvailabilityHint';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { signUpWithEmail } from '@/lib/auth';
import { emailAvailable } from '@/api/profiles';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEBOUNCE_MS = 400;

export default function SignUp() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [emailState, setEmailState] = useState<AvailabilityState>('idle');
  const [loading, setLoading] = useState(false);
  const [checkInbox, setCheckInbox] = useState(false);

  useEffect(() => {
    const value = email.trim();
    if (!value) {
      setEmailState('idle');
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setEmailState('invalid');
      return;
    }
    setEmailState('checking');
    const t = setTimeout(async () => {
      try {
        const available = await emailAvailable(value);
        setEmailState(available ? 'ok' : 'taken');
      } catch {
        setEmailState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [email]);

  const canSubmit = emailState === 'ok' && password.length >= 8 && password === confirm;

  const submit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const data = await signUpWithEmail(email.trim(), password);
      if (!data.session) {
        setCheckInbox(true);
      } else {
        router.replace('/');
      }
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLoading(false);
    }
  };

  if (checkInbox) {
    return (
      <Screen>
        <Header
          large
          title="Check your inbox"
          left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
        />
        <View style={styles.form}>
          <Text variant="body">{copy.auth.checkInbox}</Text>
          <Button label="Go to sign in" onPress={() => router.replace('/sign-in')} />
        </View>
      </Screen>
    );
  }

  const emailMessage =
    emailState === 'checking'
      ? copy.onboarding.checking
      : emailState === 'ok'
        ? copy.onboarding.available
        : emailState === 'taken'
          ? copy.onboarding.taken
          : emailState === 'invalid'
            ? 'Enter a valid email address'
            : emailState === 'error'
              ? copy.onboarding.checkFailed
              : '';

  return (
    <Screen scroll>
      <Header
        large
        title="Create account"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
        />
        <AvailabilityHint state={emailState} message={emailMessage} />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          hint="At least 8 characters"
        />
        <TextField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoComplete="new-password"
          error={confirm && confirm !== password ? "Passwords don't match" : undefined}
          onSubmitEditing={submit}
        />
        <Text variant="meta">
          Next you&apos;ll pick a username. You&apos;ll review and accept our Terms and Privacy Policy before you finish.
        </Text>
        <Button size="lg" label="Continue" onPress={submit} loading={loading} disabled={!canSubmit} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
