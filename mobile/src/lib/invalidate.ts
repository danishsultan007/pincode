import type { QueryClient } from '@tanstack/react-query';

// Which cached queries go stale after each kind of change. Screens in the tab
// and stack navigators stay mounted, so React Query never refetches them when
// you navigate back: whatever a mutation changes must be invalidated here, or
// that screen shows old data until the app is killed. Keys are PREFIXES, so
// ['profile'] covers ['profile', username]. Only mounted (active) queries
// refetch right away; the rest are just marked stale for their next mount.
//
// 'me' holds the signed-in user's own profile row, whose counters (post_count,
// answer_count, solved_count, reputation, community_count) are DB-trigger
// maintained: they only change on screen once 'me' is refetched.
const POST_LISTS = ['feed', 'alerts', 'feed-search', 'search-posts', 'author-posts', 'community-posts'];
const STATS = ['me', 'profile'];

export type InvalidateKind =
  | 'post-created' // create/delete a post: lists, own stats, community post counts
  | 'post-edited' // edit / resolve / confirm alert: lists only
  | 'vote' // post votes + reactions: the post lists only (author stats refresh on focus)
  | 'comment' // comment/answer created, deleted or solved (caller refreshes that post's comments)
  | 'comment-vote' // comment votes + reactions
  | 'community' // join/leave/create/edit/role/ban
  | 'profile' // name, avatar, username, bio, area: shown on posts, comments, chats
  | 'block' // block/unblock
  | 'moderation'; // admin and community-mod removals

const KEYS: Record<InvalidateKind, string[]> = {
  'post-created': [...POST_LISTS, ...STATS, 'community', 'community-by-id'],
  'post-edited': POST_LISTS,
  vote: POST_LISTS,
  comment: [...POST_LISTS, ...STATS, 'author-answers'],
  'comment-vote': ['author-answers'],
  community: [
    'communities-near',
    'my-communities',
    'community',
    'community-by-id',
    'community-members',
    'community-posts',
    'can-create-community',
    'search-communities',
    'feed',
    ...STATS,
  ],
  profile: [
    'feed',
    'post',
    'comments',
    'author-posts',
    'author-answers',
    'community-posts',
    'community-members',
    'conversations',
    'search-posts',
    'search-users',
    'chat-profile',
    ...STATS,
  ],
  block: [
    'blocked-users',
    'feed',
    'alerts',
    'feed-search',
    'comments',
    'conversation',
    'conversations',
    'search-posts',
    'search-users',
    'community-posts',
    'author-posts',
    'author-answers',
    'profile',
  ],
  moderation: [...POST_LISTS, 'post', 'comments', 'community', 'community-by-id', ...STATS],
};

export function invalidateAfter(queryClient: QueryClient, kind: InvalidateKind): void {
  for (const key of KEYS[kind]) queryClient.invalidateQueries({ queryKey: [key] });
}
