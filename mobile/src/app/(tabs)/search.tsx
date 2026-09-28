import React, { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { SearchInput } from '@/components/ui/SearchInput';
import { Segmented } from '@/components/ui/Segmented';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { Icon } from '@/components/ui/Icon';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PostCard } from '@/components/post/PostCard';
import { CommunityCard } from '@/components/community/CommunityCard';
import {
  useDebouncedValue,
  useRecentSearches,
  useSearchCommunitiesTab,
  useSearchPostsTab,
  useSearchUsersTab,
  SearchTab,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_LEN,
} from '@/hooks/useSearch';
import { useJoinCommunity, useLeaveCommunity } from '@/hooks/useCommunities';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useToast } from '@/providers/ToastProvider';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { colors, space } from '@/theme/tokens';
import type { PostCard as PostCardModel, UserSearchResult } from '@/types/models';

const TAB_OPTIONS: { value: SearchTab; label: string }[] = [
  { value: 'posts', label: copy.search.posts },
  { value: 'communities', label: copy.search.communities },
  { value: 'users', label: copy.search.users },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// "From N weeks ago" (MOBILE-PLAN.md §4 Search tab / §9 P7 runtime: the
// expired Bellandur "plumber" ask is labelled "From 5 weeks ago").
function fromWeeksAgoLabel(post: PostCardModel): string | null {
  const ageMs = Date.now() - new Date(post.created_at).getTime();
  const isOld = post.status === 'resolved' || post.is_expired || ageMs > 7 * DAY_MS;
  if (!isOld) return null;
  const weeks = Math.max(1, Math.round(ageMs / (7 * DAY_MS)));
  return copy.search.fromWeeksAgo(weeks);
}

// Search tab (MOBILE-PLAN.md §4): SearchInput (autofocus), segmented
// Posts · Communities · Users. The active tab's RPC runs only once
// q.length >= 2 (debounce 300 ms). Recent searches persist to AsyncStorage
// (max 8) and are shown while the query is empty. Query + active tab stay in
// local state, which expo-router's Tabs keeps mounted across tab switches.
export default function SearchTabScreen() {
  const router = useRouter();
  const toast = useToast();
  const requireAuth = useRequireAuth();

  const [tab, setTab] = useState<SearchTab>('posts');
  const [input, setInput] = useState('');
  const debounced = useDebouncedValue(input, SEARCH_DEBOUNCE_MS);
  const trimmed = debounced.trim();
  const isQuerying = trimmed.length >= SEARCH_MIN_LEN;

  const recent = useRecentSearches();

  const posts = useSearchPostsTab(debounced, tab === 'posts');
  const communities = useSearchCommunitiesTab(debounced, tab === 'communities');
  const users = useSearchUsersTab(debounced, tab === 'users');

  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();

  // Record a search once results have loaded for the active tab, so partial
  // keystrokes don't pollute the recent list.
  const recorded = useRef(new Set<string>());
  React.useEffect(() => {
    if (!isQuerying) return;
    const active = tab === 'posts' ? posts : tab === 'communities' ? communities : users;
    if (active.isSuccess && !recorded.current.has(trimmed)) {
      recorded.current.add(trimmed);
      recent.add(trimmed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.isSuccess, communities.isSuccess, users.isSuccess, tab, trimmed, isQuerying]);

  const handleClear = () => setInput('');
  const handleRecentPress = (q: string) => setInput(q);

  const handleJoin = (id: string) => {
    if (!requireAuth()) return;
    joinMutation.mutate(id, { onError: (err) => toast.show(messageFor(err)) });
  };
  const handleLeave = (id: string) => {
    if (!requireAuth()) return;
    leaveMutation.mutate(id, { onError: (err) => toast.show(messageFor(err)) });
  };

  const renderRecent = () => {
    if (recent.items.length === 0) return null;
    return (
      <View style={styles.recentSection}>
        <SectionTitle
          title={copy.search.recentSearches}
          right={
            <Pressable onPress={recent.clear} hitSlop={8}>
              <Text variant="secondary" style={{ color: colors.accent }}>
                Clear
              </Text>
            </Pressable>
          }
        />
        <ChipRow>
          {recent.items.map((q) => (
            <Chip key={q} label={q} onPress={() => handleRecentPress(q)} />
          ))}
        </ChipRow>
      </View>
    );
  };

  const renderPosts = () => {
    if (posts.isLoading) return <SkeletonList />;
    return (
      <FlatList
        data={posts.items}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: space.s3 }} />}
        renderItem={({ item }) => {
          const label = fromWeeksAgoLabel(item);
          return (
            <View style={{ gap: 4 }}>
              {label ? (
                <Text variant="meta" style={{ color: colors.ink3 }}>
                  {label}
                </Text>
              ) : null}
              <PostCard post={item} />
            </View>
          );
        }}
        ListEmptyComponent={<NoResults visible={isQuerying} query={trimmed} />}
      />
    );
  };

  const renderCommunities = () => {
    if (communities.isLoading) return <SkeletonList />;
    return (
      <FlatList
        data={communities.items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
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
        ListEmptyComponent={<NoResults visible={isQuerying} query={trimmed} />}
      />
    );
  };

  const renderUsers = () => {
    if (users.isLoading) return <SkeletonList />;
    return (
      <FlatList
        data={users.items}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: space.s3 }} />}
        renderItem={({ item }) => <UserResultRow user={item} onPress={() => item.username && router.push(`/user/${item.username}`)} />}
        ListEmptyComponent={<NoResults visible={isQuerying} query={trimmed} />}
      />
    );
  };

  return (
    <Screen edges={['top']}>
      <Header title="Search" />
      <View style={styles.searchBar}>
        <SearchInput
          value={input}
          onChangeText={setInput}
          onClear={handleClear}
          placeholder="Search posts, communities, people…"
          autoFocus
        />
      </View>
      <View style={styles.tabsRow}>
        <Segmented options={TAB_OPTIONS} value={tab} onChange={setTab} full />
      </View>

      {!isQuerying ? (
        <View style={styles.body}>
          {renderRecent()}
          {trimmed.length > 0 && trimmed.length < SEARCH_MIN_LEN ? (
            <EmptyState title="Keep typing" text="Enter at least 2 characters to search." />
          ) : recent.items.length === 0 ? (
            <EmptyState title="Search pincode" text="Find posts, communities and people near you." />
          ) : null}
        </View>
      ) : tab === 'posts' ? (
        renderPosts()
      ) : tab === 'communities' ? (
        renderCommunities()
      ) : (
        renderUsers()
      )}
    </Screen>
  );
}

function SkeletonList() {
  return (
    <View style={styles.skeletons}>
      <Skeleton height={80} />
      <Skeleton height={80} />
      <Skeleton height={80} />
    </View>
  );
}

function NoResults({ visible, query }: { visible: boolean; query: string }) {
  if (!visible) return null;
  return <EmptyState title="No results" text={`Nothing found for "${query}".`} />;
}

function UserResultRow({ user, onPress }: { user: UserSearchResult; onPress: () => void }) {
  const meta = [user.username ? `@${user.username}` : null, user.home_area].filter(Boolean).join(' · ');
  return (
    <Card onPress={onPress}>
      <View style={styles.userRow}>
        <Avatar uri={user.avatar_url} name={user.display_name} size={40} />
        <View style={styles.userBody}>
          <Text variant="cardTitle" numberOfLines={1}>
            {user.display_name}
          </Text>
          {meta ? (
            <Text variant="meta" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <View style={styles.userRep}>
          <Icon name="star" size={14} color={colors.ink3} />
          <Text variant="meta" numeric>
            {user.reputation}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  searchBar: { paddingHorizontal: space.s4, paddingTop: space.s2, paddingBottom: space.s2 },
  tabsRow: { paddingHorizontal: space.s4, paddingBottom: space.s3 },
  body: { flex: 1 },
  recentSection: { paddingBottom: space.s2 },
  listContent: { paddingHorizontal: space.s4, paddingBottom: space.s6, flexGrow: 1 },
  skeletons: { paddingHorizontal: space.s4, gap: space.s3 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3 },
  userBody: { flex: 1, gap: 2 },
  userRep: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
