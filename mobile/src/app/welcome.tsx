import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Logo } from '@/components/ui/Logo';
import { RadarRings } from '@/components/ui/RadarRings';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { useAuth } from '@/providers/AuthProvider';
import { claimErrorToast, signInWithGoogle } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';

export default function Welcome() {
  const router = useRouter();
  const toast = useToast();
  const { session } = useAuth();
  const [googleLoading, setGoogleLoading] = useState(false);

  // Safety net: if a session appears while we're here (e.g. the OAuth redirect
  // was consumed elsewhere), leave Welcome instead of looking signed out.
  // Only while focused, so it can't race sign-in/callback screens stacked above.
  useFocusEffect(
    useCallback(() => {
      if (session) router.replace('/');
    }, [session, router]),
  );

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      // 'cancelled' (user closed the browser) is silent; on success the session
      // effect above leaves this screen.
      await signInWithGoogle();
    } catch (err) {
      const message = messageFor(err);
      // /auth/callback may already have toasted this same failure.
      if (claimErrorToast(message)) toast.show(message);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.wrap}>
        <View style={styles.hero} accessible accessibilityRole="header" accessibilityLabel={`${copy.wordmark}, ${copy.tagline}`}>
          <RadarRings size={240} pulse>
            <Logo size={64} />
          </RadarRings>
          <View style={styles.heroText}>
            <Text variant="hero">{copy.wordmark}</Text>
            <Text variant="bodyLg">{copy.tagline}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          {/* Drawn "G" monogram via Text, per §4 — no vector-icons, no emoji. */}
          <Button
            label={`G   ${copy.auth.continueWithGoogle}`}
            variant="ghost"
            size="lg"
            loading={googleLoading}
            onPress={handleGoogle}
          />
          <Button label={copy.auth.continueWithEmail} variant="primary" size="lg" onPress={() => router.push('/sign-up')} />
          <Button label="I already have an account" variant="text" onPress={() => router.push('/sign-in')} />
        </View>

        <View style={styles.legalRow}>
          <Button label="Terms" variant="text" size="sm" onPress={() => router.push('/terms')} />
          <Button label="Privacy" variant="text" size="sm" onPress={() => router.push('/privacy')} />
          <Button label="Guidelines" variant="text" size="sm" onPress={() => router.push('/guidelines')} />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.s5, paddingTop: space.s6, paddingBottom: space.s5 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s5 },
  heroText: { alignItems: 'center', gap: space.s1 },
  legalRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap' },
  actions: { gap: space.s3, marginBottom: space.s4, width: '100%', maxWidth: 420, alignSelf: 'center' },
});
