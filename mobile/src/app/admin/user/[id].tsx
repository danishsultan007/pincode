import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Divider } from '@/components/ui/Divider';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/providers/ToastProvider';
import { useAdminProfile, useStrikes, useModerationActions, useLiftBan, useIssueStrike } from '@/hooks/useAdmin';
import { STRIKE_ACTION_LABEL } from '@/api/admin';
import { REPORT_CATEGORIES } from '@/lib/constants';
import type { ReportCategory } from '@/lib/constants';
import { messageFor } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { colors, space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

// Admin user — standing (MOBILE-PLAN.md §4 Admin user, §6 Moderation flow).
export default function AdminUser() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const toast = useToast();

  const { data: profile, isLoading } = useAdminProfile(id);
  const { data: strikes } = useStrikes(id);
  const { data: actions } = useModerationActions(id);
  const liftBan = useLiftBan();
  const issueStrike = useIssueStrike();

  const [liftBusy, setLiftBusy] = useState(false);
  const [strikeReason, setStrikeReason] = useState('');
  const [strikeCategory, setStrikeCategory] = useState<ReportCategory>('other');
  const [strikeSevere, setStrikeSevere] = useState(false);
  const [strikeBusy, setStrikeBusy] = useState(false);

  if (isLoading || !profile) {
    return (
      <Screen edges={['top']}>
        <Header left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      </Screen>
    );
  }

  const isBanned = !!profile.banned_until && new Date(profile.banned_until) > new Date();
  const inTrouble = profile.ban_permanent || isBanned;
  const status = profile.ban_permanent
    ? 'Permanently banned'
    : isBanned
      ? `Suspended until ${new Date(profile.banned_until as string).toLocaleString()}`
      : 'Active';

  const handleLiftBan = async () => {
    setLiftBusy(true);
    try {
      await liftBan.mutateAsync({ userId: id as string });
      toast.show('Ban lifted.');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setLiftBusy(false);
    }
  };

  const handleIssueStrike = async () => {
    if (!strikeReason.trim()) return;
    setStrikeBusy(true);
    try {
      await issueStrike.mutateAsync({
        userId: id as string,
        reason: strikeReason.trim(),
        category: strikeCategory,
        severe: strikeSevere,
      });
      setStrikeReason('');
      setStrikeSevere(false);
      toast.show('Strike issued.');
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setStrikeBusy(false);
    }
  };

  return (
    <Screen scroll edges={['top']}>
      <Header
        title={profile.username ? `@${profile.username}` : profile.display_name}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
      />
      <View style={styles.body}>
        <Badge label={status} tone={inTrouble ? 'danger' : 'accent'} />
        <Text variant="secondary">
          {profile.strike_count} strike{profile.strike_count === 1 ? '' : 's'} total
        </Text>

        {inTrouble ? <Button label="Lift ban" onPress={handleLiftBan} loading={liftBusy} /> : null}

        <Divider />
        <SectionTitle title="Issue strike" />
        <TextField label="Reason" value={strikeReason} onChangeText={setStrikeReason} multiline maxLength={500} />
        <ChipRow>
          {REPORT_CATEGORIES.map((c) => (
            <Chip key={c.code} label={c.label} selected={strikeCategory === c.code} onPress={() => setStrikeCategory(c.code)} />
          ))}
        </ChipRow>
        <View style={styles.switchRow}>
          <Text variant="body">Severe: permanent ban</Text>
          <Switch value={strikeSevere} onValueChange={setStrikeSevere} />
        </View>
        <Button label="Issue strike" variant="danger" onPress={handleIssueStrike} loading={strikeBusy} disabled={!strikeReason.trim()} />

        <Divider />
        <SectionTitle title="Strike history" />
        {(strikes ?? []).length ? (
          (strikes ?? []).map((s) => (
            <View key={s.id} style={styles.row}>
              <Text variant="body">
                {STRIKE_ACTION_LABEL[s.action]} · {s.category}
              </Text>
              <Text variant="bodySm">{s.reason}</Text>
              <Text variant="meta">
                {timeAgo(s.created_at)} ago{s.severe ? ' · severe' : ''}
              </Text>
            </View>
          ))
        ) : (
          <EmptyState title="No strikes" />
        )}

        <Divider />
        <SectionTitle title="Moderation actions" />
        {(actions ?? []).length ? (
          (actions ?? []).map((a) => (
            <View key={a.id} style={styles.row}>
              <Text variant="body">{a.action}</Text>
              {a.note ? <Text variant="bodySm">{a.note}</Text> : null}
              <Text variant="meta">{timeAgo(a.created_at)} ago</Text>
            </View>
          ))
        ) : (
          <EmptyState title="No actions yet" />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3, paddingBottom: space.s6 },
  row: { gap: 2, paddingVertical: space.s2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
