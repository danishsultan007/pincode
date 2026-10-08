import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { TermsConsent } from '@/components/legal/TermsConsent';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { acceptTerms } from '@/api/profiles';
import { TERMS_VERSION } from '@/lib/legal';
import { messageFor } from '@/lib/errors';
import { space } from '@/theme/tokens';

// Gate for signed-in users who haven't accepted the current TERMS_VERSION
// (accounts created before terms existed, and any later version bump).
export default function AcceptTerms() {
  const router = useRouter();
  const toast = useToast();
  const { session, me, refreshMe, signOut } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!session) return <Redirect href="/welcome" />;
  if (me?.private.terms_version === TERMS_VERSION) return <Redirect href="/" />;

  const accept = async () => {
    setBusy(true);
    try {
      await acceptTerms(TERMS_VERSION);
      await refreshMe();
      router.replace('/');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Header large title="Before you continue" />
      <View style={styles.body}>
        <Text variant="body">
          We&apos;ve added Terms of Service and a Privacy Policy. Please read and accept them to keep using pincode.
        </Text>
        <TermsConsent checked={agreed} onChange={setAgreed} />
        <Button size="lg" label="Accept and continue" onPress={accept} loading={busy} disabled={!agreed} />
        <Button
          label="Sign out"
          variant="text"
          onPress={async () => {
            await signOut();
            router.replace('/welcome');
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.s4, paddingBottom: space.s6, gap: space.s4, width: '100%', maxWidth: 480, alignSelf: 'center' },
});
