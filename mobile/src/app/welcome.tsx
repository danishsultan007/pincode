import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Wordmark } from '@/components/ui/Wordmark';
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
        <View style={styles.hero}>
          <Wordmark size="lg" />
        </View>

        <View style={styles.actions}>
          {/* Drawn "G" monogram via Text, per §4 — no vector-icons, no emoji. */}
          <Button
            label={`G   ${copy.auth.continueWithGoogle}`}
            variant="ghost"
            loading={googleLoading}
            onPress={handleGoogle}
          />
          <Button label={copy.auth.continueWithEmail} variant="primary" onPress={() => router.push('/sign-up')} />
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
  wrap: { flex: 1, justifyContent: 'space-between', padding: space.s6 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.s2 },
  actions: { gap: space.s3, marginBottom: space.s5 },
});
