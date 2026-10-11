-- Reactions on chat messages (one per person per message, like post reactions).
--
-- Stored on the message itself as a small JSON map { "<user id>": "<reaction>" }. Two reasons:
--   * One entry per user per message is natural (the user id is the key).
--   * A change is an UPDATE of the messages row, which Realtime delivers to both people with the
--     messages read policy applied. (A separate reactions table would broadcast its DELETE events
--     without any access check, leaking who reacted to what.)
-- Users have no UPDATE grant on messages, so the only way to change reactions is the function below.
-- Reactions are allowed only in accepted direct chats, between people who have not blocked each
-- other, on visible messages the caller can see. Deleting a message for everyone clears them.

set search_path = public, extensions;

alter table public.messages add column reactions jsonb not null default '{}'::jsonb;

create or replace function public.set_message_reaction(p_message uuid, p_reaction text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); m public.messages; c public.conversations;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not public.can_participate(uid) then raise exception 'not_allowed'; end if;
  if p_reaction is not null and p_reaction not in ('like','love','haha','wow','thanks','celebrate') then
    raise exception 'bad_reaction';
  end if;
  select * into m from public.messages where id = p_message for update;
  if not found or m.is_system or m.deleted_at is not null or m.mod_status <> 'visible' then
    raise exception 'not_allowed';
  end if;
  if not public.is_conversation_member(m.conversation_id) or public.message_hidden_for_me(p_message) then
    raise exception 'not_allowed';
  end if;
  select * into c from public.conversations where id = m.conversation_id;
  if c.kind <> 'direct' or c.status <> 'accepted' then raise exception 'not_allowed'; end if;
  if public.is_blocked_between(c.user_low, c.user_high) then raise exception 'blocked'; end if;
  update public.messages
     set reactions = case when p_reaction is null then reactions - uid::text
                          else jsonb_set(reactions, array[uid::text], to_jsonb(p_reaction), true) end
   where id = p_message;
end $$;
revoke execute on function public.set_message_reaction(uuid, text) from public, anon;
grant execute on function public.set_message_reaction(uuid, text) to authenticated;

-- Deleting a message for everyone also clears its reactions (same function as before, one extra column).
create or replace function public.delete_message_for_everyone(p_message uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); m public.messages;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into m from public.messages where id = p_message for update;
  if not found or m.is_system or m.sender_id is distinct from uid then raise exception 'not_allowed'; end if;
  if not public.is_conversation_member(m.conversation_id) then raise exception 'not_allowed'; end if;
  if m.deleted_at is not null then return; end if;
  if m.created_at < now() - interval '24 hours' then raise exception 'delete_window_passed'; end if;
  -- Moderation evidence: a message that was held, reported or queued for review cannot be
  -- wiped by its sender (the content must stay available to the reviewers).
  if m.mod_status <> 'visible'
     or exists (select 1 from public.reports r where r.target_type = 'message' and r.target_id = p_message)
     or exists (select 1 from public.moderation_queue q where q.target_type = 'message' and q.target_id = p_message)
  then raise exception 'under_review'; end if;
  update public.messages
     set deleted_at = now(), body = '', attachment_path = null, attachment_mime = null,
         attachment_width = null, attachment_height = null, reactions = '{}'::jsonb
   where id = p_message;
  -- If it was the latest message, the inbox preview must not keep showing its text.
  update public.conversations set last_message_preview = 'This message was deleted'
   where id = m.conversation_id and last_message_at = m.created_at and last_sender_id = uid;
  -- A pending request's notification carries a copy of the text: blank it too.
  update public.notifications set body = ''
   where conversation_id = m.conversation_id and kind = 'message_request';
end $$;
