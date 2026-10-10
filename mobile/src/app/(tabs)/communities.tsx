import React, { useState } from 'react';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Segmented } from '@/components/ui/Segmented';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { CommunityCard } from '@/components/community/CommunityCard';
import { useCommunitiesNear, useJoinCommunity, useLeaveCommunity, useMyCommunities } from '@/hooks/useCommunities';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/providers/ToastProvider';
import { messageFor } from '@/lib/errors';
import { COMMUNITY_CATEGORIES } from '@/lib/constants';
import type { CommunityCategory } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { colors, radius, shadow, space } from '@/theme/tokens';

const DISTANCES = [2, 5, 10, 25] as const;
type Distance = (typeof DISTANCES)[number];

// Communities tab (MOBILE-PLAN.md §4): "Your communities" horizontal list,
// category chips, distance/sort filters, then the nearby-first community
// list. "Start a community" -> community/new (P6 eligibility gate).
export default function CommunitiesTab() {
  const router = useRouter();
  useRefreshOnFocus([['my-communities'], ['communities-near'], ['can-create-community']]);
  const toast = useToast();
  const requireAuth = useRequireAuth();

  const [category, setCategory] = useState<CommunityCategory | 'all'>('all');
  const [distance, setDistance] = useState<Distance>(10);
  const [sort, setSort] = useState<'nearby' | 'members' | 'newest'>('nearby');

  const { items, isLoading, refetch, isRefetching } = useCommunitiesNear(
    distance,
    category === 'all' ? null : category,
    sort
  );
  const { data: mine } = useMyCommunities();

  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();

  const handleStart = () => {
    if (!requireAuth()) return;
    router.push('/community/new');
  };

  const handleJoin = (id: string) => {
    if (!requireAuth()) return;
    joinMutation.mutate(id, { onError: (err) => toast.show(messageFor(err)) });
  };

  const handleLeave = (id: string) => {
    if (!requireAuth()) return;
    leaveMutation.mutate(id, { onError: (err) => toast.show(messageFor(err)) });
  };

  return (
    <Screen edges={['top']}>
      <Header
        large
        title="Communities"
        right={<IconButton name="plus" label={copy.communities.startCommunity} onPress={handleStart} />}
      />

      {mine && mine.length > 0 ? (
        <View style={styles.mineSection}>
          <SectionTitle title={copy.communities.yourCommunities} />
          <FlatList
            horizontal
            data={mine}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.mineRow}
            renderItem={({ item }) => (
              <Pressable style={styles.mineChip} onPress={() => router.push(`/community/${item.slug}`)}>
                <Avatar name={item.name} size={36} shape="rounded" />
                <Text variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
                  {item.name}
                </Text>
                <Text variant="meta">{copy.communities.membersCount(item.member_count)}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      <ChipRow>
        <Chip label="All" selected={category === 'all'} onPress={() => setCategory('all')} />
        {COMMUNITY_CATEGORIES.map((c) => (
          <Chip key={c.code} label={c.label} selected={category === c.code} onPress={() => setCategory(c.code)} />
        ))}
      </ChipRow>

      <View style={styles.filterRow}>
        <Segmented
          options={DISTANCES.map((d) => ({ value: String(d), label: `${d} km` }))}
          value={String(distance)}
          onChange={(v) => setDistance(Number(v) as Distance)}
        />
        <Segmented
          options={[
            { value: 'nearby', label: 'Nearby' },
            { value: 'members', label: 'Members' },
            { value: 'newest', label: 'Newest' },
          ]}
          value={sort}
          onChange={(v) => setSort(v as typeof sort)}
        />
      </View>

      {isLoading ? (
        <View style={styles.skeletons}>
          <Skeleton height={84} radius={radius.lg} />
          <Skeleton height={84} radius={radius.lg} />
          <Skeleton height={84} radius={radius.lg} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          refreshing={isRefetching}
          onRefresh={refetch}
          ItemSeparatorComponent={() => <View style={{ height: space.s3 }} />}
          renderItem={({ item }) => (
            <CommunityCard
              community={item}
              onJoin={() => handleJoin(item.id)}
              onLeave={() => handleLeave(item.id)}
              joining={joinMutation.isPending}
              leaving={leaveMutation.isPending}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title={copy.communities.noCommunitiesNearby}
              text={copy.communities.tryWideningDistance}
              actions={<Text variant="secondary" onPress={handleStart} style={styles.startLink}>{copy.communities.startCommunity}</Text>}
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  mineSection: { paddingBottom: space.s2 },
  mineRow: { paddingHorizontal: space.s4, gap: space.s3, paddingBottom: space.s1 },
  mineChip: {
    width: 160,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.s3,
    gap: 6,
    backgroundColor: colors.surface,
    boxShadow: shadow.xs,
  },
  filterRow: {
    paddingHorizontal: space.s4,
    paddingVertical: space.s3,
    gap: space.s2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  skeletons: { paddingHorizontal: space.s4, gap: space.s3 },
  listContent: { paddingHorizontal: space.s4, paddingTop: space.s1, paddingBottom: space.s6 },
  startLink: { color: colors.accent, fontWeight: '600' },
});
