-- Photo attachments in direct messages.
--
--   * messages gets attachment_path / mime / width / height. A message needs text
--     OR a photo (body stays NOT NULL, default '').
--   * Private bucket 'chat-attachments', objects at <conversation_id>/<sender_uid>/<rand>.<ext>.
--     Upload is allowed only into an ACCEPTED direct conversation you belong to,
--     with no block between the two people, within rate limits and a global
--     size cap (free-plan guard). Reading is tied to message visibility.
--   * messages_prepare re-validates path, owner, size and conversation state, so
--     a crafted insert cannot reference someone else's file or skip the rules.
--   * Preview / push text for a photo is 'Photo' (+ caption).
--   * Service-only helpers for account deletion and the retention clean-up job.

set search_path = public, extensions;

-- ---------- columns ----------
alter table public.messages
  add column attachment_path text unique,
  add column attachment_mime text,
  add column attachment_width int check (attachment_width between 1 and 10000),
  add column attachment_height int check (attachment_height between 1 and 10000);

alter table public.messages drop constraint messages_body_check;
alter table public.messages alter column body set default '';
alter table public.messages add constraint messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or attachment_path is not null));

grant insert (attachment_path, attachment_width, attachment_height) on public.messages to authenticated;

-- ---------- bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 1572864, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ---------- upload gate ----------
-- Used by the storage insert policy. p_conv is the first folder of the object path.
create or replace function public.can_attach(p_conv text) returns boolean
language plpgsql stable security definer set search_path = public, extensions, storage as $$
declare uid uuid := auth.uid(); cid uuid; c conversations; n int; total bigint;
begin
  if uid is null then return false; end if;
  begin cid := p_conv::uuid; exception when others then return false; end;
  select * into c from conversations where id = cid;
  if not found or c.kind <> 'direct' or c.status <> 'accepted' then return false; end if;
  if uid is distinct from c.user_low and uid is distinct from c.user_high then return false; end if;
  if not public.can_participate(uid) then return false; end if;
  if public.is_blocked_between(c.user_low, c.user_high) then return false; end if;
  select count(*) into n from storage.objects
   where bucket_id = 'chat-attachments' and owner_id = uid::text and created_at > now() - interval '1 hour';
  if n >= 20 then return false; end if;
  select count(*) into n from storage.objects
   where bucket_id = 'chat-attachments' and owner_id = uid::text and created_at > now() - interval '1 day';
  if n >= 60 then return false; end if;
  -- Free-plan kill switch: stop accepting uploads once the bucket nears 1 GB.
  select coalesce(sum((metadata->>'size')::bigint), 0) into total
    from storage.objects where bucket_id = 'chat-attachments';
  if total > 700 * 1024 * 1024 then return false; end if;
  return true;
end $$;
revoke execute on function public.can_attach(text) from public, anon;
grant execute on function public.can_attach(text) to authenticated;

-- ---------- storage policies ----------
create policy "chat-attachments insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.can_attach((storage.foldername(name))[1])
  );

-- Readable by the uploader (to preview before sending) or by anyone who can see
-- a message that references the file. The subquery runs under messages' own RLS
-- (msg_read), so membership, held/removed messages and admin access to reported
-- messages all carry over.
create policy "chat-attachments read" on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (
      owner_id = auth.uid()::text
      or exists (select 1 from public.messages m where m.attachment_path = storage.objects.name)
    )
  );

-- The uploader may remove a file only while no message uses it (discarding an
-- unsent photo). No update policy: files are immutable (upload with upsert=false).
create policy "chat-attachments owner delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and owner_id = auth.uid()::text
    and not exists (select 1 from public.messages m where m.attachment_path = storage.objects.name)
  );

-- ---------- messages_prepare (adds attachment validation) ----------
create or replace function public.messages_prepare()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare c conversations; n int; uid uuid := auth.uid(); o_size bigint; o_mime text; o_owner text;
begin
  if new.is_system then new.sender_id := null; return new; end if;
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
    if o_size is null or o_size > 1572864 then raise exception 'attachment_too_large'; end if;
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
  if uid is not null then
    select count(*) into n from messages where sender_id = uid and created_at > now() - interval '1 minute';
    if n >= 20 then raise exception 'rate_limited_messages'; end if;
  end if;
  return new;
end $function$;

-- ---------- messages_filter: nothing to moderate in a photo-only message ----------
create or replace function public.messages_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare r jsonb; v_scope text; v_status conversation_status;
begin
  new.has_phone_text := public._has_pattern(new.body, 'phone');
  new.has_link := public._has_pattern(new.body, 'url');
  if new.is_system or auth.uid() is null then return new; end if;
  if char_length(btrim(new.body)) = 0 then return new; end if;
  select status into v_status from conversations where id = new.conversation_id;
  v_scope := case when v_status = 'pending' then 'message_request' else 'message' end;
  r := public.moderate_text(new.body, v_scope, new.sender_id);
  if r->>'action' = 'block' then raise exception 'content_blocked'; end if;
  if r->>'action' = 'flag' then
    new.mod_status := 'pending';
    new.mod_reason := 'auto: ' || array_to_string(array(select jsonb_array_elements_text(r->'reasons')), ',');
  end if;
  return new;
end $$;

-- ---------- messages_after: 'Photo' preview / push text ----------
create or replace function public.messages_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare c conversations; other uuid; who text; v_text text;
begin
  v_text := case when new.attachment_path is not null
                 then 'Photo' || coalesce(': ' || nullif(new.body, ''), '')
                 else new.body end;
  select * into c from conversations where id = new.conversation_id;
  if new.mod_status = 'visible' then
    update conversations set last_message_at = new.created_at, last_message_preview = left(v_text, 120),
           last_sender_id = new.sender_id where id = c.id;
    update conversation_members set unread_count = unread_count + 1,
           hidden = case when c.status = 'declined' then hidden else false end
     where conversation_id = c.id and user_id is distinct from new.sender_id;
  end if;
  if new.is_system or new.mod_status <> 'visible' then return new; end if;
  other := case when c.user_low = new.sender_id then c.user_high else c.user_low end;
  select coalesce(nullif(display_name,''), '@'||username::text) into who from profiles where id = new.sender_id;
  if c.status = 'pending' then
    perform public.notify(other, 'message_request', new.sender_id, who || ' wants to message you',
                          left(v_text, 140), null, null, null, c.id, '/chat/' || c.id);
  elsif not coalesce((select muted from conversation_members where conversation_id = c.id and user_id = other), false)
    and coalesce((select (notification_prefs->>'messages')::boolean from private_profiles where id = other), true) then
    perform public.send_push(other, who, left(v_text, 140),
                             jsonb_build_object('url', '/chat/' || c.id, 'conversationId', c.id));
  end if;
  return new;
end $$;

-- ---------- _excerpt: say so when a reported message carries a photo ----------
create or replace function public._excerpt(p_type public.report_target, p_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case p_type
    when 'post' then (select left(coalesce(title,'') || ' ' || coalesce(body,''), 280) from posts where id = p_id)
    when 'comment' then (select left(body, 280) from comments where id = p_id)
    when 'message' then (select left(body || case when attachment_path is not null then ' [photo]' else '' end, 280)
                           from messages where id = p_id)
    when 'user' then (select left(coalesce(username::text,''), 280) from profiles where id = p_id)
    when 'community' then (select left(name, 280) from communities where id = p_id)
    else null end $$;

-- ---------- service-only helpers (edge functions use the service role) ----------
-- Every chat-attachment object a user owns, plus every object inside their direct
-- conversations (those conversations cascade away with the account, so the other
-- person's files in them would otherwise be orphaned).
create or replace function public._chat_attachment_paths_for_user(p_uid uuid) returns setof text
language sql stable security definer set search_path = public, extensions, storage as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-attachments'
     and (o.owner_id = p_uid::text
          or exists (select 1 from public.conversations c
                      where c.id::text = split_part(o.name, '/', 1)
                        and (c.user_low = p_uid or c.user_high = p_uid))) $$;

-- Retention: files older than p_days, and uploads never attached to a message
-- for p_orphan_hours. The clean-up function removes them through the Storage API.
create or replace function public._expired_chat_attachments(p_days int default 90, p_orphan_hours int default 24)
returns setof text
language sql stable security definer set search_path = public, extensions, storage as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-attachments'
     and (o.created_at < now() - make_interval(days => p_days)
          or (o.created_at < now() - make_interval(hours => p_orphan_hours)
              and not exists (select 1 from public.messages m where m.attachment_path = o.name))) $$;

revoke execute on function public._chat_attachment_paths_for_user(uuid) from public, anon, authenticated;
revoke execute on function public._expired_chat_attachments(int, int) from public, anon, authenticated;
grant execute on function public._chat_attachment_paths_for_user(uuid) to service_role;
grant execute on function public._expired_chat_attachments(int, int) to service_role;
