import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/providers/ToastProvider';
import { listFeedback, setFeedbackStatus, type FeedbackRow, type FeedbackStatus } from '@/api/feedback';
import { messageFor } from '@/lib/errors';
import { timeAgo } from '@/lib/format';
import { colors, radius, space } from '@/theme/tokens';
import { goBack } from '@/lib/nav';

const NEXT: Record<FeedbackStatus, FeedbackStatus> = { new: 'seen', seen: 'closed', closed: 'new' };
const TONE: Record<FeedbackStatus, 'warn' | 'neutral' | 'danger'> = { new: 'warn', seen: 'neutral', closed: 'neutral' };

// Admin inbox for in-app feedback. Tap a row to advance its status (new -> seen -> closed).
export default function AdminFeedback() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<'open' | 'closed'>('open');
  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['admin', 'feedback', view],
    queryFn: () => listFeedback(view),
  });
  const advance = useMutation({
    mutationFn: (row: FeedbackRow) => setFeedbackStatus(row.id, NEXT[row.status]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] }),
    onError: (err) => toast.show(messageFor(err)),
  });

  return (
    <Screen edges={['top']}>
      <Header title="Feedback" left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />} />
      <View style={styles.segmentWrap}>
        <Segmented
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
          value={view}
          onChange={(v) => setView(v as 'open' | 'closed')}
          full
        />
      </View>
      {isLoading ? (
        <View style={styles.skeletons}>
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
          renderItem={({ item }) => (
            <Pressable onPress={() => advance.mutate(item)} style={styles.row}>
              <View style={styles.rowTop}>
                <Badge label={item.category} />
                <Badge label={item.status} tone={TONE[item.status]} />
              </View>
              <Text variant="bodySm">{item.message}</Text>
              <Text variant="meta">
                {[item.platform, item.app_version && `v${item.app_version}`, `${timeAgo(item.created_at)} ago`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={<EmptyState title={view === 'open' ? 'No open feedback' : 'Nothing closed yet'} />}
        />
      )}
    </Screen>
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
