import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { updateNotificationPrefs } from '@/api/profiles';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { colors, space } from '@/theme/tokens';
import type { NotificationPrefs } from '@/types/models';
import { goBack } from '@/lib/nav';

const ROWS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'replies', label: 'Replies to my comments' },
  { key: 'answers', label: 'Answers to my asks' },
  { key: 'votes', label: 'Upvotes' },
  { key: 'alerts', label: 'Nearby alerts' },
  { key: 'messages', label: 'Messages' },
  { key: 'communities', label: 'Community activity' },
];

// The switches copy your saved preferences when the form first appears, so it must wait for the
// profile to load (on a cold-start deep link it is not loaded yet, which left this page blank).
export default function NotificationSettings() {
  const { me } = useAuth();
  if (!me) return null;
  return <NotificationSettingsForm />;
}

function NotificationSettingsForm() {
  const toast = useToast();
  const { me, user, refreshMe } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(me?.private.notification_prefs ?? null);
  const [saving, setSaving] = useState<string | null>(null);

  if (!me || !prefs || !user) return null;

  const toggle = async (key: keyof NotificationPrefs, value: boolean) => {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(key);
    try {
      await updateNotificationPrefs(user.id, next);
      await refreshMe();
    } catch (err) {
      setPrefs(previous);
      toast.show(messageFor(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen scroll>
      <Header
        large
        title="Notifications"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.body}>
        {ROWS.map((row) => (
          <View key={row.key} style={styles.row}>
            <Text variant="body">{row.label}</Text>
            <Switch
              value={prefs[row.key]}
              onValueChange={(v) => toggle(row.key, v)}
              disabled={saving === row.key}
              trackColor={{ true: colors.accent, false: colors.line }}
            />
          </View>
        ))}
        <Text variant="meta" style={styles.note}>
          {copy.settings.safetyNote}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  note: { marginTop: space.s3 },
});
