// Thin Supabase calls for admin moderation (MOBILE-PLAN.md §2.9, §4 Admin
// queue/item/user/filters, §6 Moderation flow). No react-query here — see
// hooks/useAdmin.ts. Every RPC here checks is_admin() itself (§2.9), so a
// non-admin caller just gets `not_allowed` back; admin/_layout.tsx is the
// client-side gate that keeps non-admins from reaching these screens at all.

import { supabase } from '@/lib/supabase';
import type { ChatProfile } from '@/api/chat';
import type {
  CommentCard,
  Community,
  FilterTerm,
  Message,
  ModerationAction,
  ModerationQueueItem,
  Profile,
  Report,
  ReportTarget,
  Strike,
  StrikeAction,
  UUID,
} from '@/types/models';
import type { PostCard } from '@/types/models';
import type { ReportCategory } from '@/lib/constants';

type MiniProfile = { id: UUID; username: string | null; display_name: string; avatar_url: string | null };

async function fetchProfilesByIds(ids: UUID[]): Promise<Map<UUID, MiniProfile>> {
  const unique = Array.from(new Set(ids));
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', unique);
  if (error) throw error;
  return new Map((data as MiniProfile[] | null ?? []).map((p) => [p.id, p]));
}

export type ModerationQueueItemRow = ModerationQueueItem & {
  target_username: string | null;
  target_display_name: string | null;
  target_avatar_url: string | null;
};

async function attachTargetProfiles(rows: ModerationQueueItem[]): Promise<ModerationQueueItemRow[]> {
  const ids = rows.map((r) => r.target_user_id).filter((id): id is UUID => !!id);
  const profiles = await fetchProfilesByIds(ids);
  return rows.map((r) => {
    const p = r.target_user_id ? profiles.get(r.target_user_id) : undefined;
    return {
      ...r,
      target_username: p?.username ?? null,
      target_display_name: p?.display_name ?? null,
      target_avatar_url: p?.avatar_url ?? null,
    };
  });
}

// Admin queue (MOBILE-PLAN.md §4 Admin queue): moderation_queue filtered by
// status, newest first.
export async function listModerationQueue(status: 'open' | 'resolved'): Promise<ModerationQueueItemRow[]> {
  const { data, error } = await supabase
    .from('moderation_queue')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return attachTargetProfiles((data as ModerationQueueItem[] | null) ?? []);
}

export async function getQueueItem(id: string): Promise<ModerationQueueItemRow | null> {
  const { data, error } = await supabase.from('moderation_queue').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [row] = await attachTargetProfiles([data as ModerationQueueItem]);
  return row;
}

export type ReportRow = Report & { reporter_username: string | null; reporter_display_name: string | null };

// Admin item (MOBILE-PLAN.md §4 Admin item): every report against this
// target, with the reporter's public identity attached.
export async function listReportsForTarget(targetType: ReportTarget, targetId: string): Promise<ReportRow[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('target_type', targetType)
    .eq('target_id', targetId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data as Report[] | null) ?? [];
  const ids = rows.map((r) => r.reporter_id).filter((id): id is UUID => !!id);
  const profiles = await fetchProfilesByIds(ids);
  return rows.map((r) => {
    const p = r.reporter_id ? profiles.get(r.reporter_id) : undefined;
    return { ...r, reporter_username: p?.username ?? null, reporter_display_name: p?.display_name ?? null };
  });
}

export type AdminTargetContent =
  | { kind: 'post'; post: PostCard }
  | { kind: 'comment'; comment: CommentCard }
  | { kind: 'message'; message: Message; sender: ChatProfile | null }
  | { kind: 'user'; profile: Profile }
  | { kind: 'community'; community: Community }
  | { kind: 'missing' };

// Fetches the actual content behind a queue item/report so the admin can
// read it. Admin RLS (MOBILE-PLAN.md §2.11 posts_select/comments_select/
// msg_select) already allows this regardless of mod_status.
export async function getTargetContent(targetType: ReportTarget, targetId: string): Promise<AdminTargetContent> {
  if (targetType === 'post') {
    const { data, error } = await supabase.from('post_cards').select('*').eq('id', targetId).maybeSingle();
    if (error) throw error;
    return data ? { kind: 'post', post: data as PostCard } : { kind: 'missing' };
  }
  if (targetType === 'comment') {
    const { data, error } = await supabase.from('comment_cards').select('*').eq('id', targetId).maybeSingle();
    if (error) throw error;
    return data ? { kind: 'comment', comment: data as CommentCard } : { kind: 'missing' };
  }
  if (targetType === 'message') {
    const { data, error } = await supabase.from('messages').select('*').eq('id', targetId).maybeSingle();
    if (error) throw error;
    if (!data) return { kind: 'missing' };
    const message = data as Message;
    let sender: ChatProfile | null = null;
    if (message.sender_id) {
      const { data: p } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', message.sender_id)
        .maybeSingle();
      sender = (p as ChatProfile | null) ?? null;
    }
    return { kind: 'message', message, sender };
  }
  if (targetType === 'user') {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle();
    if (error) throw error;
    return data ? { kind: 'user', profile: data as Profile } : { kind: 'missing' };
  }
  const { data, error } = await supabase.from('communities').select('*').eq('id', targetId).maybeSingle();
  if (error) throw error;
  return data ? { kind: 'community', community: data as Community } : { kind: 'missing' };
}

// Admin user (MOBILE-PLAN.md §4 Admin user).
export async function getProfileForAdmin(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function listStrikes(userId: string): Promise<Strike[]> {
  const { data, error } = await supabase
    .from('strikes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as Strike[] | null) ?? [];
}

export async function listModerationActions(userId: string): Promise<ModerationAction[]> {
  const { data, error } = await supabase
    .from('moderation_actions')
    .select('*')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as ModerationAction[] | null) ?? [];
}

// Strike ladder preview (MOBILE-PLAN.md §0, §2.9 admin_issue_strike): counts
// only strikes from the last 365 days, mirroring the SQL exactly so the
// client's "This will be strike N → …" line matches what the RPC will do.
export function countRecentStrikes(strikes: Strike[]): number {
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  return strikes.filter((s) => new Date(s.created_at).getTime() > cutoff).length;
}

export function nextStrikeAction(recentStrikeCount: number, severe: boolean): StrikeAction {
  if (severe) return 'permanent_ban';
  const n = recentStrikeCount + 1;
  if (n === 1) return 'warning';
  if (n === 2) return 'final_warning';
  if (n === 3) return 'suspension_7d';
  return 'permanent_ban';
}

export const STRIKE_ACTION_LABEL: Record<StrikeAction, string> = {
  warning: 'Warning',
  final_warning: 'Final warning',
  suspension_7d: '7-day suspension',
  permanent_ban: 'Permanent ban',
};

// ---------------------------------------------------------------------------
// RPCs (MOBILE-PLAN.md §2.9)
// ---------------------------------------------------------------------------

export type ResolveItemOptions = {
  strike?: boolean;
  reason?: string | null;
  category?: ReportCategory;
  severe?: boolean;
};

export async function adminResolveItem(
  itemId: string,
  decision: 'restore' | 'remove' | 'dismiss',
  opts: ResolveItemOptions = {}
): Promise<void> {
  const { error } = await supabase.rpc('admin_resolve_item', {
    p_item: itemId,
    p_decision: decision,
    p_strike: opts.strike ?? false,
    p_reason: opts.reason ?? null,
    p_category: opts.category ?? 'other',
    p_severe: opts.severe ?? false,
  });
  if (error) throw error;
}

export async function adminIssueStrike(
  userId: string,
  reason: string,
  category: ReportCategory,
  severe = false
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_issue_strike', {
    p_user: userId,
    p_reason: reason,
    p_category: category,
    p_severe: severe,
  });
  if (error) throw error;
  return data as string;
}

export async function adminLiftBan(userId: string, note?: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_lift_ban', { p_user: userId, p_note: note ?? null });
  if (error) throw error;
}

export type RemoveContentOptions = {
  strike?: boolean;
  category?: ReportCategory;
  severe?: boolean;
};

export async function adminRemoveContent(
  targetType: ReportTarget,
  id: string,
  reason: string,
  opts: RemoveContentOptions = {}
): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_content', {
    p_type: targetType,
    p_id: id,
    p_reason: reason,
    p_strike: opts.strike ?? false,
    p_category: opts.category ?? 'other',
    p_severe: opts.severe ?? false,
  });
  if (error) throw error;
}

export type FilterTestResult = { action: 'allow' | 'flag' | 'block'; reasons: string[] };

export async function testFilter(text: string, scope: string): Promise<FilterTestResult> {
  const { data, error } = await supabase.rpc('admin_test_filter', { p_text: text, p_scope: scope });
  if (error) throw error;
  return data as FilterTestResult;
}

// ---------------------------------------------------------------------------
// Filter terms (MOBILE-PLAN.md §4 Admin filters). Direct table access — RLS
// (ft_admin) restricts all of filter_terms to admins already.
// ---------------------------------------------------------------------------

export async function listFilterTerms(): Promise<FilterTerm[]> {
  const { data, error } = await supabase.from('filter_terms').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data as FilterTerm[] | null) ?? [];
}

export async function setFilterTermActive(id: number, active: boolean): Promise<void> {
  const { error } = await supabase.from('filter_terms').update({ active }).eq('id', id);
  if (error) throw error;
}

export type NewFilterTermInput = {
  pattern: string;
  category: FilterTerm['category'];
  action: FilterTerm['action'];
  scopes: FilterTerm['scopes'];
  note?: string | null;
};

export async function addFilterTerm(input: NewFilterTermInput): Promise<void> {
  const { error } = await supabase.from('filter_terms').insert(input);
  if (error) throw error;
}
