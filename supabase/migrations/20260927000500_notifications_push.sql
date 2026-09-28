set search_path = public, extensions;
create type public.notification_kind as enum (
 'post_answer','post_comment','comment_reply','answer_solved','post_upvotes','comment_upvotes','badge_earned',
 'alert_confirmed','alert_nearby','message_request','request_accepted','community_new_post','community_role',
 'community_post_removed','community_member_removed','content_held','content_restored','content_removed',
 'warning','suspension','ban_lifted','report_update','mod_queue');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.notification_kind not null,
  actor_id uuid references public.profiles(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  community_id uuid,            -- FK in 0700
  conversation_id uuid,         -- FK in 0600
  title text not null,
  body text not null default '',
  data jsonb not null default '{}',      -- {"url": "/post/<id>"}
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios','android','web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create index push_tokens_user_idx on public.push_tokens(user_id);

create or replace function public.notification_category(k public.notification_kind) returns text
language sql immutable as $$
  select case
    when k in ('comment_reply','post_comment') then 'replies'
    when k in ('post_answer','answer_solved') then 'answers'
    when k in ('post_upvotes','comment_upvotes','badge_earned') then 'votes'
    when k in ('alert_confirmed','alert_nearby') then 'alerts'
    when k in ('message_request','request_accepted') then 'messages'
    when k in ('community_new_post','community_role','community_post_removed','community_member_removed') then 'communities'
    else 'moderation' end $$;

create or replace function public.notify(p_user uuid, p_kind public.notification_kind, p_actor uuid,
  p_title text, p_body text, p_post uuid default null, p_comment uuid default null,
  p_community uuid default null, p_conversation uuid default null, p_url text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if p_actor is not null and exists (select 1 from blocks where blocker_id = p_user and blocked_id = p_actor) then return; end if;
  insert into notifications(user_id, kind, actor_id, title, body, post_id, comment_id, community_id, conversation_id, data)
  values (p_user, p_kind, p_actor, left(p_title, 140), left(coalesce(p_body,''), 200), p_post, p_comment,
          p_community, p_conversation, jsonb_build_object('url', p_url));
end $$;

create or replace function public.send_push(p_user uuid, p_title text, p_body text, p_data jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object('to', token, 'title', p_title, 'body', p_body, 'data', p_data,
                                      'sound', 'default', 'channelId', 'default'))
    into msgs from push_tokens where user_id = p_user and platform in ('ios','android');
  if msgs is null then return; end if;
  perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := msgs,
    headers := jsonb_build_object('Content-Type','application/json','Accept','application/json'));
end $$;

create or replace function public.notifications_push() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare prefs jsonb; cat text := public.notification_category(new.kind);
begin
  select notification_prefs into prefs from private_profiles where id = new.user_id;
  if cat <> 'moderation' and coalesce((prefs->>cat)::boolean, true) = false then return new; end if;
  perform public.send_push(new.user_id, new.title, new.body, new.data || jsonb_build_object('notificationId', new.id));
  return new;
end $$;
create trigger t60_notifications_push after insert on public.notifications
  for each row execute function public.notifications_push();

create or replace function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into push_tokens(token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, last_seen_at = now();
end $$;

create or replace function public.mark_all_notifications_read() returns void language sql
security definer set search_path = public, extensions as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null $$;

-- comments -> notifications
create or replace function public.comments_notify() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare p posts; par comments; who text; done uuid := null;
begin
  if new.mod_status <> 'visible' then return new; end if;
  select * into p from posts where id = new.post_id;
  select coalesce(nullif(display_name,''), '@' || username::text) into who from profiles where id = new.author_id;
  if new.parent_id is not null then
    select * into par from comments where id = new.parent_id;
    if par.author_id <> new.author_id then
      perform public.notify(par.author_id, 'comment_reply', new.author_id, who || ' replied to your comment',
        new.body, p.id, new.id, null, null, '/post/' || p.id || '?comment=' || new.id);
      done := par.author_id;
    end if;
  end if;
  if p.author_id <> new.author_id and p.author_id is distinct from done then
    perform public.notify(p.author_id,
      (case when new.is_answer then 'post_answer' else 'post_comment' end)::notification_kind, new.author_id,
      who || case when new.is_answer then ' answered: ' else ' commented on: ' end || p.title,
      new.body, p.id, new.id, null, null, '/post/' || p.id || '?comment=' || new.id);
  end if;
  return new;
end $$;
create trigger t60_comments_notify after insert on public.comments for each row execute function public.comments_notify();

-- new alert -> nearby residents
create or replace function public.posts_notify_nearby() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if new.type <> 'alert' or new.mod_status <> 'visible' then return new; end if;
  insert into notifications(user_id, kind, actor_id, title, body, post_id, data)
  select pp.id, 'alert_nearby', new.author_id, left('Alert near you: ' || new.title, 140), left(new.body, 200),
         new.id, jsonb_build_object('url', '/post/' || new.id)
  from private_profiles pp join profiles pr on pr.id = pp.id
  where pp.home_location is not null and st_dwithin(pp.home_location, new.location, 2000)
    and pp.id <> new.author_id and pr.onboarded_at is not null
    and coalesce((pp.notification_prefs->>'alerts')::boolean, true)
    and not exists (select 1 from blocks b where b.blocker_id = pp.id and b.blocked_id = new.author_id)
  limit 300;
  return new;
end $$;
create trigger t60_posts_notify_nearby after insert on public.posts for each row execute function public.posts_notify_nearby();
