import React, { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Badge } from '@/components/ui/Badge';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Divider } from '@/components/ui/Divider';
import { useToast } from '@/providers/ToastProvider';
import { useQueueItem, useReportsForTarget, useTargetContent, useStrikes, useResolveItem } from '@/hooks/useAdmin';
import { countRecentStrikes, nextStrikeAction, STRIKE_ACTION_LABEL } from '@/api/admin';
import { REPORT_CATEGORIES } from '@/lib/constants';
import type { ReportCategory } from '@/lib/constants';
import { messageFor } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { colors, space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

// Admin item — decide (MOBILE-PLAN.md §4 Admin item, §6 Moderation flow #3).
// Restore/Dismiss/Remove/Remove+strike via admin_resolve_item; the strike
// ladder preview mirrors admin_issue_strike's own counting exactly.
export default function AdminItem() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const { data: item, isLoading } = useQueueItem(id);
  const { data: reports } = useReportsForTarget(item?.target_type, item?.target_id);
  const { data: content } = useTargetContent(item?.target_type, item?.target_id);
  const { data: strikes } = useStrikes(item?.target_user_id);
  const resolveMutation = useResolveItem();

  const [reason, setReason] = useState('');
  const [category, setCategory] = useState<ReportCategory>('other');
  const [severe, setSevere] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading || !item) {
    return (
      <Screen edges={['top']}>
        <Header left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      </Screen>
    );
  }

  const recentCount = countRecentStrikes(strikes ?? []);
  const predictedAction = nextStrikeAction(recentCount, severe);
  const isOpen = item.status === 'open';

  const decide = async (decision: 'restore' | 'remove' | 'dismiss', withStrike: boolean) => {
    setBusy(decision + (withStrike ? '-strike' : ''));
    try {
      await resolveMutation.mutateAsync({
        itemId: item.id,
        decision,
        userId: item.target_user_id,
        strike: withStrike,
        reason: reason.trim() || null,
        category,
        severe,
      });
      toast.show('Done.');
      goBack();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(null);
    }
  };

  const excerpt =
    content?.kind === 'post'
      ? [content.post.title, content.post.body].filter(Boolean).join('\n\n')
      : content?.kind === 'comment'
        ? content.comment.body
        : content?.kind === 'message'
          ? content.message.body
          : (item.excerpt ?? '');

  return (
    <Screen scroll edges={['top']}>
      <Header title="Review item" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Badge label={item.target_type} />
          <Text variant="meta">
            {item.source} · {timeAgo(item.created_at)} ago
          </Text>
        </View>

        {item.target_user_id ? (
          <Button
            label={item.target_username ? `Open @${item.target_username}` : 'Open author'}
            variant="ghost"
            size="sm"
            onPress={() => router.push(`/admin/user/${item.target_user_id}`)}
          />
        ) : null}

        <SectionTitle title="Content" />
        <Text variant="body">{excerpt || 'Not available.'}</Text>

        {item.reasons.length ? (
          <>
            <SectionTitle title="Filter reasons" />
            <ChipRow>
              {item.reasons.map((r) => (
                <Chip key={r} label={r} />
              ))}
            </ChipRow>
          </>
        ) : null}

        {reports?.length ? (
          <>
            <SectionTitle title={`Reports (${reports.length})`} />
            {reports.map((r) => (
              <View key={r.id} style={styles.reportRow}>
                <Text variant="bodySm">
                  {r.reporter_username ? `@${r.reporter_username}` : r.reporter_display_name || 'Someone'} · {r.category}
                </Text>
                {r.details ? <Text variant="meta">{r.details}</Text> : null}
              </View>
            ))}
          </>
        ) : null}

        {!isOpen ? (
          <>
            <Divider />
            <Text variant="body">
              Resolved: {item.resolution} · {item.resolved_at ? `${timeAgo(item.resolved_at)} ago` : ''}
            </Text>
          </>
        ) : (
          <>
            <Divider />
            <SectionTitle title="Decision" />
            <TextField
              label="Reason"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              placeholder="Shown to the user"
            />
            <ChipRow>
              {REPORT_CATEGORIES.map((c) => (
                <Chip key={c.code} label={c.label} selected={category === c.code} onPress={() => setCategory(c.code)} />
              ))}
            </ChipRow>
            <View style={styles.switchRow}>
              <Text variant="body">Severe: permanent ban</Text>
              <Switch value={severe} onValueChange={setSevere} />
            </View>
            <Text variant="meta">
              This will be strike {recentCount + 1} → {STRIKE_ACTION_LABEL[predictedAction]}
            </Text>

            <View style={styles.actions}>
              <Button label="Restore" variant="ghost" onPress={() => decide('restore', false)} loading={busy === 'restore'} />
              <Button label="Dismiss" variant="ghost" onPress={() => decide('dismiss', false)} loading={busy === 'dismiss'} />
              <Button label="Remove" variant="danger" onPress={() => decide('remove', false)} loading={busy === 'remove'} />
              <Button
                label="Remove + strike"
                variant="danger"
                onPress={() => decide('remove', true)}
                loading={busy === 'remove-strike'}
              />
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: space.s4, gap: space.s3, paddingBottom: space.s6 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reportRow: {
    gap: 2,
    paddingVertical: space.s1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, paddingTop: space.s2 },
});
