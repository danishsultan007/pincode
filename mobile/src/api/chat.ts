// Thin Supabase calls for direct messages (MOBILE-PLAN.md §2.6, §4 Inbox tab /
// Chat, P5). No react-query here — see hooks/useInbox.ts.

import { supabase } from '@/lib/supabase';
import type { Conversation, ConversationRow, Message } from '@/types/models';

export type InboxBox = 'chats' | 'requests';

export async function listConversations(box: InboxBox): Promise<ConversationRow[]> {
  const { data, error } = await supabase.rpc('list_conversations', { p_box: box });
  if (error) throw error;
  return (data as ConversationRow[] | null) ?? [];
}

export async function inboxCounts(): Promise<{ chats: number; requests: number; notifications: number }> {
  const { data, error } = await supabase.rpc('inbox_counts');
  if (error) throw error;
  return (data as { chats: number; requests: number; notifications: number } | null) ?? {
    chats: 0,
    requests: 0,
    notifications: 0,
  };
}

// Creates (or returns the existing) pending/accepted direct conversation with
// `otherUserId`. Message request semantics (one message before acceptance)
// are enforced server-side by t10_messages_prepare.
export async function startConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_conversation', { p_other: otherUserId });
  if (error) throw error;
  return data as string;
}

export async function respondToRequest(conversationId: string, action: 'accept' | 'decline' | 'block'): Promise<void> {
  const { error } = await supabase.rpc('respond_to_request', { p_conv: conversationId, p_action: action });
  if (error) throw error;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conv: conversationId });
  if (error) throw error;
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase.from('conversations').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Conversation | null) ?? null;
}

export type ChatProfile = { id: string; username: string | null; display_name: string; avatar_url: string | null };

export async function getProfileById(id: string): Promise<ChatProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ChatProfile | null) ?? null;
}

export async function getMyMembership(conversationId: string, userId: string) {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as { conversation_id: string; user_id: string; muted: boolean; hidden: boolean } | null;
}

const MESSAGES_PAGE = 50;

export async function listMessages(conversationId: string, before?: string | null): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  return (data as Message[] | null) ?? [];
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, body })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

export async function setMuted(conversationId: string, userId: string, muted: boolean): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ muted })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error) throw error;
}

// Blocking from an already-accepted chat (the Requests bar's Block goes
// through respond_to_request instead). Mirrors user/[username].tsx's toggle.
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  const { error } = await supabase.from('blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error) throw error;
}
