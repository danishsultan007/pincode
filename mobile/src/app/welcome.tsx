import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Logo } from '@/components/ui/Logo';
import { RadarRings } from '@/components/ui/RadarRings';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { signInWithGoogle } from '@/lib/auth';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';

export default function Welcome() {
  const router = useRouter();
  const toast = useToast();
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogle = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      toast.show(messageFor(err));
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

        <Button
          label={copy.auth.guidelinesLink}
          variant="text"
          size="sm"
          onPress={() => router.push('/guidelines')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'space-between', paddingHorizontal: space.s5, paddingTop: space.s6, paddingBottom: space.s5 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s5 },
  heroText: { alignItems: 'center', gap: space.s1 },
  actions: { gap: space.s3, marginBottom: space.s4, width: '100%', maxWidth: 420, alignSelf: 'center' },
});
