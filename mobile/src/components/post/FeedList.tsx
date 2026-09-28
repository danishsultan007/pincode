import React from 'react';
import { RefreshControl, SectionList, StyleSheet } from 'react-native';
import { PostCard } from './PostCard';
import { RingDivider } from '@/components/ui/RingDivider';
import { space } from '@/theme/tokens';
import type { FeedPost } from '@/hooks/useFeed';

export type FeedGroup = { divider: string | null; items: FeedPost[] };

export type FeedListProps = {
  groups: FeedGroup[];
  refreshing?: boolean;
  onRefresh?: () => void;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  ListEmptyComponent?: React.ComponentType<any> | React.ReactElement | null;
  contentBottomInset?: number;
};

// SectionList of ring groups (MOBILE-PLAN.md §7.3): one section per ring from
// buildFeedGroups, a RingDivider header for the "further away" bands.
export function FeedList({
  groups,
  refreshing,
  onRefresh,
  ListHeaderComponent,
  ListEmptyComponent,
  contentBottomInset,
}: FeedListProps) {
  const sections = groups
    .filter((g) => g.items.length > 0)
    .map((g, i) => ({ key: `${i}-${g.divider ?? 'main'}`, divider: g.divider, data: g.items }));

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <PostCard post={item} />}
      renderSectionHeader={({ section }) => (section.divider ? <RingDivider label={section.divider} /> : null)}
      contentContainerStyle={[styles.content, contentBottomInset != null && { paddingBottom: contentBottomInset }]}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.s4, paddingBottom: space.s6, gap: space.s3 },
});
