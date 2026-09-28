set search_path = public, extensions;
create type public.post_type   as enum ('ask','alert','event');
create type public.post_kind   as enum ('request','offer');
create type public.post_status as enum ('active','resolved');
create type public.mod_status  as enum ('visible','pending','removed');

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid,                                  -- FK added in 0700
  type public.post_type not null,
  kind public.post_kind,
  tag text check (tag ~ '^[a-z0-9 -]{1,20}$'),
  title text not null check (char_length(title) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  phone_e164 text check (phone_e164 ~ '^\+91[6-9][0-9]{9}$'),        -- NOT granted for SELECT
  has_phone boolean generated always as (phone_e164 is not null) stored,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  location geography(Point,4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  loc_precision text not null default 'exact' check (loc_precision in ('exact','approx')),
  pincode text, area text, city text,
  starts_at timestamptz, ends_at timestamptz,
  expires_at timestamptz not null,
  status public.post_status not null default 'active',
  mod_status public.mod_status not null default 'visible',
  mod_reason text,
  community_removed boolean not null default false,
  upvote_count int not null default 0,
  comment_count int not null default 0,
  answer_count int not null default 0,
  first_answer_at timestamptz,
  solved_comment_id uuid,
  solved_at timestamptz,
  still_on_count int not null default 0,
  resolved_count int not null default 0,
  last_confirmed_at timestamptz,
  report_count int not null default 0,
  reaction_counts jsonb not null default '{}',
  has_link boolean not null default false,
  has_phone_text boolean not null default false,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(tag,'')),   'A') ||
    setweight(to_tsvector('english', coalesce(body,'')),  'B')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kind_only_for_ask check ((type = 'ask') = (kind is not null)),
  constraint event_needs_start check (type <> 'event' or starts_at is not null)
);
alter table public.posts enable row level security;
create index posts_location_gix on public.posts using gist (location);
create index posts_created_idx  on public.posts (created_at desc);
create index posts_author_idx   on public.posts (author_id, created_at desc);
create index posts_comm_idx     on public.posts (community_id, created_at desc) where community_id is not null;
create index posts_type_exp_idx on public.posts (type, expires_at);
create index posts_tsv_gin      on public.posts using gin (search_tsv);
create index posts_title_trgm   on public.posts using gin (title gin_trgm_ops);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  root_id uuid references public.comments(id) on delete cascade,
  depth smallint not null default 0 check (depth between 0 and 8),
  body text not null check (char_length(body) between 1 and 1000),
  is_answer boolean not null default false,
  upvote_count int not null default 0,
  reply_count int not null default 0,
  reaction_counts jsonb not null default '{}',
  mod_status public.mod_status not null default 'visible',
  mod_reason text,
  deleted_at timestamptz,
  has_link boolean not null default false,
  has_phone_text boolean not null default false,
  search_tsv tsvector generated always as (to_tsvector('english', body)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.comments enable row level security;
create index comments_post_idx   on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);
create index comments_parent_idx on public.comments (parent_id);
create index comments_tsv_gin    on public.comments using gin (search_tsv);
alter table public.posts add constraint posts_solved_fk foreign key (solved_comment_id) references public.comments(id) on delete set null;

create table public.post_votes (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id));
create table public.post_reactions (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like','love','haha','wow','thanks','celebrate')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, reaction));
create table public.comment_votes (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id));
create table public.comment_reactions (
  comment_id uuid references public.comments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('like','love','haha','wow','thanks','celebrate')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, reaction));
create table public.alert_confirmations (
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('still_on','resolved')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id));
alter table public.post_votes enable row level security;
alter table public.post_reactions enable row level security;
alter table public.comment_votes enable row level security;
alter table public.comment_reactions enable row level security;
alter table public.alert_confirmations enable row level security;
create index post_votes_user_idx on public.post_votes(user_id);
create index comment_votes_user_idx on public.comment_votes(user_id);

-- Trigger functions. All security definer set search_path = public, extensions.

create or replace function public.posts_prepare() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); n int;
begin
  if tg_op = 'UPDATE' then          -- immutables first
    new.author_id := old.author_id; new.type := old.type; new.created_at := old.created_at;
    new.updated_at := now();
  else
    if uid is not null then
      new.author_id := uid; new.created_at := now();
      select count(*) into n from posts where author_id = uid and created_at > now() - interval '24 hours';
      if n >= 10 then raise exception 'rate_limited_posts'; end if;
    end if;
  end if;
  new.tag := nullif(left(lower(trim(coalesce(new.tag,''))), 20), '');
  if new.type = 'ask' then new.kind := coalesce(new.kind, 'request');
  else new.kind := null; new.tag := null; new.phone_e164 := null; end if;
  if new.phone_e164 is not null then
    new.phone_e164 := public.normalize_phone_in(new.phone_e164);
    if new.phone_e164 is null then raise exception 'phone_invalid'; end if;
    new.lat := round(new.lat * 500) / 500.0;  new.lng := round(new.lng * 500) / 500.0;  -- ~200 m
    new.loc_precision := 'approx';
  else new.loc_precision := 'exact'; end if;
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    new.expires_at := case new.type
      when 'ask'   then new.created_at + interval '30 days'
      when 'alert' then least(coalesce(new.ends_at, new.created_at + interval '24 hours'), new.created_at + interval '72 hours')
      else coalesce(new.ends_at, new.starts_at + interval '3 hours') end;
  end if;
  return new;
end $$;
create trigger t10_posts_prepare before insert or update on public.posts
  for each row execute function public.posts_prepare();

create or replace function public.posts_counters() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then update profiles set post_count = post_count + 1 where id = new.author_id; return new;
  else update profiles set post_count = greatest(post_count - 1, 0) where id = old.author_id; return old; end if;
end $$;
create trigger t50_posts_counters after insert or delete on public.posts
  for each row execute function public.posts_counters();

create or replace function public.comments_prepare() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); par comments; p posts; n int;
begin
  if tg_op = 'UPDATE' then
    new.post_id := old.post_id; new.author_id := old.author_id; new.parent_id := old.parent_id;
    new.root_id := old.root_id; new.depth := old.depth; new.is_answer := old.is_answer;
    new.created_at := old.created_at; new.updated_at := now();
    return new;
  end if;
  if uid is not null then
    new.author_id := uid; new.created_at := now();
    select count(*) into n from comments where author_id = uid and created_at > now() - interval '10 minutes';
    if n >= 20 then raise exception 'rate_limited_comments'; end if;
  end if;
  select * into p from posts where id = new.post_id;
  if not found then raise exception 'post_not_found'; end if;
  if public.is_blocked_between(new.author_id, p.author_id) then raise exception 'blocked'; end if;
  if new.parent_id is not null then
    select * into par from comments where id = new.parent_id;
    if not found or par.post_id <> new.post_id then raise exception 'bad_parent'; end if;
    if par.deleted_at is not null then raise exception 'parent_deleted'; end if;
    if par.depth >= 8 then raise exception 'thread_too_deep'; end if;
    if public.is_blocked_between(new.author_id, par.author_id) then raise exception 'blocked'; end if;
    new.depth := par.depth + 1; new.root_id := coalesce(par.root_id, par.id);
  else new.depth := 0; new.root_id := null; end if;
  new.is_answer := (new.depth = 0 and p.type = 'ask' and new.author_id <> p.author_id);
  return new;
end $$;
create trigger t10_comments_prepare before insert or update on public.comments
  for each row execute function public.comments_prepare();

create or replace function public.comments_counters() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare p posts; n int;
begin
  update posts set comment_count = comment_count + 1 where id = new.post_id returning * into p;
  if new.parent_id is not null then update comments set reply_count = reply_count + 1 where id = new.parent_id; end if;
  if new.is_answer then
    update posts set answer_count = answer_count + 1,
           first_answer_at = coalesce(first_answer_at, new.created_at) where id = new.post_id;
    update profiles set answer_count = answer_count + 1 where id = new.author_id returning answer_count into n;
    if n = 1 then perform public.award_badge(new.author_id, 'first_answer'); end if;
    if new.created_at - p.created_at <= interval '30 minutes' then
      select count(*) into n from comments c join posts pp on pp.id = c.post_id
       where c.author_id = new.author_id and c.is_answer and c.created_at - pp.created_at <= interval '30 minutes';
      if n >= 10 then perform public.award_badge(new.author_id, 'quick_responder'); end if;
    end if;
  end if;
  return new;
end $$;
create trigger t50_comments_counters after insert on public.comments
  for each row execute function public.comments_counters();

create trigger t90_comments_updated before update on public.comments for each row execute function public.set_updated_at();

-- Votes, reactions and confirmations (AFTER triggers, all definer):

create or replace function public.post_votes_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare p posts; cnt int;
begin
  if tg_op = 'INSERT' then
    select * into p from posts where id = new.post_id;
    if p.author_id = new.user_id then raise exception 'self_vote'; end if;
    update posts set upvote_count = upvote_count + 1 where id = new.post_id returning upvote_count into cnt;
    perform public.award_rep(p.author_id, new.user_id, 'post_upvote', new.post_id, 1);
    if cnt in (1,5,10,25,50,100) then
      perform public.notify(p.author_id, 'post_upvotes', null,
        case when cnt = 1 then 'A neighbor upvoted your post' else 'Your post reached ' || cnt || ' upvotes' end,
        p.title, p.id, null, null, null, '/post/' || p.id);
    end if;
    return new;
  end if;
  update posts set upvote_count = greatest(upvote_count - 1, 0) where id = old.post_id;
  perform public.revoke_rep('post_upvote', old.post_id, old.user_id);
  return old;
end $$;
create trigger t50_post_votes after insert or delete on public.post_votes for each row execute function public.post_votes_after();

create or replace function public.comment_votes_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare c comments; cnt int;
begin
  if tg_op = 'INSERT' then
    select * into c from comments where id = new.comment_id;
    if c.author_id = new.user_id then raise exception 'self_vote'; end if;
    update comments set upvote_count = upvote_count + 1 where id = new.comment_id returning upvote_count into cnt;
    perform public.award_rep(c.author_id, new.user_id, 'comment_upvote', new.comment_id, 2);
    if cnt in (1,5,10,25) then
      perform public.notify(c.author_id, 'comment_upvotes', null,
        case when cnt = 1 then 'A neighbor found your comment helpful' else cnt || ' neighbors found your comment helpful' end,
        left(c.body, 140), c.post_id, c.id, null, null, '/post/' || c.post_id || '?comment=' || c.id);
    end if;
    return new;
  end if;
  update comments set upvote_count = greatest(upvote_count - 1, 0) where id = old.comment_id;
  perform public.revoke_rep('comment_upvote', old.comment_id, old.user_id);
  return old;
end $$;
create trigger t50_comment_votes after insert or delete on public.comment_votes for each row execute function public.comment_votes_after();

-- Reaction counters (no reputation, no notifications). Same pattern for comments.
create or replace function public.post_reactions_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    update posts set reaction_counts = jsonb_set(reaction_counts, array[new.reaction],
      to_jsonb(coalesce((reaction_counts->>new.reaction)::int, 0) + 1)) where id = new.post_id;
    return new;
  end if;
  update posts set reaction_counts = jsonb_set(reaction_counts, array[old.reaction],
    to_jsonb(greatest(coalesce((reaction_counts->>old.reaction)::int, 0) - 1, 0))) where id = old.post_id;
  return old;
end $$;
create trigger t50_post_reactions after insert or delete on public.post_reactions for each row execute function public.post_reactions_after();

create or replace function public.comment_reactions_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    update comments set reaction_counts = jsonb_set(reaction_counts, array[new.reaction],
      to_jsonb(coalesce((reaction_counts->>new.reaction)::int, 0) + 1)) where id = new.comment_id;
    return new;
  end if;
  update comments set reaction_counts = jsonb_set(reaction_counts, array[old.reaction],
    to_jsonb(greatest(coalesce((reaction_counts->>old.reaction)::int, 0) - 1, 0))) where id = old.comment_id;
  return old;
end $$;
create trigger t50_comment_reactions after insert or delete on public.comment_reactions for each row execute function public.comment_reactions_after();

create or replace function public.alert_confirmations_after() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare p posts; n int;
begin
  select * into p from posts where id = new.post_id;
  if p.type <> 'alert' then raise exception 'not_an_alert'; end if;
  if p.author_id = new.user_id then raise exception 'own_post'; end if;
  if new.kind = 'still_on' then
    update posts set still_on_count = still_on_count + 1, last_confirmed_at = now(),
           expires_at = greatest(expires_at, now() + interval '24 hours') where id = p.id;
    perform public.award_rep(p.author_id, new.user_id, 'alert_confirmed', p.id, 1);
    if p.still_on_count + 1 in (1,5) then
      perform public.notify(p.author_id, 'alert_confirmed', new.user_id,
        (p.still_on_count + 1) || case when p.still_on_count = 0 then ' neighbor' else ' neighbors' end || ' confirmed your alert is still on',
        p.title, p.id, null, null, null, '/post/' || p.id);
    end if;
    if p.still_on_count + 1 = 2 then
      select count(*) into n from posts where author_id = p.author_id and type = 'alert' and still_on_count >= 2;
      if n >= 5 then perform public.award_badge(p.author_id, 'alert_scout'); end if;
    end if;
  else
    update posts set resolved_count = resolved_count + 1, last_confirmed_at = now(),
           status = case when resolved_count + 1 >= 2 then 'resolved'::post_status else status end where id = p.id;
    if p.resolved_count + 1 = 2 then
      perform public.notify(p.author_id, 'alert_confirmed', null, 'Neighbors marked your alert as resolved',
        p.title, p.id, null, null, null, '/post/' || p.id);
    end if;
  end if;
  return new;
end $$;
create trigger t50_alert_confirmations after insert on public.alert_confirmations for each row execute function public.alert_confirmations_after();

-- Solved, delete comment and reveal phone:

create or replace function public._set_solved(p_post uuid, p_comment uuid) returns void language plpgsql
security definer set search_path = public, extensions as $$
declare p posts; oc comments; nc comments; n int;
begin
  select * into p from posts where id = p_post for update;
  if p.solved_comment_id is not null then
    select * into oc from comments where id = p.solved_comment_id;
    perform public.revoke_rep('answer_solved', p.solved_comment_id, p.author_id);
    update profiles set solved_count = greatest(solved_count - 1, 0) where id = oc.author_id;
  end if;
  if p_comment is null then
    update posts set solved_comment_id = null, solved_at = null where id = p_post; return;
  end if;
  select * into nc from comments where id = p_comment;
  update posts set solved_comment_id = p_comment, solved_at = greatest(now(), nc.created_at) where id = p_post;
  update profiles set solved_count = solved_count + 1 where id = nc.author_id returning solved_count into n;
  perform public.award_rep(nc.author_id, p.author_id, 'answer_solved', p_comment, 15);
  if n >= 5  then perform public.award_badge(nc.author_id, 'helper'); end if;
  if n >= 25 then perform public.award_badge(nc.author_id, 'super_helper'); end if;
  perform public.notify(nc.author_id, 'answer_solved', p.author_id, 'Your answer solved it', p.title,
                        p.id, nc.id, null, null, '/post/' || p.id || '?comment=' || nc.id);
end $$;

create or replace function public.mark_solved(p_post uuid, p_comment uuid) returns void language plpgsql
security definer set search_path = public, extensions as $$
declare p posts;
begin
  select * into p from posts where id = p_post;
  if not found then raise exception 'not_found'; end if;
  if p.author_id is distinct from auth.uid() then raise exception 'not_allowed'; end if;
  if p_comment is null or p.solved_comment_id = p_comment then perform public._set_solved(p_post, null); return; end if;
  if not exists (select 1 from comments where id = p_comment and post_id = p_post and is_answer
                 and deleted_at is null and mod_status = 'visible') then raise exception 'not_an_answer'; end if;
  perform public._set_solved(p_post, p_comment);
end $$;

create or replace function public.delete_comment(p_id uuid) returns void language plpgsql
security definer set search_path = public, extensions as $$
declare c comments; p posts;
begin
  select * into c from comments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  select * into p from posts where id = c.post_id;
  if c.author_id <> auth.uid() and not public.is_admin() and not public.is_community_mod(p.community_id) then
    raise exception 'not_allowed'; end if;
  update comments set deleted_at = now(), body = '[deleted]' where id = p_id;
  if p.solved_comment_id = p_id then perform public._set_solved(p.id, null); end if;
end $$;

create or replace function public.reveal_post_phone(p_post uuid) returns text language sql stable
security definer set search_path = public, extensions as $$
  select phone_e164 from posts where id = p_post and mod_status = 'visible' and public.can_participate() $$;
