-- 1) Chat photo size cap: 1.5 MB -> 3 MB. Phones cannot shrink photos yet (that needs the
--    next native build), and modern phone photos / PNG screenshots routinely exceed 1.5 MB.
--    The app still compresses what it can; the 700 MB bucket kill switch still guards storage.
-- 2) Push priority: pushes were sent at Expo's default priority, which on Android is
--    "normal", so Doze batches them and they arrive in bursts. Send high priority.

set search_path = public, extensions;

update storage.buckets set file_size_limit = 3145728 where id = 'chat-attachments';

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
  if uid is not null then
    select count(*) into n from messages where sender_id = uid and created_at > now() - interval '1 minute';
    if n >= 20 then raise exception 'rate_limited_messages'; end if;
  end if;
  return new;
end $function$;

create or replace function public.send_push(p_user uuid, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', p_title, 'body', p_body, 'data', p_data,
                                      'sound', 'default', 'channelId', 'default', 'priority', 'high',
                                      'ttl', 3600))
    into msgs from push_tokens where user_id = p_user and platform in ('ios','android');
  if msgs is null then return; end if;
  perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := msgs,
    headers := jsonb_build_object('Content-Type','application/json','Accept','application/json'));
end $$;
