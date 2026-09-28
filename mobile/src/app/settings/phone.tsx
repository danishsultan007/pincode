import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AvailabilityHint, AvailabilityState } from '@/components/ui/AvailabilityHint';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { phoneAvailable, updatePhone } from '@/api/profiles';
import { normalizeIndianPhone } from '@/lib/phone';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

const DEBOUNCE_MS = 400;

export default function ChangePhone() {
  const toast = useToast();
  const { me, refreshMe } = useAuth();
  const [digits, setDigits] = useState('');
  const [state, setState] = useState<AvailabilityState>('idle');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (digits.length !== 10) {
      setState('idle');
      return;
    }
    const normalized = normalizeIndianPhone(digits);
    if (!normalized) {
      setState('invalid');
      return;
    }
    setState('checking');
    const t = setTimeout(async () => {
      try {
        const available = await phoneAvailable(normalized);
        setState(available ? 'ok' : 'taken');
      } catch {
        setState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [digits]);

  if (!me) return null;

  const save = async () => {
    setSaving(true);
    try {
      await updatePhone(digits);
      await refreshMe();
      toast.show('Phone number updated.');
      goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setSaving(false);
    }
  };

  const message =
    state === 'checking'
      ? copy.onboarding.checking
      : state === 'ok'
        ? copy.onboarding.available
        : state === 'taken'
          ? copy.onboarding.taken
          : state === 'invalid'
            ? 'Enter a valid 10-digit mobile number'
            : state === 'error'
              ? copy.onboarding.checkFailed
              : '';

  return (
    <Screen scroll>
      <Header title="Change phone" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <Text variant="secondary">Current: {me.private.phone_e164 ?? 'Not set'}</Text>
        <TextField
          label="Phone number"
          value={digits}
          onChangeText={(v) => setDigits(v.replace(/\D/g, '').slice(0, 10))}
          prefix="+91"
          keyboardType="number-pad"
          maxLength={10}
        />
        <AvailabilityHint state={state} message={message} />
        <Text variant="meta">{copy.onboarding.phoneNote}</Text>
        <Button label={copy.common.save} onPress={save} loading={saving} disabled={state !== 'ok'} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
});
