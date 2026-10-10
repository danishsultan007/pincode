import React, { useState } from 'react';
import { TextField } from '@/components/ui/TextField';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { updatePassword } from '@/lib/auth';
import { messageFor } from '@/lib/errors';

// New password + confirm, shared by the reset-password link screen and
// Settings → Change password. Calls onDone after a successful update.
export function NewPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone: () => void }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const valid = password.length >= 8 && password === confirm;

  const submit = async () => {
    if (!valid) return;
    setLoading(true);
    try {
      await updatePassword(password);
      toast.show('Password updated.');
      onDone();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <TextField label="New password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters" />
      <TextField
        label="Confirm new password"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        error={confirm && confirm !== password ? "Passwords don't match" : undefined}
        onSubmitEditing={submit}
      />
      <Button size="lg" label={submitLabel} onPress={submit} loading={loading} disabled={!valid} />
    </>
  );
}
