// Thin Supabase calls for direct messages (MOBILE-PLAN.md §2.6, §4 Inbox tab /
// Chat, P5). No react-query here — see hooks/useInbox.ts.

import { supabase } from '@/lib/supabase';
import type { Conversation, ConversationReceipt, ConversationRow, Message } from '@/types/models';

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

// "My app has synced my chats": the server marks the newest incoming message of each accepted
// chat as delivered (one call, however many chats).
export async function markChatsDelivered(): Promise<void> {
  const { error } = await supabase.rpc('mark_chats_delivered');
  if (error) throw error;
}

// How far the other person has got in this chat (null until their app has synced it).
export async function getPeerReceipt(conversationId: string, otherUserId: string): Promise<ConversationReceipt | null> {
  const { data, error } = await supabase
    .from('conversation_receipts')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', otherUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConversationReceipt | null) ?? null;
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

// The few fields a quoted message needs, read through the normal message policies: a message the
// viewer hid, or that was held, simply does not come back.
export type QuotedMessage = Pick<Message, 'id' | 'sender_id' | 'body' | 'attachment_path' | 'deleted_at' | 'mod_status' | 'is_system'>;

export async function getMessagesByIds(conversationId: string, ids: string[]): Promise<QuotedMessage[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, body, attachment_path, deleted_at, mod_status, is_system')
    .eq('conversation_id', conversationId)
    .in('id', ids);
  if (error) throw error;
  return (data as QuotedMessage[] | null) ?? [];
}

export type ChatAttachment = { path: string; width: number; height: number };

export async function sendMessage(
  conversationId: string,
  body: string,
  attachment?: ChatAttachment | null,
  replyToId?: string | null
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      body,
      ...(replyToId ? { reply_to_id: replyToId } : {}),
      ...(attachment
        ? { attachment_path: attachment.path, attachment_width: attachment.width, attachment_height: attachment.height }
        : {}),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

// Chat photos live in the private 'chat-attachments' bucket at
// <conversation_id>/<sender_uid>/<random>.<ext>. The random part only has to be
// unique (access is enforced by storage RLS, not by hiding the path), but Hermes
// has no crypto.randomUUID, so build it from Math.random + time.
function randomId(): string {
  let s = Date.now().toString(36);
  for (let i = 0; i < 3; i++) s += Math.random().toString(36).slice(2, 8);
  return s.slice(0, 40);
}

const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// The bytes go up as an ArrayBuffer with an explicit content type. (A React Native Blob
// inside multipart form data reached Storage without a usable type and was refused.)
export async function uploadChatImage(conversationId: string, uid: string, bytes: ArrayBuffer, mimeType: string): Promise<string> {
  const mime = mimeType in EXT_BY_MIME ? mimeType : 'image/jpeg';
  const path = `${conversationId}/${uid}/${randomId()}.${EXT_BY_MIME[mime]}`;
  const { error } = await supabase.storage.from('chat-attachments').upload(path, bytes, { contentType: mime, upsert: false });
  if (error) {
    // Storage reports a refused upload as an RLS violation; say what it means.
    if (/row-level security|unauthorized|not allowed/i.test(error.message)) throw new Error('attachments_unavailable');
    if (/maximum|too large|payload/i.test(error.message)) throw new Error('attachment_too_large');
    if (/bucket not found/i.test(error.message)) throw new Error('attachments_unavailable');
    if (/network request failed|fetch failed|failed to fetch/i.test(error.message)) throw new Error('Network request failed');
    // Anything else (e.g. an unsupported type): keep the real reason so it can be diagnosed.
    throw new Error(`upload_failed: ${error.message}`);
  }
  return path;
}

// Short-lived link for a private photo (the bucket is not public).
export async function signAttachment(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('chat-attachments').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    // A file the retention job (or a moderator removal) deleted is gone for good; anything else may be transient.
    if (error && /not found|does not exist/i.test(error.message)) throw new Error('photo_expired');
    throw error ?? new Error('attachments_unavailable');
  }
  return data.signedUrl;
}

// Discards an uploaded photo that was never sent (allowed only while no message uses it).
export async function deleteUnsentAttachment(path: string): Promise<void> {
  await supabase.storage.from('chat-attachments').remove([path]);
}

// One reaction per person on a chat message: a code sets (or switches) it, null removes it.
export async function setMessageReaction(messageId: string, reaction: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_message_reaction', { p_message: messageId, p_reaction: reaction });
  if (error) throw error;
}

// Hides a message for the caller only; the other person still sees it.
export async function hideMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_message', { p_message: messageId });
  if (error) throw error;
}

// Sender only, within 24 hours of sending (the server enforces both).
export async function deleteMessageForEveryone(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_message_for_everyone', { p_message: messageId });
  if (error) throw error;
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
  // 23505 = already blocked (stale UI): the end state is what was asked for.
  if (error && error.code !== '23505') throw error;
}
