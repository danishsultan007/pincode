import React, { useState } from 'react';
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { Header } from '@/components/ui/Header';
import { IconButton } from '@/components/ui/IconButton';
import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ChipRow } from '@/components/ui/ChipRow';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionTitle } from '@/components/ui/SectionTitle';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/providers/AuthProvider';
import { useAuthorAnswers, useAuthorPosts, usePublicProfile } from '@/hooks/useProfile';
import { PostCard as PostCardComponent } from '@/components/post/PostCard';
import { StatsRow } from '@/components/profile/StatsRow';
import { BadgeList } from '@/components/profile/BadgeList';
import { joinedLabel, timeAgo } from '@/lib/format';
import { copy } from '@/lib/copy';
import { colors, radius, shadow, space } from '@/theme/tokens';

type ProfileTabValue = 'posts' | 'answers';

export default function ProfileTab() {
  const router = useRouter();
  const { me } = useAuth();
  useRefreshOnFocus([['me'], ['profile', me?.profile.username], ['author-posts', me?.profile.id], ['author-answers', me?.profile.id]]);
  const username = me?.profile.username ?? undefined;
  const { data: bundle } = usePublicProfile(username);
  const [tab, setTab] = useState<ProfileTabValue>('posts');
  const { data: posts } = useAuthorPosts(me?.profile.id);
  const { data: answers } = useAuthorAnswers(me?.profile.id);

  if (!me) return null;
  const { profile } = me;

  return (
    <Screen scroll edges={['top']}>
      <Header
        large
        title="Profile"
        right={<IconButton name="settings" label={copy.profile.settings} onPress={() => router.push('/settings')} />}
      />
      <View style={styles.header}>
        <View style={styles.avatarRing}>
          <Avatar uri={profile.avatar_url} name={profile.display_name || profile.username || '?'} size={96} />
        </View>
        <Text variant="title">{profile.display_name}</Text>
        {profile.username ? <Text variant="secondary">@{profile.username}</Text> : null}
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
        <View style={styles.actionsRow}>
          <Button label={copy.profile.editProfile} variant="ghost" size="sm" onPress={() => router.push('/profile/edit')} />
        </View>
      </View>

      <StatsRow
        reputation={profile.reputation}
        posts={profile.post_count}
        answers={profile.answer_count}
        solved={profile.solved_count}
        communities={profile.community_count}
      />

      <BadgeList badges={bundle?.badges ?? []} />

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

      {bundle?.communities?.length ? (
        <>
          <SectionTitle title="Communities" />
          <ChipRow>
            {bundle.communities.map((c) => (
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
          <EmptyState title="No posts yet" text="Your asks, alerts and events will show up here." />
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
        <EmptyState title="No answers yet" text="Answers you post will show up here." />
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
