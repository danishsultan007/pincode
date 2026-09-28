// Hand-written models for the untyped Supabase client (MOBILE-PLAN.md §0).
// These mirror the DB tables/enums (§2) and the security-invoker views
// post_cards, comment_cards, community_cards (§2.8) that the app reads from.
// Keep field names identical to their SQL column names.

import type { CommunityCategory, ReactionCode, ReportCategory } from '@/lib/constants';

export type UUID = string;
export type ISODateString = string;

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type UserRole = 'user' | 'admin';
export type PostType = 'ask' | 'alert' | 'event';
export type PostKind = 'request' | 'offer';
export type PostStatus = 'active' | 'resolved';
export type ModStatus = 'visible' | 'pending' | 'removed';
export type LocPrecision = 'exact' | 'approx';
export type CommunityKind = 'area' | 'interest';
export type CommunityRole = 'owner' | 'moderator' | 'member';
export type ConversationKind = 'direct' | 'system';
export type ConversationStatus = 'pending' | 'accepted' | 'declined';
export type NotificationKind =
  | 'post_answer'
  | 'post_comment'
  | 'comment_reply'
  | 'answer_solved'
  | 'post_upvotes'
  | 'comment_upvotes'
  | 'badge_earned'
  | 'alert_confirmed'
  | 'alert_nearby'
  | 'message_request'
  | 'request_accepted'
  | 'community_new_post'
  | 'community_role'
  | 'community_post_removed'
  | 'community_member_removed'
  | 'content_held'
  | 'content_restored'
  | 'content_removed'
  | 'warning'
  | 'suspension'
  | 'ban_lifted'
  | 'report_update'
  | 'mod_queue';
export type ReportTarget = 'post' | 'comment' | 'user' | 'message' | 'community';
export type StrikeAction = 'warning' | 'final_warning' | 'suspension_7d' | 'permanent_ban';
export type ModerationDecision = 'restore' | 'remove' | 'dismiss';
export type ModerationResolution = 'restored' | 'removed' | 'dismissed';

export type ReactionCounts = Partial<Record<ReactionCode, number>>;

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export type Profile = {
  id: UUID;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string;
  interests: string[];
  home_pincode: string | null;
  home_area: string | null;
  home_city: string | null;
  role: UserRole;
  reputation: number;
  post_count: number;
  answer_count: number;
  solved_count: number;
  community_count: number;
  strike_count: number;
  banned_until: ISODateString | null;
  ban_permanent: boolean;
  username_changed_at: ISODateString | null;
  onboarded_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
};

export type NotificationPrefs = {
  replies: boolean;
  answers: boolean;
  votes: boolean;
  alerts: boolean;
  messages: boolean;
  communities: boolean;
};

export type PrivateProfile = {
  id: UUID;
  email: string | null;
  phone_e164: string | null;
  phone_verified: boolean;
  notification_prefs: NotificationPrefs;
  created_at: ISODateString;
};

export type Me = { profile: Profile; private: PrivateProfile };

export type Badge = {
  code: string;
  name: string;
  description: string;
  sort: number;
};

export type UserBadge = Badge & { awarded_at: ISODateString };

// A public profile bundle, as returned by the get_profile(username) RPC.
export type PublicProfileBundle = {
  profile: Pick<
    Profile,
    | 'id'
    | 'username'
    | 'display_name'
    | 'avatar_url'
    | 'bio'
    | 'interests'
    | 'home_area'
    | 'home_pincode'
    | 'reputation'
    | 'post_count'
    | 'answer_count'
    | 'solved_count'
    | 'community_count'
    | 'role'
    | 'created_at'
  > & { is_suspended: boolean };
  badges: UserBadge[];
  communities: { id: UUID; slug: string; name: string; category: CommunityCategory; role: CommunityRole }[];
  viewer: { is_me: boolean; i_blocked: boolean; conversation_id: UUID | null };
};

// ---------------------------------------------------------------------------
// Posts, comments (public.posts / public.comments and the *_cards views)
// ---------------------------------------------------------------------------

export type Post = {
  id: UUID;
  author_id: UUID;
  community_id: UUID | null;
  type: PostType;
  kind: PostKind | null;
  tag: string | null;
  title: string;
  body: string;
  has_phone: boolean;
  lat: number;
  lng: number;
  loc_precision: LocPrecision;
  pincode: string | null;
  area: string | null;
  city: string | null;
  starts_at: ISODateString | null;
  ends_at: ISODateString | null;
  expires_at: ISODateString;
  status: PostStatus;
  mod_status: ModStatus;
  community_removed: boolean;
  upvote_count: number;
  comment_count: number;
  answer_count: number;
  first_answer_at: ISODateString | null;
  solved_comment_id: UUID | null;
  solved_at: ISODateString | null;
  still_on_count: number;
  resolved_count: number;
  last_confirmed_at: ISODateString | null;
  reaction_counts: ReactionCounts;
  created_at: ISODateString;
  updated_at: ISODateString;
  image_url: string | null;
};

// public.post_cards (security-invoker view; what the client actually reads).
export type PostCard = Post & {
  is_expired: boolean;
  author_username: string | null;
  author_display_name: string;
  author_avatar_url: string | null;
  author_reputation: number;
  community_slug: string | null;
  community_name: string | null;
  my_vote: boolean;
  my_reactions: ReactionCode[];
  my_confirmation: 'still_on' | 'resolved' | null;
  // Added client-side by useFeed/buildFeedGroups, not part of the SQL view.
  distKm?: number;
};

export type Comment = {
  id: UUID;
  post_id: UUID;
  author_id: UUID;
  parent_id: UUID | null;
  root_id: UUID | null;
  depth: number;
  body: string;
  is_answer: boolean;
  upvote_count: number;
  reply_count: number;
  reaction_counts: ReactionCounts;
  mod_status: ModStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
};

// public.comment_cards
export type CommentCard = {
  id: UUID;
  post_id: UUID;
  author_id: UUID;
  parent_id: UUID | null;
  root_id: UUID | null;
  depth: number;
  body: string;
  is_deleted: boolean;
  is_answer: boolean;
  upvote_count: number;
  reply_count: number;
  reaction_counts: ReactionCounts;
  mod_status: ModStatus;
  created_at: ISODateString;
  updated_at: ISODateString;
  post_title: string;
  author_username: string | null;
  author_display_name: string;
  author_avatar_url: string | null;
  author_reputation: number;
  my_vote: boolean;
  my_reactions: ReactionCode[];
};

// A CommentCard laid out into a tree by lib/tree.ts.
export type CommentNode = CommentCard & { children: CommentNode[] };

// ---------------------------------------------------------------------------
// Communities
// ---------------------------------------------------------------------------

export type Community = {
  id: UUID;
  slug: string;
  name: string;
  description: string;
  rules: string[];
  kind: CommunityKind;
  category: CommunityCategory;
  lat: number;
  lng: number;
  radius_km: number;
  pincode: string | null;
  area: string | null;
  city: string | null;
  owner_id: UUID | null;
  member_count: number;
  post_count: number;
  created_at: ISODateString;
};

// public.community_cards
export type CommunityCard = Community & {
  my_role: CommunityRole | null;
  my_notify_posts: boolean | null;
  distKm?: number;
};

// Return row of public.search_users (MOBILE-PLAN.md §2.8).
export type UserSearchResult = {
  id: UUID;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  reputation: number;
  home_area: string | null;
};

export type CommunityMember = {
  community_id: UUID;
  user_id: UUID;
  role: CommunityRole;
  notify_posts: boolean;
  joined_at: ISODateString;
};

// A community_members row joined with the member's public profile fields,
// as returned by api/communities.ts listMembers().
export type CommunityMemberRow = CommunityMember & {
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  reputation: number;
};

// The can_create_community() RPC return shape (MOBILE-PLAN.md §2.7).
export type CommunityEligibility = {
  allowed: boolean;
  reasons: string[];
  reputation: number;
  required_reputation: number;
  account_age_days: number;
  required_age_days: number;
  owned: number;
  max_owned: number;
};

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export type Conversation = {
  id: UUID;
  kind: ConversationKind;
  status: ConversationStatus;
  created_by: UUID | null;
  user_low: UUID | null;
  user_high: UUID | null;
  system_user_id: UUID | null;
  last_message_at: ISODateString | null;
  last_message_preview: string | null;
  last_sender_id: UUID | null;
  created_at: ISODateString;
};

export type ConversationMember = {
  conversation_id: UUID;
  user_id: UUID;
  last_read_at: ISODateString | null;
  unread_count: number;
  muted: boolean;
  hidden: boolean;
};

// A conversation joined with the "other side" for list_conversations().
export type ConversationRow = Conversation & {
  is_request: boolean;
  other_user_id: UUID | null;
  other_username: string | null;
  other_display_name: string;
  other_avatar_url: string | null;
  unread_count: number;
  muted: boolean;
};

export type Message = {
  id: UUID;
  conversation_id: UUID;
  sender_id: UUID | null;
  body: string;
  is_system: boolean;
  mod_status: ModStatus;
  created_at: ISODateString;
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationRow = {
  id: UUID;
  user_id: UUID;
  kind: NotificationKind;
  actor_id: UUID | null;
  post_id: UUID | null;
  comment_id: UUID | null;
  community_id: UUID | null;
  conversation_id: UUID | null;
  title: string;
  body: string;
  data: { url?: string; [key: string]: unknown };
  read_at: ISODateString | null;
  created_at: ISODateString;
  actor_username?: string | null;
  actor_display_name?: string | null;
  actor_avatar_url?: string | null;
};

export type InboxCounts = { chats: number; requests: number; notifications: number };

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export type Report = {
  id: UUID;
  reporter_id: UUID | null;
  target_type: ReportTarget;
  target_id: UUID;
  target_user_id: UUID | null;
  conversation_id: UUID | null;
  category: ReportCategory;
  details: string | null;
  status: 'open' | 'actioned' | 'dismissed';
  created_at: ISODateString;
  resolved_at: ISODateString | null;
  resolved_by: UUID | null;
};

export type ModerationQueueItem = {
  id: UUID;
  target_type: ReportTarget;
  target_id: UUID;
  target_user_id: UUID | null;
  source: 'filter' | 'reports' | 'admin';
  reasons: string[];
  excerpt: string | null;
  report_count: number;
  status: 'open' | 'resolved';
  resolution: ModerationResolution | null;
  strike_id: UUID | null;
  created_at: ISODateString;
  resolved_at: ISODateString | null;
  resolved_by: UUID | null;
};

export type Strike = {
  id: UUID;
  user_id: UUID;
  issued_by: UUID | null;
  queue_id: UUID | null;
  reason: string;
  category: ReportCategory;
  severe: boolean;
  action: StrikeAction;
  created_at: ISODateString;
};

export type ModerationAction = {
  id: number;
  admin_id: UUID | null;
  action: string;
  target_type: string | null;
  target_id: UUID | null;
  target_user_id: UUID | null;
  note: string | null;
  created_at: ISODateString;
};

export type FilterTerm = {
  id: number;
  pattern: string;
  category: 'slur' | 'abuse' | 'scam' | 'spam' | 'url' | 'phone';
  action: 'flag' | 'block';
  scopes: ('post' | 'comment' | 'message' | 'profile' | 'community')[];
  active: boolean;
  note: string | null;
  created_at: ISODateString;
};
