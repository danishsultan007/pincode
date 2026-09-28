import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useModerationQueue } from '@/hooks/useAdmin';
import { timeAgo } from '@/lib/format';
import { colors, radius, space } from '@/theme/tokens';
import type { ModerationQueueItemRow } from '@/api/admin';
import { goBack } from '@/lib/nav';

const SOURCE_TONE: Record<ModerationQueueItemRow['source'], 'neutral' | 'warn' | 'danger'> = {
  filter: 'warn',
  reports: 'danger',
  admin: 'neutral',
};

// Admin queue (MOBILE-PLAN.md §4 Admin queue, §6 Moderation flow #3).
export default function AdminQueue() {
  const router = useRouter();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const { data, isLoading, isRefetching, refetch } = useModerationQueue(status);

  return (
    <Screen edges={['top']}>
      <Header
        title="Moderation queue"
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
        right={<IconButton name="shield" label="Filter terms" onPress={() => router.push('/admin/filters')} />}
      />
      <View style={styles.segmentWrap}>
        <Segmented
          options={[
            { value: 'open', label: 'Open' },
            { value: 'resolved', label: 'Resolved' },
          ]}
          value={status}
          onChange={(v) => setStatus(v as 'open' | 'resolved')}
          full
        />
      </View>
      {isLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={84} />
          <Skeleton height={84} />
          <Skeleton height={84} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => <QueueRow item={item} onPress={() => router.push(`/admin/item/${item.id}`)} />}
          ListEmptyComponent={
            <EmptyState title={status === 'open' ? 'Nothing to review' : 'No resolved items yet'} />
          }
        />
      )}
    </Screen>
  );
}

function QueueRow({ item, onPress }: { item: ModerationQueueItemRow; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowTop}>
        <Badge label={item.target_type} />
        <Badge label={item.source} tone={SOURCE_TONE[item.source]} />
        {item.report_count > 0 ? (
          <Badge label={`${item.report_count} report${item.report_count === 1 ? '' : 's'}`} tone="danger" />
        ) : null}
      </View>
      {item.excerpt ? (
        <Text variant="bodySm" numberOfLines={2}>
          {item.excerpt}
        </Text>
      ) : null}
      {item.reasons.length ? (
        <View style={styles.rowTop}>
          {item.reasons.map((r) => (
            <Badge key={r} label={r} />
          ))}
        </View>
      ) : null}
      <Text variant="meta">
        {[
          item.target_username ? `@${item.target_username}` : item.target_display_name || null,
          `${timeAgo(item.created_at)} ago`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { paddingHorizontal: space.s4, paddingTop: space.s2 },
  skeletons: { padding: space.s4, gap: space.s3 },
  list: { padding: space.s4, gap: space.s3 },
  row: {
    gap: space.s2,
    padding: space.s3,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTop: { flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' },
});
