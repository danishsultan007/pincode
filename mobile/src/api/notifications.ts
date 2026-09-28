// Thin Supabase calls for the notifications center (MOBILE-PLAN.md §2.5, §3,
// §4 Inbox tab, P5). No react-query here — see hooks/useInbox.ts.

import { supabase } from '@/lib/supabase';
import type { NotificationRow } from '@/types/models';

const PAGE_SIZE = 30;

// actor_id has a single FK to profiles(id) (unlike blocks' two), so the
// default embed name `profiles` needs no constraint disambiguation — we
// still alias it `actor` for a friendlier shape and flatten it below.
export async function listNotifications(before?: string | null): Promise<NotificationRow[]> {
  let query = supabase
    .from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as (NotificationRow & {
    actor: { username: string | null; display_name: string; avatar_url: string | null } | null;
  })[]).map((row) => {
    const { actor, ...rest } = row;
    return {
      ...rest,
      actor_username: actor?.username ?? null,
      actor_display_name: actor?.display_name ?? null,
      actor_avatar_url: actor?.avatar_url ?? null,
    };
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) throw error;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
