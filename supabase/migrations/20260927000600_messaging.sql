set search_path = public, extensions;
create type public.conversation_kind as enum ('direct','system');
create type public.conversation_status as enum ('pending','accepted','declined');

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null default 'direct',
  status public.conversation_status not null default 'pending',
  created_by uuid references public.profiles(id) on delete set null,
  user_low uuid references public.profiles(id) on delete cascade,
  user_high uuid references public.profiles(id) on delete cascade,
  system_user_id uuid unique references public.profiles(id) on delete cascade,
  last_message_at timestamptz,
  last_message_preview text,
  last_sender_id uuid,
  created_at timestamptz not null default now(),
  unique (user_low, user_high),
  check ((kind = 'system' and system_user_id is not null) or
         (kind = 'direct' and user_low is not null and user_high is not null and user_low < user_high))
);
create table public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  unread_count int not null default 0,
  muted boolean not null default false,
  hidden boolean not null default false,
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000),
  is_system boolean not null default false,
  mod_status public.mod_status not null default 'visible',
  mod_reason text,
  has_link boolean not null default false,
  has_phone_text boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
create index messages_conv_idx on public.messages (conversation_id, created_at desc);
create index conv_members_user_idx on public.conversation_members (user_id);
alter table public.notifications add constraint notifications_conv_fk
  foreign key (conversation_id) references public.conversations(id) on delete cascade;

create or replace function public.is_conversation_member(p_conv uuid) returns boolean language sql stable
security definer set search_path = public, extensions as $$
  select exists (select 1 from conversation_members where conversation_id = p_conv and user_id = auth.uid()) $$;

create or replace function public._system_conversation(p_user uuid) returns uuid language plpgsql
security definer set search_path = public, extensions as $$
declare cid uuid;
begin
  select id into cid from conversations where system_user_id = p_user;
  if cid is null then
    insert into conversations(kind, status, system_user_id) values ('system','accepted',p_user) returning id into cid;
    insert into conversation_members(conversation_id, user_id) values (cid, p_user);
  end if;
  return cid;
end $$;

create or replace function public._send_system_message(p_user uuid, p_body text) returns uuid language plpgsql
security definer set search_path = public, extensions as $$
declare mid uuid;
begin
  insert into messages(conversation_id, sender_id, body, is_system)
  values (public._system_conversation(p_user), null, left(p_body, 2000), true) returning id into mid;
  return mid;
end $$;

create or replace function public.start_conversation(p_other uuid) returns uuid language plpgsql
security definer set search_path = public, extensions as $$
declare me uuid := auth.uid(); cid uuid; n int;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not public.can_participate(me) then raise exception 'not_allowed'; end if;
  if p_other = me or not exists (select 1 from profiles where id = p_other and onboarded_at is not null) then raise exception 'not_found'; end if;
  if public.is_blocked_between(me, p_other) then raise exception 'blocked'; end if;
  select id into cid from conversations where user_low = least(me,p_other) and user_high = greatest(me,p_other);
  if cid is not null then return cid; end if;
  select count(*) into n from conversations where created_by = me and created_at > now() - interval '24 hours';
  if n >= 10 then raise exception 'rate_limited_requests'; end if;
  insert into conversations(kind, status, created_by, user_low, user_high)
  values ('direct','pending', me, least(me,p_other), greatest(me,p_other)) returning id into cid;
  insert into conversation_members(conversation_id, user_id) values (cid, me), (cid, p_other);
  return cid;
end $$;

create or replace function public.respond_to_request(p_conv uuid, p_action text) returns void language plpgsql
security definer set search_path = public, extensions as $$
declare c conversations; me uuid := auth.uid(); who text;
begin
  select * into c from conversations where id = p_conv for update;
  if not found or not public.is_conversation_member(p_conv) or c.created_by = me or c.status <> 'pending' then
    raise exception 'not_allowed'; end if;
  if p_action = 'accept' then
    update conversations set status = 'accepted' where id = p_conv;
    select coalesce(nullif(display_name,''), '@'||username::text) into who from profiles where id = me;
    perform public.notify(c.created_by, 'request_accepted', me, who || ' accepted your message request', '',
                          null, null, null, p_conv, '/chat/' || p_conv);
  elsif p_action = 'decline' then
    update conversations set status = 'declined' where id = p_conv;
    update conversation_members set hidden = true, unread_count = 0 where conversation_id = p_conv and user_id = me;
  elsif p_action = 'block' then
    insert into blocks(blocker_id, blocked_id) values (me, c.created_by) on conflict do nothing;
    update conversations set status = 'declined' where id = p_conv;
    update conversation_members set hidden = true, unread_count = 0 where conversation_id = p_conv and user_id = me;
  else raise exception 'bad_decision'; end if;
end $$;

create or replace function public.mark_conversation_read(p_conv uuid) returns void language sql
security definer set search_path = public, extensions as $$
  update conversation_members set last_read_at = now(), unread_count = 0
  where conversation_id = p_conv and user_id = auth.uid() $$;

create or replace function public.messages_prepare() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare c conversations; n int; uid uuid := auth.uid();
begin
  if new.is_system then new.sender_id := null; return new; end if;
  if uid is not null then new.sender_id := uid; new.created_at := now(); end if;
  select * into c from conversations where id = new.conversation_id;
  if c.kind = 'system' then raise exception 'not_allowed'; end if;
  if c.status = 'declined' then raise exception 'request_declined'; end if;
  if c.status = 'pending' then
    if c.created_by <> new.sender_id then raise exception 'request_pending_accept_first'; end if;
    select count(*) into n from messages where conversation_id = c.id and sender_id = new.sender_id;
    if n >= 1 then raise exception 'request_pending'; end if;
  end if;
  if public.is_blocked_between(c.user_low, c.user_high) then raise exception 'blocked'; end if;
  if uid is not null then
    select count(*) into n from messages where sender_id = uid and created_at > now() - interval '1 minute';
    if n >= 20 then raise exception 'rate_limited_messages'; end if;
  end if;
  return new;
end $$;
create trigger t10_messages_prepare before insert on public.messages for each row execute function public.messages_prepare();

create or replace function public.messages_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare c conversations; other uuid; who text;
begin
  select * into c from conversations where id = new.conversation_id;
  if new.mod_status = 'visible' then
    update conversations set last_message_at = new.created_at, last_message_preview = left(new.body, 120),
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
                          left(new.body, 140), null, null, null, c.id, '/chat/' || c.id);
  elsif not coalesce((select muted from conversation_members where conversation_id = c.id and user_id = other), false)
    and coalesce((select (notification_prefs->>'messages')::boolean from private_profiles where id = other), true) then
    perform public.send_push(other, who, left(new.body, 140),
                             jsonb_build_object('url', '/chat/' || c.id, 'conversationId', c.id));
  end if;
  return new;
end $$;
create trigger t50_messages_after after insert on public.messages for each row execute function public.messages_after();

create or replace function public.list_conversations(p_box text default 'chats')
returns table (id uuid, kind conversation_kind, status conversation_status, created_by uuid, is_request boolean,
  other_user_id uuid, other_username text, other_display_name text, other_avatar_url text,
  last_message_at timestamptz, last_message_preview text, last_sender_id uuid, unread_count int, muted boolean)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.kind, c.status, c.created_by, (c.status = 'pending' and c.created_by <> auth.uid()),
         o.id, o.username::text, o.display_name, o.avatar_url,
         c.last_message_at, c.last_message_preview, c.last_sender_id, m.unread_count, m.muted
  from conversation_members m
  join conversations c on c.id = m.conversation_id
  left join profiles o on o.id = case when c.user_low = auth.uid() then c.user_high else c.user_low end
  where m.user_id = auth.uid() and not m.hidden
    and (c.kind = 'system' or c.last_message_at is not null)
    and (case when p_box = 'requests' then c.status = 'pending' and c.created_by <> auth.uid()
              else c.kind = 'system' or c.status = 'accepted' or c.created_by = auth.uid() end)
  order by c.last_message_at desc nulls last $$;

create or replace function public.inbox_counts() returns jsonb language sql stable
security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'chats', coalesce((select sum(m.unread_count) from conversation_members m join conversations c on c.id = m.conversation_id
                        where m.user_id = auth.uid() and (c.status = 'accepted') and not m.muted and not m.hidden), 0),
    'requests', (select count(*) from conversation_members m join conversations c on c.id = m.conversation_id
                  where m.user_id = auth.uid() and c.status = 'pending' and c.created_by <> auth.uid()
                    and not m.hidden and c.last_message_at is not null),
    'notifications', (select count(*) from notifications where user_id = auth.uid() and read_at is null)) $$;
