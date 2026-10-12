-- Reply to a message. A reply stores only the id of the message it answers; the app reads the
-- quoted message through the normal messages policies, so a deleted, hidden or held original is
-- never shown to someone who must not see it, and a delete-for-everyone shows up in the quote.

set search_path = public, extensions;

alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
create index if not exists messages_reply_to_idx on public.messages (reply_to_id) where reply_to_id is not null;

-- Insert only (no update grant), so a reply can never be re-pointed at another message later.
grant insert (reply_to_id) on public.messages to authenticated;

create or replace function public.messages_prepare()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare c conversations; n int; uid uuid := auth.uid(); o_size bigint; o_mime text; o_owner text; r messages;
begin
  if new.is_system then new.sender_id := null; new.reply_to_id := null; return new; end if;
  if uid is not null then new.sender_id := uid; new.created_at := now(); end if;
  new.body := coalesce(new.body, '');
  select * into c from conversations where id = new.conversation_id;
  if c.kind = 'system' then raise exception 'not_allowed'; end if;
  if c.status = 'declined' then raise exception 'request_declined'; end if;
  if new.attachment_path is not null then
    -- No photos in message requests, and only authenticated users attach.
    if uid is null then raise exception 'not_allowed'; end if;
    if c.status <> 'accepted' then raise exception 'attachments_need_accept'; end if;
    if new.attachment_path !~ ('^' || c.id::text || '/' || uid::text || '/[A-Za-z0-9_-]{8,64}\.(jpg|png|webp)$') then
      raise exception 'bad_attachment';
    end if;
    select (metadata->>'size')::bigint, metadata->>'mimetype', owner_id into o_size, o_mime, o_owner
      from storage.objects where bucket_id = 'chat-attachments' and name = new.attachment_path;
    if not found or o_owner is distinct from uid::text then raise exception 'bad_attachment'; end if;
    if o_size is null or o_size > 3145728 then raise exception 'attachment_too_large'; end if;
    new.attachment_mime := o_mime;
  else
    new.attachment_mime := null;
    new.attachment_width := null;
    new.attachment_height := null;
  end if;
  if c.status = 'pending' then
    if c.created_by is distinct from new.sender_id then raise exception 'request_pending_accept_first'; end if;
    select count(*) into n from messages where conversation_id = c.id and sender_id = new.sender_id;
    if n >= 1 then raise exception 'request_pending'; end if;
  end if;
  if public.is_blocked_between(c.user_low, c.user_high) then raise exception 'blocked'; end if;
  if new.reply_to_id is not null then
    -- Must be a normal, visible message of THIS conversation that the sender can see.
    select * into r from messages where id = new.reply_to_id;
    if not found or r.conversation_id <> new.conversation_id or r.is_system
       or r.deleted_at is not null or r.mod_status <> 'visible'
       or (uid is not null and public.message_hidden_for_me(r.id)) then
      raise exception 'bad_reply';
    end if;
  end if;
  if uid is not null then
    select count(*) into n from messages where sender_id = uid and created_at > now() - interval '1 minute';
    if n >= 20 then raise exception 'rate_limited_messages'; end if;
  end if;
  return new;
end $function$;
