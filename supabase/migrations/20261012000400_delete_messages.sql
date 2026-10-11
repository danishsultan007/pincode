-- Delete messages in chat, WhatsApp-style.
--
--   * Delete for me: the message is hidden for the caller only (message_hides + the
--     msg_read policy). The other person still sees it.
--   * Delete for everyone: only the sender, only within 24 hours of sending. The row
--     stays as a tombstone (deleted_at set, text and photo reference cleared) so the
--     chat shows "This message was deleted" for both people. The server enforces the
--     24 h window; the app only hides the button.
--
-- A photo's file is not removed here (SQL cannot delete Storage objects). Once the
-- message no longer references it, it is an unreferenced upload that the daily
-- clean-up job removes after 24 h; until then only the uploader can still read it.

set search_path = public, extensions;

alter table public.messages add column deleted_at timestamptz;

alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 2000
         and (char_length(btrim(body)) >= 1 or attachment_path is not null or deleted_at is not null));

-- ---------- delete for me ----------
create table public.message_hides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.message_hides enable row level security;
-- No policies and no grants: only the functions below touch this table.
revoke all on table public.message_hides from public, anon, authenticated;

create or replace function public.message_hidden_for_me(p_msg uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.message_hides h where h.message_id = p_msg and h.user_id = auth.uid()) $$;
revoke execute on function public.message_hidden_for_me(uuid) from public, anon;
grant execute on function public.message_hidden_for_me(uuid) to authenticated;

-- Same as before, plus: a message you hid is not readable by you.
drop policy msg_read on public.messages;
create policy msg_read on public.messages for select to authenticated using (
  (is_conversation_member(conversation_id)
     and not public.message_hidden_for_me(id)
     and (mod_status = 'visible' or sender_id = auth.uid()))
  or (is_admin() and (exists (select 1 from reports r where (r.target_type = 'message' and r.target_id = messages.id)
                                or r.conversation_id = messages.conversation_id)
                      or exists (select 1 from moderation_queue q where q.target_type = 'message' and q.target_id = messages.id))));

create or replace function public.hide_message(p_message uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); m public.messages;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into m from public.messages where id = p_message;
  if not found then raise exception 'not_found'; end if;
  if not public.is_conversation_member(m.conversation_id) then raise exception 'not_allowed'; end if;
  insert into public.message_hides (user_id, message_id) values (uid, p_message) on conflict do nothing;
end $$;
revoke execute on function public.hide_message(uuid) from public, anon;
grant execute on function public.hide_message(uuid) to authenticated;

-- ---------- delete for everyone ----------
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
         attachment_width = null, attachment_height = null
   where id = p_message;
  -- If it was the latest message, the inbox preview must not keep showing its text.
  update public.conversations set last_message_preview = 'This message was deleted'
   where id = m.conversation_id and last_message_at = m.created_at and last_sender_id = uid;
  -- A pending request's notification carries a copy of the text: blank it too.
  update public.notifications set body = ''
   where conversation_id = m.conversation_id and kind = 'message_request';
end $$;
revoke execute on function public.delete_message_for_everyone(uuid) from public, anon;
grant execute on function public.delete_message_for_everyone(uuid) to authenticated;
