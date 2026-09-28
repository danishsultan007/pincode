import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Segmented } from '@/components/ui/Segmented';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Divider } from '@/components/ui/Divider';
import { FeedList } from '@/components/post/FeedList';
import { CommunityHeader } from '@/components/community/CommunityHeader';
import { MemberRow } from '@/components/community/MemberRow';
import LocationPickerMap from '@/components/map/LocationPickerMap';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import {
  useCommunity,
  useCommunityMembers,
  useCommunityPosts,
  useJoinCommunity,
  useLeaveCommunity,
  useSetNotifyPosts,
} from '@/hooks/useCommunities';
import { actionSheet } from '@/lib/confirm';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { space } from '@/theme/tokens';
import { DetailState } from '@/components/ui/DetailState';
import { goBack } from '@/lib/nav';

type Tab = 'posts' | 'about' | 'members';
const MEMBERS_PREVIEW = 8;

// Community page (MOBILE-PLAN.md §4): header (Join/Leave, notify toggle),
// segmented Posts · About · Members. Anonymous read allowed.
export default function CommunityPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const toast = useToast();
  const requireAuth = useRequireAuth();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('posts');

  const { data: community, isLoading, isError, refetch } = useCommunity(slug);
  const posts = useCommunityPosts(community?.id);
  const { data: members } = useCommunityMembers(community?.id);

  const joinMutation = useJoinCommunity();
  const leaveMutation = useLeaveCommunity();
  const notifyMutation = useSetNotifyPosts();

  if (isLoading) return <DetailState kind="loading" />;
  if (isError) return <DetailState kind="error" onRetry={() => refetch()} />;
  if (!community) return <DetailState kind="notFound" text={"This community isn't available."} />;

  const isMod = community.my_role === 'owner' || community.my_role === 'moderator';

  const handleJoin = () => {
    if (!requireAuth()) return;
    joinMutation.mutate(community.id, { onError: (err) => toast.show(messageFor(err)) });
  };
  const handleLeave = () => {
    if (!requireAuth()) return;
    leaveMutation.mutate(community.id, { onError: (err) => toast.show(messageFor(err)) });
  };
  const handleToggleNotify = () => {
    if (!requireAuth()) return;
    notifyMutation.mutate(
      { communityId: community.id, notify: !community.my_notify_posts },
      { onError: (err) => toast.show(messageFor(err)) }
    );
  };
  const handleReport = () => {
    if (!requireAuth()) return;
    router.push({ pathname: '/report', params: { targetType: 'community', targetId: community.id } });
  };
  const handlePostHere = () => {
    if (!requireAuth()) return;
    router.push({ pathname: '/compose', params: { communityId: community.id } });
  };

  const openMenu = () => {
    const options = isMod
      ? [
          { label: copy.communities.editCommunity, onPress: () => router.push(`/community/${slug}/edit`) },
          { label: copy.communities.reportCommunity, onPress: handleReport },
        ]
      : [{ label: copy.communities.reportCommunity, onPress: handleReport }];
    actionSheet(community.name, options);
  };

  const moderators = (members ?? []).filter((m) => m.role === 'owner' || m.role === 'moderator');
  const memberPreview = (members ?? []).slice(0, MEMBERS_PREVIEW);

  return (
    <Screen edges={['top']}>
      <Header
        title={community.name}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
        right={user ? <IconButton name="more" label="More" onPress={openMenu} /> : undefined}
      />
      <CommunityHeader
        community={community}
        onJoin={handleJoin}
        onLeave={handleLeave}
        onToggleNotify={handleToggleNotify}
        joining={joinMutation.isPending}
        leaving={leaveMutation.isPending}
      />
      <View style={styles.segmentWrap}>
        <Segmented
          options={[
            { value: 'posts', label: 'Posts' },
            { value: 'about', label: 'About' },
            { value: 'members', label: 'Members' },
          ]}
          value={tab}
          onChange={setTab}
          full
        />
      </View>

      {tab === 'posts' ? (
        <>
          <View style={styles.postButtonWrap}>
            <Button label={copy.communities.postInCommunity} variant="ghost" onPress={handlePostHere} />
          </View>
          {posts.isLoading ? (
            <View style={styles.skeletons}>
              <Skeleton height={96} />
              <Skeleton height={96} />
            </View>
          ) : (
            <FeedList
              groups={[{ divider: null, items: posts.items }]}
              refreshing={posts.isRefetching}
              onRefresh={posts.refetch}
              ListEmptyComponent={<EmptyState title={copy.communities.noPostsYet} text={copy.communities.beFirstToPost} />}
            />
          )}
        </>
      ) : null}

      {tab === 'about' ? (
        <ScrollView contentContainerStyle={styles.aboutContent}>
          {community.description ? <Text variant="body">{community.description}</Text> : null}

          {community.rules.length ? (
            <View style={styles.section}>
              <Text variant="label">{copy.communities.rules}</Text>
              {community.rules.map((rule, i) => (
                <Text key={i} variant="bodySm">{`${i + 1}. ${rule}`}</Text>
              ))}
            </View>
          ) : null}

          {moderators.length ? (
            <View style={styles.section}>
              <Text variant="label">{copy.communities.moderators}</Text>
              {moderators.map((m) => (
                <Text key={m.user_id} variant="bodySm">
                  {m.display_name}
                  {m.role === 'owner' ? ' · Owner' : ' · Moderator'}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text variant="label">{copy.communities.created}</Text>
            <Text variant="bodySm">
              {new Date(community.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long' })}
            </Text>
          </View>

          <View style={styles.mapWrap}>
            <LocationPickerMap lat={community.lat} lng={community.lng} onChange={() => {}} height={160} />
          </View>
        </ScrollView>
      ) : null}

      {tab === 'members' ? (
        <ScrollView contentContainerStyle={styles.membersContent}>
          {memberPreview.map((m) => (
            <MemberRow
              key={m.user_id}
              userId={m.user_id}
              username={m.username}
              displayName={m.display_name}
              avatarUrl={m.avatar_url}
              role={m.role}
            />
          ))}
          {!memberPreview.length ? <EmptyState title="No members yet" /> : null}
          <Divider />
          <Button
            label={copy.communities.seeAllMembers}
            variant="text"
            onPress={() => router.push(`/community/${slug}/members`)}
          />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  segmentWrap: { paddingHorizontal: space.s4, paddingBottom: space.s2 },
  postButtonWrap: { paddingHorizontal: space.s4, paddingBottom: space.s2 },
  skeletons: { paddingHorizontal: space.s4, gap: space.s3 },
  aboutContent: { padding: space.s4, gap: space.s4, paddingBottom: space.s6 },
  section: { gap: space.s1 },
  mapWrap: { height: 160 },
  membersContent: { paddingBottom: space.s6 },
});
