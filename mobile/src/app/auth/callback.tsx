import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { completeAuthFromUrl } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { messageFor } from '@/lib/errors';
import { colors, space } from '@/theme/tokens';

// Completes OAuth/email links (MOBILE-PLAN.md §4/§5). On web,
// `detectSessionInUrl` on the client already does the code exchange, so we
// just wait for the session. On native, the return trip from the browser is
// also handled by signInWithGoogle's openAuthSessionAsync result, but a
// cold-started deep link (e.g. an email confirmation link opened directly)
// lands here instead, so we also check the initial URL.
export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (Platform.OS !== 'web') {
          const url = await Linking.getInitialURL();
          if (url) await completeAuthFromUrl(url);
        } else {
          for (let i = 0; i < 20; i++) {
            const { data } = await supabase.auth.getSession();
            if (data.session) break;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
        if (!cancelled) router.replace('/');
      } catch (err) {
        if (!cancelled) setError(messageFor(err));
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <View style={styles.wrap}>
      {error ? (
        <Text variant="body" style={styles.center}>
          {error}
        </Text>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: space.s6,
    gap: space.s3,
  },
  center: { textAlign: 'center' },
});
