import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AvailabilityHint, AvailabilityState } from '@/components/ui/AvailabilityHint';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { changeUsername, usernameAvailable } from '@/api/profiles';
import { isReservedUsername, isValidUsername } from '@/lib/username';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

const DEBOUNCE_MS = 400;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default function ChangeUsername() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { me, refreshMe } = useAuth();
  const [username, setUsername] = useState('');
  const [state, setState] = useState<AvailabilityState>('idle');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const value = username.trim();
    if (!value) {
      setState('idle');
      return;
    }
    if (!isValidUsername(value)) {
      setState('invalid');
      return;
    }
    if (isReservedUsername(value)) {
      setState('reserved');
      return;
    }
    setState('checking');
    const t = setTimeout(async () => {
      try {
        const available = await usernameAvailable(value);
        setState(available ? 'ok' : 'taken');
      } catch {
        setState('error');
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [username]);

  if (!me) return null;

  const last = me.profile.username_changed_at ? new Date(me.profile.username_changed_at) : null;
  const canChangeAt = last ? new Date(last.getTime() + THIRTY_DAYS_MS) : null;
  const locked = !!canChangeAt && canChangeAt > new Date();

  const save = async () => {
    setSaving(true);
    try {
      await changeUsername(username.trim());
      await refreshMe();
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.show('Username updated.');
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
          : state === 'reserved'
          ? copy.onboarding.reserved
          : state === 'invalid'
            ? copy.onboarding.usernameHint
            : state === 'error'
              ? copy.onboarding.checkFailed
              : '';

  return (
    <Screen scroll>
      <Header
        large
        title="Change username"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.body}>
        <Text variant="secondary">Current: @{me.profile.username}</Text>
        {locked ? (
          <Text variant="body">You can change your username again on {canChangeAt!.toLocaleDateString()}.</Text>
        ) : (
          <>
            <TextField
              label="New username"
              value={username}
              onChangeText={(v) => setUsername(v.replace(/\s/g, ''))}
              autoCapitalize="none"
              maxLength={20}
            />
            <AvailabilityHint state={state} message={message} />
            <Button label={copy.common.save} onPress={save} loading={saving} disabled={state !== 'ok'} />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3 },
});
