import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { NewPasswordForm } from '@/components/auth/NewPasswordForm';
import { supabase } from '@/lib/supabase';
import { messageFor } from '@/lib/errors';
import { colors, space } from '@/theme/tokens';

// Landing page for the "Forgot password?" email link (sendPasswordReset
// redirects here). The link carries a one-time ?code=… that must be exchanged
// for a session before the password can be changed:
//   - web: supabase-js does it automatically (detectSessionInUrl), we wait for it
//   - native: we exchange it ourselves. Always exchange, even if someone is
//     already signed in on this device, so the reset applies to the account
//     the email was sent to.
export default function ResetPassword() {
  const router = useRouter();
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [status, setStatus] = useState<'checking' | 'ready' | 'failed'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const done = (s: 'ready' | 'failed', msg?: string) => {
      if (cancelled) return;
      setStatus(s);
      if (msg) setError(msg);
    };

    async function run() {
      if (error_description) return done('failed', String(error_description));
      try {
        if (Platform.OS !== 'web' && typeof code === 'string' && code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          return done('ready');
        }
        // Web (or no code): wait briefly for the session supabase-js sets up from the URL.
        for (let i = 0; i < 20; i++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) return done('ready');
          await new Promise((r) => setTimeout(r, 250));
        }
        done('failed', 'This reset link is invalid or has expired.');
      } catch (err) {
        done('failed', messageFor(err));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [code, error_description]);

  return (
    <Screen scroll>
      <Header large title="Set a new password" />
      <View style={styles.form}>
        {status === 'checking' ? (
          <ActivityIndicator color={colors.accent} />
        ) : status === 'failed' ? (
          <>
            <Text variant="body">{error ?? 'This reset link is invalid or has expired.'}</Text>
            <Text variant="secondary">Reset links work once and expire after a while. Request a new one.</Text>
            <Button label="Send a new link" onPress={() => router.replace('/forgot-password')} />
          </>
        ) : (
          <>
            <Text variant="secondary">Choose a new password for your account.</Text>
            <NewPasswordForm submitLabel="Update password" onDone={() => router.replace('/')} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.s4, paddingTop: space.s3, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
