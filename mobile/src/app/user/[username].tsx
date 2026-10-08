import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Segmented';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PostCard as PostCardComponent } from '@/components/post/PostCard';
import { StatsRow } from '@/components/profile/StatsRow';
import { BadgeList } from '@/components/profile/BadgeList';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { useAuthorAnswers, useAuthorPosts, usePublicProfile } from '@/hooks/useProfile';
import { useStartConversation } from '@/hooks/useInbox';
import { supabase } from '@/lib/supabase';
import { joinedLabel, timeAgo } from '@/lib/format';
import { messageFor } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { colors, radius, shadow, space } from '@/theme/tokens';
import { DetailState } from '@/components/ui/DetailState';
import { goBack } from '@/lib/nav';

type ProfileTabValue = 'posts' | 'answers';

// Anonymous read allowed (MOBILE-PLAN.md §4) — matters for share links opened
// signed-out. Messaging goes through api/chat.ts's start_conversation (P5);
// reporting pushes to the /report modal (P8) with targetType 'user'.
export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const toast = useToast();
  const { session, user } = useAuth();
  const { data: bundle, isLoading, isError, refetch } = usePublicProfile(username);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<ProfileTabValue>('posts');
  const { data: posts } = useAuthorPosts(bundle?.profile.id);
  const { data: answers } = useAuthorAnswers(bundle?.profile.id);
  const startConversation = useStartConversation();

  if (isLoading) return <DetailState kind="loading" />;
  if (isError) return <DetailState kind="error" onRetry={() => refetch()} />;
  if (!bundle) return <DetailState kind="notFound" text={"This profile isn't available."} />;

  const { profile, badges, communities, viewer } = bundle;

  const requireAuth = () => {
    if (!session) {
      router.push('/welcome');
      return false;
    }
    return true;
  };

  const handleMessage = async () => {
    if (!requireAuth()) return;
    setBusy(true);
    try {
      const conversationId = await startConversation.mutateAsync(profile.id);
      router.push(`/chat/${conversationId}`);
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!requireAuth() || !user) return;
    setBusy(true);
    try {
      if (viewer.i_blocked) {
        await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', profile.id);
      } else {
        await supabase.from('blocks').insert({ blocker_id: user.id, blocked_id: profile.id });
      }
      await refetch();
    } catch (err) {
      toast.show(messageFor(err));
    } finally {
      setBusy(false);
    }
  };

  const handleReport = () => {
    if (!requireAuth()) return;
    router.push({ pathname: '/report', params: { targetType: 'user', targetId: profile.id } });
  };

  return (
    <Screen scroll>
      <Header
        title={profile.username ? `@${profile.username}` : undefined}
        left={<IconButton name="chevron-left" label="Back" onPress={() => goBack()} />}
        right={
          !viewer.is_me ? (
            <IconButton name="flag" label={copy.chat.reportUser} onPress={handleReport} />
          ) : undefined
        }
      />
      <View style={styles.header}>
        <View style={styles.avatarRing}>
          <Avatar uri={profile.avatar_url} name={profile.display_name || profile.username || '?'} size={96} />
        </View>
        <Text variant="title">{profile.display_name}</Text>
        {profile.username ? <Text variant="secondary">@{profile.username}</Text> : null}
        {profile.is_suspended ? <Badge label={copy.profile.accountSuspended} tone="danger" /> : null}
        {profile.bio ? (
          <Text variant="body" style={styles.center}>
            {profile.bio}
          </Text>
        ) : null}
        {profile.home_area || profile.home_pincode ? (
          <View style={styles.areaRow}>
            <Icon name="pin" size={12} color={colors.ink3} />
            <Text variant="meta">{[profile.home_area, profile.home_pincode].filter(Boolean).join(' · ')}</Text>
          </View>
        ) : null}
        <Text variant="meta">{joinedLabel(profile.created_at)}</Text>

        {!viewer.is_me ? (
          <View style={styles.actionsRow}>
            <Button label={copy.profile.message} onPress={handleMessage} loading={busy} />
            <Button
              label={viewer.i_blocked ? copy.profile.unblock : 'Block'}
              variant="ghost"
              onPress={handleBlockToggle}
              loading={busy}
            />
          </View>
        ) : null}
      </View>

      <StatsRow
        reputation={profile.reputation}
        posts={profile.post_count}
        answers={profile.answer_count}
        solved={profile.solved_count}
        communities={profile.community_count}
      />

      <BadgeList badges={badges} />

      {profile.interests.length ? (
        <>
          <SectionTitle title="Interests" />
          <ChipRow>
            {profile.interests.map((i) => (
              <Chip key={i} label={i} />
            ))}
          </ChipRow>
        </>
      ) : null}

      {communities.length ? (
        <>
          <SectionTitle title="Communities" />
          <ChipRow>
            {communities.map((c) => (
              <Chip key={c.id} label={c.name} />
            ))}
          </ChipRow>
        </>
      ) : null}

      <View style={styles.segmentWrap}>
        <Segmented
          options={[
            { value: 'posts', label: 'Posts' },
            { value: 'answers', label: 'Answers' },
          ]}
          value={tab}
          onChange={setTab}
          full
        />
      </View>

      {tab === 'posts' ? (
        (posts ?? []).length ? (
          <View style={styles.list}>
            {(posts ?? []).map((p) => (
              <PostCardComponent key={p.id} post={p} />
            ))}
          </View>
        ) : (
          <EmptyState title="No posts yet" />
        )
      ) : (answers ?? []).length ? (
        <View style={styles.list}>
          {(answers ?? []).map((a) => (
            <Pressable key={a.id} onPress={() => router.push(`/post/${a.post_id}?comment=${a.id}`)}>
              <View style={styles.answerRow}>
                <Text variant="secondary" style={styles.answerTitle}>
                  {a.post_title}
                </Text>
                <Text variant="bodySm" numberOfLines={2}>
                  {a.body}
                </Text>
                <Text variant="meta">
                  {copy.post.helpful(a.upvote_count)} · {timeAgo(a.created_at)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyState title="No answers yet" />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6, paddingHorizontal: space.s4, paddingTop: space.s2, paddingBottom: space.s4 },
  avatarRing: { padding: 4, borderRadius: radius.pill, backgroundColor: colors.surface, boxShadow: shadow.card },
  center: { textAlign: 'center', maxWidth: 480 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionsRow: { flexDirection: 'row', gap: space.s2, marginTop: space.s3 },
  segmentWrap: { paddingHorizontal: space.s4, paddingTop: space.s5 },
  list: { paddingHorizontal: space.s4, paddingTop: space.s3, gap: space.s3 },
  answerRow: {
    gap: 6,
    padding: space.s4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  answerTitle: { color: colors.ink, fontWeight: '600' },
});
