-- ============================================================
-- pincode · your neighborhood — combined schema migration
-- Generated from supabase/migrations/*.sql. Run this ONCE in
-- your Supabase project's SQL Editor (paste, then Run).
-- Safe to re-run: every statement is create-or-replace / if-not-exists
-- style per the individual migration files, except 'create table'
-- which will error on a second run (that's fine, it means it's already applied).
-- ============================================================

-- ---- 20260927000100_extensions_helpers.sql ----
set search_path = public, extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pg_net   with schema extensions;   -- functions live in schema "net"

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Start of "today" in India, used for daily reputation caps.
create or replace function public.ist_day_start() returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata' $$;

-- '+91XXXXXXXXXX' or null. Accepts '98450 12345', '+91-9845012345', '09845012345', '919845012345'.
create or replace function public.normalize_phone_in(p text) returns text
language plpgsql immutable set search_path = public, extensions as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if length(d) = 12 and left(d,2) = '91' then d := right(d,10);
  elsif length(d) = 11 and left(d,1) = '0' then d := right(d,10); end if;
  if d ~ '^[6-9][0-9]{9}$' then return '+91' || d; end if;
  return null;
end $$;

-- 'carpenter hoodi' -> 'carpent:* & hoodi:*' (english stemming + prefix). Null for empty input.
create or replace function public.to_prefix_tsquery(p_q text) returns tsquery
language sql immutable set search_path = public, extensions as $$
  select case when w = '' then null else to_tsquery('english', w) end
  from (select coalesce(string_agg(t || ':*', ' & '), '') w
        from unnest(regexp_split_to_array(lower(trim(regexp_replace(coalesce(p_q,''), '[^[:alnum:][:space:]]', ' ', 'g'))), '\s+')) t
        where t <> '') s $$;

-- ---- 20260927000200_profiles.sql ----
set search_path = public, extensions;
create type public.user_role as enum ('user','admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique,
  display_name text not null default '' check (char_length(display_name) <= 50),
  avatar_url text,
  bio text not null default '' check (char_length(bio) <= 300),
  interests text[] not null default '{}' check (cardinality(interests) <= 15),
  home_pincode text check (home_pincode ~ '^[1-9][0-9]{5}$'),
  home_area text check (char_length(home_area) <= 60),
  home_city text check (char_length(home_city) <= 60),
  role public.user_role not null default 'user',
  reputation int not null default 0,
  post_count int not null default 0,
  answer_count int not null default 0,
  solved_count int not null default 0,
  community_count int not null default 0,
  strike_count int not null default 0,
  banned_until timestamptz,
  ban_permanent boolean not null default false,
  username_changed_at timestamptz,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username is null or username::text ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$')
);
alter table public.profiles enable row level security;
create index profiles_username_trgm on public.profiles using gin ((username::text) gin_trgm_ops);
create index profiles_display_trgm  on public.profiles using gin (display_name gin_trgm_ops);
create trigger t90_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.private_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  email citext unique,
  phone_e164 text unique check (phone_e164 ~ '^\+91[6-9][0-9]{9}$'),
  phone_verified boolean not null default false,
  home_location geography(Point,4326),
  notification_prefs jsonb not null default
    '{"replies":true,"answers":true,"votes":true,"alerts":true,"messages":true,"communities":true}',
  created_at timestamptz not null default now()
);
alter table public.private_profiles enable row level security;
create index private_profiles_home_gix on public.private_profiles using gist (home_location);

create table public.reserved_usernames (name citext primary key);
alter table public.reserved_usernames enable row level security;
insert into public.reserved_usernames(name) values
 ('admin'),('administrator'),('pincode'),('pincodeteam'),('team'),('support'),('help'),('moderator'),
 ('mod'),('system'),('official'),('staff'),('root'),('null'),('undefined'),('me'),('settings'),
 ('api'),('www'),('mohalla'),('security'),('safety'),('contact'),('about');

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
create index blocks_blocked_idx on public.blocks(blocked_id);

-- New auth user -> profile rows
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, display_name, avatar_url, created_at)
  values (new.id,
          left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), 50),
          new.raw_user_meta_data->>'avatar_url',
          coalesce(new.created_at, now()));
  insert into public.private_profiles (id, email) values (new.id, lower(new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin update public.private_profiles set email = lower(new.email) where id = new.id; return new; end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Helpers (used by RLS: must stay EXECUTE-able by anon/authenticated)
create or replace function public.is_admin() returns boolean language sql stable security definer
set search_path = public, extensions as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.is_banned(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select ban_permanent or (banned_until is not null and banned_until > now())
                   from profiles where id = p_uid), false) $$;

create or replace function public.can_participate(p_uid uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from profiles p where p.id = p_uid and p.onboarded_at is not null
                 and not p.ban_permanent and (p.banned_until is null or p.banned_until <= now())) $$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)) $$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(p_username,'') ~ '^[A-Za-z][A-Za-z0-9_]{2,19}$'
     and p_username !~* '(pincode|admin|moderator|official|support|staff)'
     and not exists (select 1 from reserved_usernames r where r.name = p_username::citext)
     and not exists (select 1 from profiles p where p.username = p_username::citext
                     and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)) $$;

create or replace function public.email_available(p_email text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select not exists (select 1 from auth.users where lower(email) = lower(trim(p_email))) $$;

create or replace function public.phone_available(p_phone text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select public.normalize_phone_in(p_phone) is not null
     and not exists (select 1 from private_profiles where phone_e164 = public.normalize_phone_in(p_phone)
                     and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)) $$;

create or replace function public.suggest_usernames(p_hint text default null, p_count int default 6)
returns setof text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  adjs  text[] := array['sunny','leafy','quiet','friendly','breezy','early','lakeside','cozy','bright','kind',
                        'nimble','misty','humble','jolly','swift','calm','cheery','curious','chill','rainy'];
  nouns text[] := array['neem','banyan','gulmohar','mango','jasmine','chai','dosa','idli','coffee','auto','metro',
                        'lane','nukkad','chowk','terrace','koel','myna','parrot','kolam','jamun','tulsi','bakery',
                        'mali','cycle','peepal'];
  hint text := left(lower(regexp_replace(coalesce(p_hint,''), '[^A-Za-z]', '', 'g')), 10);
  cand text; found text[] := '{}'; i int := 0; want int := least(greatest(coalesce(p_count,6),1),10);
begin
  while coalesce(array_length(found,1),0) < want and i < 80 loop
    i := i + 1;
    if length(hint) >= 3 and i % 2 = 0 then
      cand := hint || '_' || nouns[1 + floor(random()*array_length(nouns,1))::int] || (10 + floor(random()*90))::int;
    else
      cand := adjs[1 + floor(random()*array_length(adjs,1))::int] || '_'
           || nouns[1 + floor(random()*array_length(nouns,1))::int] || (10 + floor(random()*90))::int;
    end if;
    cand := left(cand, 20);
    if public.username_available(cand) and not (cand = any(found)) then found := array_append(found, cand); end if;
  end loop;
  return query select unnest(found);
end $$;

create or replace function public.complete_onboarding(
  p_username text, p_display_name text, p_phone text, p_interests text[],
  p_home_pincode text, p_home_area text, p_home_city text,
  p_lat double precision, p_lng double precision)
returns public.profiles language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); v_phone text; v_interests text[]; v_row profiles; v_first boolean;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_username,'') !~ '^[A-Za-z][A-Za-z0-9_]{2,19}$' then raise exception 'username_invalid'; end if;
  if not public.username_available(p_username) then
    if exists (select 1 from profiles where username = p_username::citext and id <> uid) then raise exception 'username_taken'; end if;
    raise exception 'username_reserved';
  end if;
  if char_length(trim(coalesce(p_display_name,''))) not between 1 and 50 then raise exception 'display_name_invalid'; end if;
  if trim(p_display_name) ~* '^\s*(pincode|admin|moderator)' then raise exception 'display_name_reserved'; end if;
  v_phone := public.normalize_phone_in(p_phone);
  if v_phone is null then raise exception 'phone_invalid'; end if;
  if exists (select 1 from private_profiles where phone_e164 = v_phone and id <> uid) then raise exception 'phone_taken'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_interests
    from (select left(lower(trim(i)), 24) x from unnest(coalesce(p_interests,'{}')) i where trim(i) <> '' limit 15) s;
  select onboarded_at is null into v_first from profiles where id = uid;
  update profiles set username = p_username, display_name = trim(p_display_name), interests = v_interests,
         home_pincode = nullif(p_home_pincode,''), home_area = nullif(p_home_area,''), home_city = nullif(p_home_city,''),
         onboarded_at = coalesce(onboarded_at, now())
   where id = uid returning * into v_row;
  update private_profiles set phone_e164 = v_phone,
         home_location = case when p_lat is null or p_lng is null then null
                              else st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography end
   where id = uid;
  if v_first then
    if now() < timestamptz '2027-04-01' then perform public.award_badge(uid, 'early_neighbor'); end if;
    perform public._send_system_message(uid,
      'Welcome to pincode. Ask your neighborhood anything: recommendations, alerts, events. Be kind, keep it local, and never share OTPs or pay "registration fees". This chat is where the pincode Team will contact you.');
  end if;
  return v_row;
exception when unique_violation then raise exception 'username_or_phone_taken';
end $$;

create or replace function public.change_username(p_username text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare last timestamptz;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select username_changed_at into last from profiles where id = auth.uid();
  if last is not null and last > now() - interval '30 days' then raise exception 'username_change_too_soon'; end if;
  if not public.username_available(p_username) then raise exception 'username_taken'; end if;
  update profiles set username = p_username, username_changed_at = now() where id = auth.uid();
exception when unique_violation then raise exception 'username_taken';
end $$;

create or replace function public.update_phone(p_phone text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v text := public.normalize_phone_in(p_phone);
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if v is null then raise exception 'phone_invalid'; end if;
  update private_profiles set phone_e164 = v, phone_verified = false where id = auth.uid();
exception when unique_violation then raise exception 'phone_taken';
end $$;

create or replace function public.set_home_location(p_lat double precision, p_lng double precision,
  p_pincode text, p_area text, p_city text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update private_profiles set home_location = st_setsrid(st_makepoint(p_lng,p_lat),4326)::geography where id = auth.uid();
  update profiles set home_pincode = nullif(p_pincode,''), home_area = nullif(p_area,''), home_city = nullif(p_city,'') where id = auth.uid();
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  delete from auth.users where id = auth.uid();   -- cascades to profiles and all owned rows
end $$;

-- get_profile() is defined in 20260927001200_p9_fixes.sql (P9 fix (c)):
-- its body references badges/user_badges/communities/community_members/
-- conversations, which don't exist yet at this point in the migration order.

-- Profile edits: block reserved and abusive names (content filter defined in 0900)
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  if auth.uid() is null or auth.uid() <> new.id then return new; end if;
  if new.display_name is distinct from old.display_name and new.display_name ~* '^\s*(pincode|admin|moderator)' then
    raise exception 'display_name_reserved'; end if;
  if new.display_name is distinct from old.display_name or new.bio is distinct from old.bio then
    r := public.moderate_text(new.display_name || E'\n' || new.bio, 'profile', new.id);
    if r->>'action' <> 'allow' then raise exception 'content_blocked'; end if;
  end if;
  return new;
end $$;
create trigger t20_profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- ---- 20260927000300_posts_comments.sql ----
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

-- ---- 20260927000400_reputation_badges.sql ----
set search_path = public, extensions;
create table public.reputation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('post_upvote','comment_upvote','answer_solved','alert_confirmed','moderation_penalty')),
  source_id uuid not null,
  points int not null,
  created_at timestamptz not null default now(),
  unique (kind, source_id, actor_id)
);
alter table public.reputation_events enable row level security;
create index rep_user_day_idx on public.reputation_events (user_id, created_at);

create or replace function public.award_rep(p_user uuid, p_actor uuid, p_kind text, p_source uuid, p_points int)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v int := p_points; v_day timestamptz := public.ist_day_start(); v_today int; v_pair int; v_age interval; v_rep int;
begin
  if p_user is null or p_user = p_actor then return; end if;
  if auth.uid() is not null and p_kind <> 'moderation_penalty' then
    select now() - created_at into v_age from profiles where id = p_actor;
    if v_age < interval '24 hours' then v := 0; end if;
    if p_kind in ('post_upvote','comment_upvote','alert_confirmed') then
      select coalesce(sum(points),0) into v_today from reputation_events
       where user_id = p_user and kind in ('post_upvote','comment_upvote','alert_confirmed') and created_at >= v_day;
      v := case when v_today >= 50 then 0 else least(v, 50 - v_today) end;
      select coalesce(sum(points),0) into v_pair from reputation_events
       where user_id = p_user and actor_id = p_actor and created_at >= v_day;
      if v_pair >= 5 then v := 0; end if;
    elsif p_kind = 'answer_solved' then
      select count(*) into v_pair from reputation_events
       where user_id = p_user and actor_id = p_actor and kind = 'answer_solved' and points > 0
         and created_at > now() - interval '7 days';
      if v_pair >= 3 then v := 0; end if;
    end if;
  end if;
  insert into reputation_events(user_id, actor_id, kind, source_id, points)
  values (p_user, p_actor, p_kind, p_source, v) on conflict (kind, source_id, actor_id) do nothing;
  if found and v <> 0 then
    update profiles set reputation = reputation + v where id = p_user returning reputation into v_rep;
    if v_rep >= 500 then perform public.award_badge(p_user, 'trusted_neighbor'); end if;
  end if;
end $$;

create or replace function public.revoke_rep(p_kind text, p_source uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare r record;
begin
  delete from reputation_events where kind = p_kind and source_id = p_source and actor_id = p_actor
  returning user_id, points into r;
  if found and r.points <> 0 then update profiles set reputation = reputation - r.points where id = r.user_id; end if;
end $$;

create table public.badges (code text primary key, name text not null, description text not null, sort int not null);
create table public.user_badges (
  user_id uuid references public.profiles(id) on delete cascade,
  badge_code text references public.badges(code),
  awarded_at timestamptz not null default now(),
  primary key (user_id, badge_code));
alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
insert into public.badges(code,name,description,sort) values
 ('early_neighbor','Early neighbor','Joined pincode in its first months',10),
 ('first_answer','First answer','Answered a neighbor''s ask',20),
 ('quick_responder','Quick responder','10 answers posted within 30 minutes of the ask',30),
 ('helper','Helper','5 answers marked "This solved it"',40),
 ('super_helper','Super helper','25 answers marked "This solved it"',50),
 ('alert_scout','Alert scout','5 alerts confirmed by at least two neighbors',60),
 ('trusted_neighbor','Trusted neighbor','Reached 500 reputation',70),
 ('community_founder','Community founder','Started a community',80),
 ('community_moderator','Community moderator','Moderates a community',90);

create or replace function public.award_badge(p_user uuid, p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_name text;
begin
  insert into user_badges(user_id, badge_code) values (p_user, p_code) on conflict do nothing;
  if found then
    select name into v_name from badges where code = p_code;
    perform public.notify(p_user, 'badge_earned', null, 'New badge: ' || v_name, '', null, null, null, null, '/(tabs)/profile');
  end if;
end $$;

-- ---- 20260927000500_notifications_push.sql ----
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

-- ---- 20260927000600_messaging.sql ----
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

-- ---- 20260927000700_communities.sql ----
set search_path = public, extensions;
create type public.community_kind as enum ('area','interest');
create type public.community_role as enum ('owner','moderator','member');

create table public.communities (
  id uuid primary key default gen_random_uuid(),
  slug citext not null unique check (slug::text ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name text not null check (char_length(name) between 3 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  rules text[] not null default '{}' check (cardinality(rules) <= 10),
  kind public.community_kind not null,
  category text not null check (category in ('area','parents','pets','fitness','running','cycling','sports',
    'food','books','gardening','environment','volunteering','arts','music','tech','seniors','women',
    'students','spiritual','events','civic','other')),
  lat double precision not null, lng double precision not null,
  center geography(Point,4326) generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  radius_km numeric(5,2) not null default 3 check (radius_km between 0.5 and 25),
  pincode text, area text, city text,
  owner_id uuid references public.profiles(id) on delete set null,
  member_count int not null default 0,
  post_count int not null default 0,
  is_removed boolean not null default false,
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name,'')), 'A') ||
    setweight(to_tsvector('english', coalesce(category,'') || ' ' || coalesce(area,'')), 'B') ||
    setweight(to_tsvector('english', coalesce(description,'')), 'C')) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.community_members (
  community_id uuid references public.communities(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role public.community_role not null default 'member',
  notify_posts boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
create table public.community_bans (
  community_id uuid references public.communities(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text, created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_bans enable row level security;
create index communities_center_gix on public.communities using gist (center);
create index communities_tsv_gin on public.communities using gin (search_tsv);
create index communities_name_trgm on public.communities using gin (name gin_trgm_ops);
create index community_members_user_idx on public.community_members (user_id);
alter table public.posts add constraint posts_community_fk foreign key (community_id) references public.communities(id) on delete set null;
alter table public.notifications add constraint notifications_comm_fk foreign key (community_id) references public.communities(id) on delete cascade;
create trigger t90_communities_updated before update on public.communities for each row execute function public.set_updated_at();

create or replace function public.is_community_mod(p_comm uuid) returns boolean language sql stable
security definer set search_path = public, extensions as $$
  select p_comm is not null and (public.is_admin() or exists (select 1 from community_members
         where community_id = p_comm and user_id = auth.uid() and role in ('owner','moderator'))) $$;

-- Eligibility: reputation >= 100, account age >= 30 days, no strike in the last 90 days,
-- not banned, onboarded, and fewer than 3 owned (non-removed) communities.
create or replace function public.can_create_community() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); p profiles; v_age int; v_owned int; v_strike boolean; reasons text[] := '{}';
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into p from profiles where id = uid;
  v_age := extract(day from now() - p.created_at)::int;
  select count(*) into v_owned from communities where owner_id = uid and not is_removed;
  select exists(select 1 from strikes where user_id = uid and created_at > now() - interval '90 days') into v_strike;
  if p.onboarded_at is null or p.ban_permanent or (p.banned_until is not null and p.banned_until > now()) then
    reasons := array_append(reasons, 'account_status');
  end if;
  if coalesce(p.reputation,0) < 100 then reasons := array_append(reasons, 'reputation'); end if;
  if v_age < 30 then reasons := array_append(reasons, 'account_age'); end if;
  if v_strike then reasons := array_append(reasons, 'recent_strike'); end if;
  if v_owned >= 3 then reasons := array_append(reasons, 'owned_limit'); end if;
  return jsonb_build_object('allowed', cardinality(reasons) = 0, 'reasons', to_jsonb(reasons),
    'reputation', coalesce(p.reputation,0), 'required_reputation', 100,
    'account_age_days', v_age, 'required_age_days', 30,
    'owned', v_owned, 'max_owned', 3);
end $$;

create or replace function public.slug_available(p_slug text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(p_slug,'') ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     and not exists (select 1 from communities where slug = p_slug::citext) $$;

create or replace function public.create_community(p_slug text, p_name text, p_description text, p_rules text[],
  p_kind public.community_kind, p_category text, p_lat double precision, p_lng double precision,
  p_radius_km numeric, p_pincode text, p_area text, p_city text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); v_elig jsonb; r jsonb; v_rules text; v_id uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  v_elig := public.can_create_community();
  if not (v_elig->>'allowed')::boolean then raise exception 'community_not_eligible'; end if;
  if coalesce(p_slug,'') !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'slug_invalid'; end if;
  if exists (select 1 from communities where slug = p_slug::citext) then raise exception 'slug_taken'; end if;
  select array_to_string(coalesce(p_rules,'{}'), E'\n') into v_rules;
  r := public.moderate_text(coalesce(p_name,'') || E'\n' || coalesce(p_description,'') || E'\n' || coalesce(v_rules,''),
                            'community', uid);
  if r->>'action' <> 'allow' then raise exception 'content_blocked'; end if;
  insert into communities(slug, name, description, rules, kind, category, lat, lng, radius_km, pincode, area, city, owner_id)
  values (p_slug, p_name, coalesce(p_description,''), coalesce(p_rules,'{}'), p_kind, p_category, p_lat, p_lng,
          p_radius_km, nullif(p_pincode,''), nullif(p_area,''), nullif(p_city,''), uid) returning id into v_id;
  insert into community_members(community_id, user_id, role) values (v_id, uid, 'owner');
  perform public.award_badge(uid, 'community_founder');
  return p_slug;
exception when unique_violation then raise exception 'slug_taken';
end $$;

create or replace function public.update_community(p_id uuid, p_name text, p_description text, p_rules text[],
  p_category text, p_radius_km numeric) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); c communities; is_owner boolean; v_rules text; r jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from communities where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if not public.is_community_mod(p_id) then raise exception 'not_allowed'; end if;
  is_owner := (c.owner_id = uid) or public.is_admin();
  if (p_name is distinct from c.name or p_category is distinct from c.category or p_radius_km is distinct from c.radius_km)
     and not is_owner then raise exception 'not_allowed'; end if;
  select array_to_string(coalesce(p_rules,'{}'), E'\n') into v_rules;
  r := public.moderate_text(coalesce(p_name,'') || E'\n' || coalesce(p_description,'') || E'\n' || coalesce(v_rules,''),
                            'community', uid);
  if r->>'action' <> 'allow' then raise exception 'content_blocked'; end if;
  update communities set name = coalesce(p_name, name), description = coalesce(p_description, description),
    rules = coalesce(p_rules, rules), category = coalesce(p_category, category),
    radius_km = coalesce(p_radius_km, radius_km) where id = p_id;
end $$;

create or replace function public.set_community_role(p_comm uuid, p_user uuid, p_role public.community_role) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); c communities; m community_members;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from communities where id = p_comm;
  if not found then raise exception 'not_found'; end if;
  if c.owner_id <> uid and not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_role not in ('moderator','member') then raise exception 'bad_decision'; end if;
  select * into m from community_members where community_id = p_comm and user_id = p_user;
  if not found or m.role = 'owner' then raise exception 'not_found'; end if;
  update community_members set role = p_role where community_id = p_comm and user_id = p_user;
  if p_role = 'moderator' then perform public.award_badge(p_user, 'community_moderator'); end if;
  perform public.notify(p_user, 'community_role', uid,
    case when p_role = 'moderator' then 'You are now a moderator of ' || c.name
         else 'Your moderator role in ' || c.name || ' was removed' end,
    '', null, null, c.id, null, '/community/' || c.slug::text);
end $$;

create or replace function public.remove_community_member(p_comm uuid, p_user uuid, p_reason text,
  p_ban boolean default true) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); c communities; m community_members;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_community_mod(p_comm) then raise exception 'not_allowed'; end if;
  select * into c from communities where id = p_comm;
  select * into m from community_members where community_id = p_comm and user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if m.role = 'owner' then raise exception 'not_allowed'; end if;
  if m.role = 'moderator' and c.owner_id <> uid and not public.is_admin() then raise exception 'not_allowed'; end if;
  delete from community_members where community_id = p_comm and user_id = p_user;
  if p_ban then
    insert into community_bans(community_id, user_id, banned_by, reason) values (p_comm, p_user, uid, p_reason)
    on conflict do nothing;
  end if;
  perform public.notify(p_user, 'community_member_removed', uid,
    'You were removed from ' || c.name, coalesce(p_reason,''), null, null, c.id, null, '/community/' || c.slug::text);
end $$;

create or replace function public.unban_community_member(p_comm uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_community_mod(p_comm) then raise exception 'not_allowed'; end if;
  delete from community_bans where community_id = p_comm and user_id = p_user;
end $$;

create or replace function public.mod_set_post_removed(p_post uuid, p_removed boolean, p_reason text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare p posts; c communities;
begin
  select * into p from posts where id = p_post;
  if not found then raise exception 'not_found'; end if;
  if p.community_id is null or not public.is_community_mod(p.community_id) then raise exception 'not_allowed'; end if;
  select * into c from communities where id = p.community_id;
  update posts set community_removed = p_removed where id = p_post;
  if p_removed then
    perform public.notify(p.author_id, 'community_post_removed', auth.uid(),
      'Your post was removed from ' || c.name, coalesce(p_reason,''), p.id, null, c.id, null, '/post/' || p.id);
  end if;
end $$;

-- t30 on posts: posting into a community requires membership (bans are enforced because banned users are not members)
create or replace function public.posts_community_check() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if new.community_id is null or auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.community_id is not distinct from old.community_id then return new; end if;
  if exists (select 1 from communities where id = new.community_id and is_removed) then raise exception 'community_unavailable'; end if;
  if not exists (select 1 from community_members where community_id = new.community_id and user_id = new.author_id) then
    raise exception 'not_a_member'; end if;
  return new;
end $$;
create trigger t30_posts_community_check before insert or update of community_id on public.posts
  for each row execute function public.posts_community_check();

-- t50: adjusts communities.post_count on post insert/delete
create or replace function public.posts_community_count() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    if new.community_id is not null then update communities set post_count = post_count + 1 where id = new.community_id; end if;
    return new;
  else
    if old.community_id is not null then update communities set post_count = greatest(post_count - 1, 0) where id = old.community_id; end if;
    return old;
  end if;
end $$;
create trigger t50_posts_community_count after insert or delete on public.posts
  for each row execute function public.posts_community_count();

-- t60: notify community members with notify_posts on a new visible community post
create or replace function public.posts_notify_community() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare c communities;
begin
  if new.community_id is null or new.mod_status <> 'visible' then return new; end if;
  select * into c from communities where id = new.community_id;
  insert into notifications(user_id, kind, actor_id, title, body, post_id, community_id, data)
  select m.user_id, 'community_new_post', new.author_id, left('New in ' || c.name || ': ' || new.title, 140),
         left(new.body, 200), new.id, c.id, jsonb_build_object('url', '/post/' || new.id)
  from community_members m
  where m.community_id = new.community_id and m.notify_posts and m.user_id <> new.author_id
  limit 500;
  return new;
end $$;
create trigger t60_posts_notify_community after insert on public.posts
  for each row execute function public.posts_notify_community();

-- t50: adjusts communities.member_count and profiles.community_count
create or replace function public.community_members_counters() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    update communities set member_count = member_count + 1 where id = new.community_id;
    update profiles set community_count = community_count + 1 where id = new.user_id;
    return new;
  else
    update communities set member_count = greatest(member_count - 1, 0) where id = old.community_id;
    update profiles set community_count = greatest(community_count - 1, 0) where id = old.user_id;
    return old;
  end if;
end $$;
create trigger t50_community_members_counters after insert or delete on public.community_members
  for each row execute function public.community_members_counters();

-- t10: the owner cannot leave (delete their own membership) unless an admin is removing them
create or replace function public.community_members_guard() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if old.role = 'owner' and not public.is_admin() then raise exception 'owner_cannot_leave'; end if;
  return old;
end $$;
create trigger t10_community_members_guard before delete on public.community_members
  for each row execute function public.community_members_guard();

-- ---- 20260927000800_feed_search.sql ----
set search_path = public, extensions;
create or replace view public.post_cards with (security_invoker = true) as
select p.id, p.author_id, p.community_id, p.type, p.kind, p.tag, p.title, p.body, p.has_phone,
       p.lat, p.lng, p.loc_precision, p.pincode, p.area, p.city, p.starts_at, p.ends_at, p.expires_at,
       p.status, p.mod_status, p.community_removed, p.upvote_count, p.comment_count, p.answer_count,
       p.first_answer_at, p.solved_comment_id, p.solved_at, p.still_on_count, p.resolved_count,
       p.last_confirmed_at, p.reaction_counts, p.created_at, p.updated_at,
       (p.expires_at < now()) as is_expired,
       a.username::text as author_username, a.display_name as author_display_name,
       a.avatar_url as author_avatar_url, a.reputation as author_reputation,
       c.slug::text as community_slug, c.name as community_name,
       exists (select 1 from public.post_votes v where v.post_id = p.id and v.user_id = auth.uid()) as my_vote,
       array(select r.reaction from public.post_reactions r where r.post_id = p.id and r.user_id = auth.uid()) as my_reactions,
       (select ac.kind from public.alert_confirmations ac where ac.post_id = p.id and ac.user_id = auth.uid()) as my_confirmation
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.communities c on c.id = p.community_id;

create or replace view public.comment_cards with (security_invoker = true) as
select cm.id, cm.post_id, cm.author_id, cm.parent_id, cm.root_id, cm.depth,
       case when cm.deleted_at is null then cm.body else '' end as body,
       (cm.deleted_at is not null) as is_deleted, cm.is_answer, cm.upvote_count, cm.reply_count,
       cm.reaction_counts, cm.mod_status, cm.created_at, cm.updated_at,
       p.title as post_title,
       a.username::text as author_username, a.display_name as author_display_name,
       a.avatar_url as author_avatar_url, a.reputation as author_reputation,
       exists (select 1 from public.comment_votes v where v.comment_id = cm.id and v.user_id = auth.uid()) as my_vote,
       array(select r.reaction from public.comment_reactions r where r.comment_id = cm.id and r.user_id = auth.uid()) as my_reactions
from public.comments cm
join public.posts p on p.id = cm.post_id
join public.profiles a on a.id = cm.author_id;

create or replace view public.community_cards with (security_invoker = true) as
select c.id, c.slug::text as slug, c.name, c.description, c.rules, c.kind, c.category, c.lat, c.lng,
       c.radius_km, c.pincode, c.area, c.city, c.owner_id, c.member_count, c.post_count, c.created_at,
       (select m.role from public.community_members m where m.community_id = c.id and m.user_id = auth.uid()) as my_role,
       (select m.notify_posts from public.community_members m where m.community_id = c.id and m.user_id = auth.uid()) as my_notify_posts
from public.communities c where not c.is_removed;

-- posts_near() is defined in 20260927001200_p9_fixes.sql (P9 fix (c)):
-- its body references public.reports, which isn't created until
-- 20260927000900_moderation.sql (later than this file).

create or replace function public.search_posts(p_q text, p_lat double precision, p_lng double precision,
  p_max_km double precision default 50, p_near_km double precision default 5, p_limit int default 30, p_offset int default 0)
returns setof public.post_cards language sql stable security invoker set search_path = public, extensions as $$
  with q as (select public.to_prefix_tsquery(p_q) tsq),
       o as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g)
  select c.* from public.post_cards c join public.posts p on p.id = c.id, q, o
  where q.tsq is not null
    and st_dwithin(p.location, o.g, p_max_km * 1000)
    and p.mod_status = 'visible' and not p.community_removed
    and ((p.status = 'active' and p.expires_at > now()) or p.type = 'ask')   -- past Asks stay findable
    and (p.search_tsv @@ q.tsq or p.title % p_q
         or exists (select 1 from public.comments cm where cm.post_id = p.id and cm.mod_status = 'visible'
                    and cm.deleted_at is null and cm.search_tsv @@ q.tsq))
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
  order by (st_distance(p.location, o.g) > p_near_km * 1000), ts_rank(p.search_tsv, q.tsq) desc, p.created_at desc
  limit least(p_limit, 100) offset p_offset $$;

create or replace function public.search_users(p_q text, p_limit int default 30, p_offset int default 0)
returns table (id uuid, username text, display_name text, avatar_url text, bio text, reputation int, home_area text)
language sql stable security invoker set search_path = public, extensions as $$
  with t as (select ltrim(trim(coalesce(p_q,'')), '@') s)
  select pr.id, pr.username::text, pr.display_name, pr.avatar_url, pr.bio, pr.reputation, pr.home_area
  from public.profiles pr, t
  where length(t.s) >= 2 and pr.onboarded_at is not null and not pr.ban_permanent
    and (pr.username::text ilike replace(replace(t.s,'%','\%'),'_','\_') || '%'
         or pr.display_name ilike '%' || replace(replace(t.s,'%','\%'),'_','\_') || '%'
         or pr.username::text % t.s or pr.display_name % t.s)
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = pr.id)
  order by (pr.username::text ilike t.s || '%') desc,
           greatest(similarity(pr.username::text, t.s), similarity(pr.display_name, t.s)) desc, pr.reputation desc
  limit least(p_limit, 50) offset p_offset $$;

create or replace function public.communities_near(p_lat double precision, p_lng double precision,
  p_radius_km double precision default 25, p_category text default null, p_kind public.community_kind default null,
  p_sort text default 'nearby', p_q text default null, p_limit int default 50, p_offset int default 0)
returns setof public.community_cards language sql stable security invoker set search_path = public, extensions as $$
  with o as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g)
  select cc.* from public.community_cards cc join public.communities c on c.id = cc.id, o
  where (p_radius_km is null or st_dwithin(c.center, o.g, p_radius_km * 1000))
    and (p_category is null or c.category = p_category)
    and (p_kind is null or c.kind = p_kind)
    and (coalesce(trim(p_q),'') = '' or c.search_tsv @@ public.to_prefix_tsquery(p_q) or c.name % p_q or c.name ilike '%' || p_q || '%')
  order by case when p_sort = 'members' then c.member_count end desc nulls last,
           case when p_sort = 'newest' then c.created_at end desc nulls last,
           st_distance(c.center, o.g) asc
  limit least(p_limit, 100) offset p_offset $$;

-- ---- 20260927000900_moderation.sql ----
set search_path = public, extensions;
create type public.report_target as enum ('post','comment','user','message','community');
create type public.report_category as enum ('impersonation','illegal','scam','harassment','spam','other');

create table public.filter_terms (
  id bigint generated always as identity primary key,
  pattern text not null,                     -- Postgres ARE regex, matched case-insensitively (~*)
  category text not null check (category in ('slur','abuse','scam','spam','url','phone')),
  action text not null check (action in ('flag','block')),
  scopes text[] not null default '{post,comment,message,profile,community}',
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  category public.report_category not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references public.profiles(id) on delete set null,
  unique (reporter_id, target_type, target_id)
);
create table public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target not null,
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  source text not null check (source in ('filter','reports','admin')),
  reasons text[] not null default '{}',
  excerpt text,
  report_count int not null default 0,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (resolution in ('restored','removed','dismissed')),
  strike_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references public.profiles(id) on delete set null
);
create unique index moderation_queue_open_uniq on public.moderation_queue (target_type, target_id) where status = 'open';
create index moderation_queue_status_idx on public.moderation_queue (status, created_at desc);
create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_by uuid references public.profiles(id) on delete set null,
  queue_id uuid references public.moderation_queue(id) on delete set null,
  reason text not null,
  category public.report_category not null,
  severe boolean not null default false,
  action text not null check (action in ('warning','final_warning','suspension_7d','permanent_ban')),
  created_at timestamptz not null default now()
);
create table public.moderation_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text, target_id uuid, target_user_id uuid, note text,
  created_at timestamptz not null default now()
);
alter table public.filter_terms enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.strikes enable row level security;
alter table public.moderation_actions enable row level security;

insert into public.filter_terms(pattern, category, action, scopes, note) values
 ('(\+?91[\s-]?)?[6-9][0-9]{4}[\s-]?[0-9]{5}', 'phone', 'flag', '{post,comment,message}', 'Indian mobile number; flag only on velocity/new-request rules'),
 ('(https?://|www\.)\S+|\m[a-z0-9-]+\.(com|in|net|org|info|xyz|top|link|ly|io|app|site|online|click)\M', 'url', 'flag', '{post,comment,message,community}', 'Links: flagged for new/low-rep accounts and message requests'),
 ('\m(otp|kyc|cvv|upi pin)\M', 'scam', 'flag', '{post,comment,message}', 'Credential phishing'),
 ('\m(lottery|jackpot|you have won|prize money|lucky draw winner)\M', 'scam', 'flag', '{post,comment,message}', null),
 ('\m(registration|processing|security) (fee|deposit)\M', 'scam', 'flag', '{post,comment,message}', 'Job scam pattern'),
 ('\m(work from home|part[ -]?time job)\M.*\m(earn|income|per day|daily)\M', 'scam', 'flag', '{post,comment,message}', null),
 ('\mguaranteed (returns|profit|income)\M|\m(crypto|bitcoin|forex|trading) (tips|signals)\M', 'scam', 'flag', '{post,comment,message}', null),
 ('t\.me/|telegram\.me/', 'scam', 'flag', '{post,comment,message}', null),
 ('(.)\1{9,}', 'spam', 'flag', '{post,comment,message}', '10+ repeated characters'),
 ('\m(buy now|limited offer|click here|dm for price|100% free)\M', 'spam', 'flag', '{post,comment,message}', null),
 ('\mf+u+c+k+(ing|er|ed)?\M|\mmotherf\w*|\mbitch(es)?\M|\mbastard\M|\masshole\M', 'abuse', 'flag', '{post,comment,message,profile,community}', 'English profanity: hold for review'),
 ('\m(madarchod|behenchod|bhenchod|bhosdi\w*|chutiya|randi|gaandu)\M', 'abuse', 'block', '{post,comment,message,profile,community}', 'Hindi abuse'),
 ('\mn[i1]gg(er|a)s?\M|\mfaggots?\M|\mchamar\M|\mbhangi\M', 'slur', 'block', '{post,comment,message,profile,community}', 'Slurs incl. caste slurs; extend via admin Filters screen');

create or replace function public._has_pattern(p_text text, p_category text) returns boolean language sql stable
security definer set search_path = public, extensions as $$
  select exists (select 1 from filter_terms where active and category = p_category and p_text ~* pattern) $$;

-- scope: 'post' | 'comment' | 'message' | 'message_request' | 'profile' | 'community'
create or replace function public.moderate_text(p_text text, p_scope text, p_author uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare t record; reasons text[] := '{}'; v_block boolean := false; v_flag boolean := false;
        v_age interval; v_rep int; v_recent int; v_scope text := case when p_scope = 'message_request' then 'message' else p_scope end;
begin
  if coalesce(p_text,'') = '' then return jsonb_build_object('action','allow','reasons','[]'::jsonb); end if;
  select now() - created_at, reputation into v_age, v_rep from profiles where id = p_author;
  for t in select * from filter_terms where active and v_scope = any(scopes) loop
    if p_text ~* t.pattern then
      if t.category = 'url' then
        if p_scope = 'message_request' or v_age < interval '7 days' or coalesce(v_rep,0) < 20 then
          v_flag := true; reasons := array_append(reasons, 'link_from_new_account'); end if;
      elsif t.category = 'phone' then
        if p_scope = 'message' then continue; end if;
        if p_scope = 'message_request' then v_flag := true; reasons := array_append(reasons, 'phone_in_request'); continue; end if;
        select (select count(*) from posts where author_id = p_author and has_phone_text and created_at > now() - interval '24 hours')
             + (select count(*) from comments where author_id = p_author and has_phone_text and created_at > now() - interval '24 hours')
          into v_recent;
        if v_recent >= 3 then v_flag := true; reasons := array_append(reasons, 'phone_spam'); end if;
      elsif t.action = 'block' then v_block := true; reasons := array_append(reasons, t.category);
      else v_flag := true; reasons := array_append(reasons, t.category); end if;
    end if;
  end loop;
  return jsonb_build_object('action', case when v_block then 'block' when v_flag then 'flag' else 'allow' end,
                            'reasons', to_jsonb(reasons));
end $$;

-- ---------- t20 content-filter BEFORE triggers ----------

create or replace function public.posts_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare txt text; r jsonb;
begin
  txt := coalesce(new.title,'') || E'\n' || coalesce(new.body,'');
  new.has_phone_text := public._has_pattern(txt, 'phone');
  new.has_link := public._has_pattern(txt, 'url');
  if auth.uid() is null then return new; end if;
  r := public.moderate_text(txt, 'post', new.author_id);
  if r->>'action' = 'block' then raise exception 'content_blocked'; end if;
  if r->>'action' = 'flag' then
    new.mod_status := 'pending';
    new.mod_reason := 'auto: ' || array_to_string(array(select jsonb_array_elements_text(r->'reasons')), ',');
  end if;
  return new;
end $$;
create trigger t20_posts_filter before insert or update of title, body on public.posts
  for each row execute function public.posts_filter();

create or replace function public.comments_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  new.has_phone_text := public._has_pattern(new.body, 'phone');
  new.has_link := public._has_pattern(new.body, 'url');
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.body = '[deleted]' then return new; end if;
  r := public.moderate_text(new.body, 'comment', new.author_id);
  if r->>'action' = 'block' then raise exception 'content_blocked'; end if;
  if r->>'action' = 'flag' then
    new.mod_status := 'pending';
    new.mod_reason := 'auto: ' || array_to_string(array(select jsonb_array_elements_text(r->'reasons')), ',');
  end if;
  return new;
end $$;
create trigger t20_comments_filter before insert or update of body on public.comments
  for each row execute function public.comments_filter();

create or replace function public.messages_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare r jsonb; v_scope text; v_status conversation_status;
begin
  new.has_phone_text := public._has_pattern(new.body, 'phone');
  new.has_link := public._has_pattern(new.body, 'url');
  if new.is_system or auth.uid() is null then return new; end if;
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
create trigger t20_messages_filter before insert on public.messages
  for each row execute function public.messages_filter();

-- ---------- t70 enqueue AFTER triggers ----------

create or replace function public._notify_admins() returns void language plpgsql
security definer set search_path = public, extensions as $$
begin
  insert into notifications(user_id, kind, title, body, data)
  select p.id, 'mod_queue', 'New item in the moderation queue', '', jsonb_build_object('url','/admin')
  from profiles p
  where p.role = 'admin'
    and not exists (select 1 from notifications n where n.user_id = p.id and n.kind = 'mod_queue'
                    and n.created_at > now() - interval '10 minutes');
end $$;

create or replace function public.enqueue_if_pending() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare v_type text := tg_argv[0]; v_author uuid; v_excerpt text; v_source text; v_url text; v_reasons text[];
begin
  if new.mod_status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.mod_status = 'pending' then return new; end if;
  v_author := nullif(to_jsonb(new)->>'author_id','')::uuid;
  if v_author is null then v_author := nullif(to_jsonb(new)->>'sender_id','')::uuid; end if;
  v_excerpt := left(coalesce(to_jsonb(new)->>'title','') || ' ' || coalesce(to_jsonb(new)->>'body',''), 280);
  v_source := case when new.mod_reason like 'auto:%' then 'filter' else 'reports' end;
  v_reasons := case when new.mod_reason like 'auto:%' then string_to_array(substring(new.mod_reason from 7), ',')
                     else '{}'::text[] end;
  v_url := case v_type
    when 'post' then '/post/' || new.id
    when 'comment' then '/post/' || (to_jsonb(new)->>'post_id') || '?comment=' || new.id
    when 'message' then '/chat/' || (to_jsonb(new)->>'conversation_id')
    else null end;
  insert into moderation_queue(target_type, target_id, target_user_id, source, reasons, excerpt)
  values (v_type::report_target, new.id, v_author, v_source, v_reasons, v_excerpt)
  on conflict (target_type, target_id) where status = 'open' do update
    set reasons = moderation_queue.reasons || excluded.reasons;
  perform public.notify(v_author, 'content_held', null,
    'Your ' || v_type || ' is being reviewed',
    'It is hidden while the pincode Team takes a look, usually within a day.',
    case when v_type = 'post' then new.id when v_type = 'comment' then (to_jsonb(new)->>'post_id')::uuid else null end,
    case when v_type = 'comment' then new.id else null end,
    null,
    case when v_type = 'message' then (to_jsonb(new)->>'conversation_id')::uuid else null end,
    v_url);
  perform public._notify_admins();
  return new;
end $$;
create trigger t70_posts_enqueue after insert or update of mod_status on public.posts
  for each row execute function public.enqueue_if_pending('post');
create trigger t70_comments_enqueue after insert or update of mod_status on public.comments
  for each row execute function public.enqueue_if_pending('comment');
create trigger t70_messages_enqueue after insert or update of mod_status on public.messages
  for each row execute function public.enqueue_if_pending('message');

-- ---------- RPCs ----------

create or replace function public.submit_report(p_target_type public.report_target, p_target_id uuid,
  p_category public.report_category, p_details text default null, p_conversation_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); v_user uuid; v_id uuid; v_distinct int; n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select count(*) into n from reports where reporter_id = uid and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'rate_limited_reports'; end if;
  v_user := case p_target_type
    when 'post'      then (select author_id from posts where id = p_target_id)
    when 'comment'   then (select author_id from comments where id = p_target_id)
    when 'message'   then (select sender_id from messages m where m.id = p_target_id and public.is_conversation_member(m.conversation_id))
    when 'user'      then (select id from profiles where id = p_target_id)
    when 'community' then (select owner_id from communities where id = p_target_id) end;
  if v_user is null and p_target_type <> 'community' then raise exception 'not_found'; end if;
  if v_user = uid then raise exception 'cannot_report_self'; end if;
  if p_target_type = 'message' then p_conversation_id := (select conversation_id from messages where id = p_target_id); end if;
  insert into reports(reporter_id, target_type, target_id, target_user_id, conversation_id, category, details)
  values (uid, p_target_type, p_target_id, v_user, p_conversation_id, p_category, left(p_details, 1000))
  on conflict (reporter_id, target_type, target_id) do nothing returning id into v_id;
  if v_id is null then raise exception 'already_reported'; end if;
  insert into moderation_queue(target_type, target_id, target_user_id, source, reasons, excerpt, report_count)
  values (p_target_type, p_target_id, v_user, 'reports', array[p_category::text], public._excerpt(p_target_type, p_target_id), 1)
  on conflict (target_type, target_id) where status = 'open' do update
    set report_count = moderation_queue.report_count + 1,
        reasons = case when p_category::text = any(moderation_queue.reasons) then moderation_queue.reasons
                       else moderation_queue.reasons || p_category::text end;
  if p_target_type in ('post','comment','message') then
    select count(distinct reporter_id) into v_distinct from reports
     where target_type = p_target_type and target_id = p_target_id and status = 'open';
    if v_distinct >= 3 or (p_category = 'illegal' and v_distinct >= 2) then
      perform public._set_mod_status(p_target_type, p_target_id, 'pending', 'reports');
    end if;
    if p_target_type = 'post' then update posts set report_count = report_count + 1 where id = p_target_id; end if;
  end if;
  perform public._notify_admins();
  return v_id;
end $$;

create or replace function public._excerpt(p_type public.report_target, p_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case p_type
    when 'post' then (select left(coalesce(title,'') || ' ' || coalesce(body,''), 280) from posts where id = p_id)
    when 'comment' then (select left(body, 280) from comments where id = p_id)
    when 'message' then (select left(body, 280) from messages where id = p_id)
    when 'user' then (select left(coalesce(username::text,''), 280) from profiles where id = p_id)
    when 'community' then (select left(name, 280) from communities where id = p_id)
    else null end $$;

create or replace function public._set_mod_status(p_type public.report_target, p_id uuid, p_status public.mod_status,
  p_reason text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_type = 'post' then
    update posts set mod_status = p_status, mod_reason = p_reason where id = p_id;
  elsif p_type = 'comment' then
    update comments set mod_status = p_status, mod_reason = p_reason where id = p_id;
  elsif p_type = 'message' then
    update messages set mod_status = p_status, mod_reason = p_reason where id = p_id;
  elsif p_type = 'community' then
    update communities set is_removed = (p_status = 'removed') where id = p_id;
  end if;
  -- 'user' does nothing
end $$;

create or replace function public.admin_resolve_item(p_item uuid, p_decision text, p_strike boolean default false,
  p_reason text default null, p_category public.report_category default 'other', p_severe boolean default false)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare q moderation_queue; v_was_hidden boolean; v_strike_id uuid; v_resolution text; rr record;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into q from moderation_queue where id = p_item and status = 'open' for update;
  if not found then raise exception 'already_resolved'; end if;
  if p_decision = 'restore' or p_decision = 'dismiss' then
    v_was_hidden := (
      (q.target_type = 'post' and exists(select 1 from posts where id = q.target_id and mod_status in ('pending','removed')))
      or (q.target_type = 'comment' and exists(select 1 from comments where id = q.target_id and mod_status in ('pending','removed')))
      or (q.target_type = 'message' and exists(select 1 from messages where id = q.target_id and mod_status in ('pending','removed')))
    );
    if p_decision = 'restore' then
      perform public._set_mod_status(q.target_type, q.target_id, 'visible', null);
    end if;
    update reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
      where target_type = q.target_type and target_id = q.target_id and status = 'open';
    if p_decision = 'restore' and v_was_hidden then
      perform public.notify(q.target_user_id, 'content_restored', null, 'Your content was restored',
        'A pincode Team review found it did not break our guidelines.', null, null, null, null, null);
    end if;
    v_resolution := case when p_decision = 'restore' then 'restored' else 'dismissed' end;
  elsif p_decision = 'remove' then
    perform public._set_mod_status(q.target_type, q.target_id, 'removed', p_reason);
    perform public.award_rep(q.target_user_id, auth.uid(), 'moderation_penalty', q.target_id, -10);
    update reports set status = 'actioned', resolved_at = now(), resolved_by = auth.uid()
      where target_type = q.target_type and target_id = q.target_id and status = 'open';
    perform public.notify(q.target_user_id, 'content_removed', null, 'Content removed', coalesce(p_reason,''),
      null, null, null, null, null);
    for rr in select reporter_id from reports
      where target_type = q.target_type and target_id = q.target_id and status = 'actioned' and resolved_by = auth.uid()
    loop
      perform public.notify(rr.reporter_id, 'report_update', null, 'Thanks for your report',
        'We removed content that broke our guidelines.', null, null, null, null, null);
    end loop;
    v_resolution := 'removed';
  else
    raise exception 'bad_decision';
  end if;
  if p_strike and q.target_user_id is not null then
    v_strike_id := public.admin_issue_strike(q.target_user_id, coalesce(p_reason,'Community guidelines violation'),
                                             p_category, p_severe, p_item);
  end if;
  update moderation_queue set status = 'resolved', resolution = v_resolution, strike_id = v_strike_id,
    resolved_at = now(), resolved_by = auth.uid() where id = p_item;
  insert into moderation_actions(admin_id, action, target_type, target_id, target_user_id, note)
  values (auth.uid(), 'resolve_' || v_resolution, q.target_type::text, q.target_id, q.target_user_id, p_reason);
end $$;

create or replace function public.admin_issue_strike(p_user uuid, p_reason text, p_category public.report_category,
  p_severe boolean default false, p_queue uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare n int; v_action text; v_strike_id uuid; v_msg text; v_conv uuid; v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select count(*) into n from strikes where user_id = p_user and created_at > now() - interval '365 days';
  n := n + 1;
  v_action := case when p_severe then 'permanent_ban'
                   when n = 1 then 'warning' when n = 2 then 'final_warning'
                   when n = 3 then 'suspension_7d' else 'permanent_ban' end;
  insert into strikes(user_id, issued_by, queue_id, reason, category, severe, action)
  values (p_user, auth.uid(), p_queue, p_reason, p_category, p_severe, v_action) returning id into v_strike_id;
  update profiles set strike_count = strike_count + 1 where id = p_user;
  if v_action = 'suspension_7d' then
    update profiles set banned_until = greatest(coalesce(banned_until, now()), now()) + interval '7 days'
      where id = p_user returning banned_until into v_until;
  elsif v_action = 'permanent_ban' then
    update profiles set ban_permanent = true where id = p_user;
  end if;
  v_conv := public._system_conversation(p_user);
  v_msg := case v_action
    when 'warning' then format('Warning from pincode Team (%s): %s. This is your first strike. Please follow the community guidelines. Repeated violations lead to a suspension.', p_category::text, p_reason)
    when 'final_warning' then format('Final warning from pincode Team (%s): %s. This is your second strike in 12 months. One more and your account will be suspended for 7 days.', p_category::text, p_reason)
    when 'suspension_7d' then format('Your account is suspended until %s (%s): %s. You can still read, but you cannot post, comment, react, vote or message. Another violation leads to a permanent ban.',
           to_char(v_until at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST', p_category::text, p_reason)
    else format('Your account has been permanently banned (%s): %s.', p_category::text, p_reason)
  end;
  perform public._send_system_message(p_user, v_msg);
  perform public.notify(p_user, case when v_action in ('warning','final_warning') then 'warning' else 'suspension' end,
    null, case when v_action in ('warning','final_warning') then 'You have a new warning' else 'Your account was suspended' end,
    v_msg, null, null, null, v_conv, '/chat/' || v_conv);
  insert into moderation_actions(admin_id, action, target_type, target_id, target_user_id, note)
  values (auth.uid(), 'strike_' || v_action, 'user', p_user, p_user, p_reason);
  return v_strike_id;
end $$;

create or replace function public.admin_lift_ban(p_user uuid, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_conv uuid;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update profiles set banned_until = null, ban_permanent = false where id = p_user;
  v_conv := public._system_conversation(p_user);
  perform public._send_system_message(p_user, coalesce(p_note, 'Your suspension has been lifted. Welcome back.'));
  perform public.notify(p_user, 'ban_lifted', null, 'Your account is active again', coalesce(p_note,''),
    null, null, null, v_conv, '/chat/' || v_conv);
  insert into moderation_actions(admin_id, action, target_type, target_id, target_user_id, note)
  values (auth.uid(), 'lift_ban', 'user', p_user, p_user, p_note);
end $$;

create or replace function public.admin_remove_content(p_type public.report_target, p_id uuid, p_reason text,
  p_strike boolean default false, p_category public.report_category default 'other', p_severe boolean default false)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_item uuid;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  v_user := case p_type
    when 'post' then (select author_id from posts where id = p_id)
    when 'comment' then (select author_id from comments where id = p_id)
    when 'message' then (select sender_id from messages where id = p_id)
    when 'user' then p_id
    when 'community' then (select owner_id from communities where id = p_id) end;
  insert into moderation_queue(target_type, target_id, target_user_id, source, reasons, excerpt)
  values (p_type, p_id, v_user, 'admin', array[p_category::text], public._excerpt(p_type, p_id))
  on conflict (target_type, target_id) where status = 'open' do update
    set reasons = case when p_category::text = any(moderation_queue.reasons) then moderation_queue.reasons
                       else moderation_queue.reasons || p_category::text end
  returning id into v_item;
  perform public.admin_resolve_item(v_item, 'remove', p_strike, p_reason, p_category, p_severe);
end $$;

create or replace function public.admin_test_filter(p_text text, p_scope text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return public.moderate_text(p_text, p_scope, auth.uid());
end $$;

-- ---- 20260927001000_storage_realtime.sql ----
set search_path = public, extensions;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
declare t text;
begin
  foreach t in array array['messages','notifications','conversation_members','conversations'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ---- 20260927001100_rls_grants.sql ----
set search_path = public, extensions;
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

-- ---------- profiles ----------
create policy profiles_read on profiles for select using (true);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid() and not is_banned()) with check (id = auth.uid());
grant select on profiles to anon, authenticated;
grant update (display_name, bio, avatar_url, interests, home_pincode, home_area, home_city) on profiles to authenticated;

-- ---------- private_profiles ----------
create policy private_read on private_profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy private_update on private_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on private_profiles to authenticated;
grant update (notification_prefs) on private_profiles to authenticated;

-- ---------- blocks ----------
create policy blocks_own_read on blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_own_ins on blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_own_del on blocks for delete to authenticated using (blocker_id = auth.uid());
grant select, insert, delete on blocks to authenticated;

-- ---------- posts ----------
create policy posts_read on posts for select using (
  (mod_status = 'visible' and not community_removed) or author_id = auth.uid() or is_admin()
  or (community_id is not null and is_community_mod(community_id)));
create policy posts_insert on posts for insert to authenticated with check (author_id = auth.uid() and can_participate());
create policy posts_update on posts for update to authenticated
  using (author_id = auth.uid() and can_participate()) with check (author_id = auth.uid());
create policy posts_delete on posts for delete to authenticated using (author_id = auth.uid() or is_admin());
grant select (id, author_id, community_id, type, kind, tag, title, body, has_phone, lat, lng, location,
  loc_precision, pincode, area, city, starts_at, ends_at, expires_at, status, mod_status, mod_reason,
  community_removed, upvote_count, comment_count, answer_count, first_answer_at, solved_comment_id, solved_at,
  still_on_count, resolved_count, last_confirmed_at, report_count, reaction_counts, has_link, has_phone_text,
  search_tsv, created_at, updated_at) on posts to anon, authenticated;
grant insert (type, kind, tag, title, body, phone_e164, lat, lng, pincode, area, city, starts_at, ends_at, community_id)
  on posts to authenticated;
grant update (title, body, tag, status) on posts to authenticated;
grant delete on posts to authenticated;

-- ---------- comments ----------
create policy comments_read on comments for select using (
  exists (select 1 from posts p where p.id = comments.post_id)
  and (mod_status = 'visible' or author_id = auth.uid() or is_admin()
       or is_community_mod((select community_id from posts where id = comments.post_id))));
create policy comments_insert on comments for insert to authenticated with check (author_id = auth.uid() and can_participate());
create policy comments_update on comments for update to authenticated
  using (author_id = auth.uid() and deleted_at is null and can_participate()) with check (author_id = auth.uid());
grant select on comments to anon, authenticated;
grant insert (post_id, parent_id, body) on comments to authenticated;
grant update (body) on comments to authenticated;

-- ---------- votes / reactions / confirmations (same pattern) ----------
create policy pv_read on post_votes for select to authenticated using (user_id = auth.uid());
create policy pv_ins  on post_votes for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy pv_del  on post_votes for delete to authenticated using (user_id = auth.uid());
-- post_reactions
create policy pr_read on post_reactions for select to authenticated using (user_id = auth.uid());
create policy pr_ins  on post_reactions for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy pr_del  on post_reactions for delete to authenticated using (user_id = auth.uid());
-- comment_votes
create policy cv_read on comment_votes for select to authenticated using (user_id = auth.uid());
create policy cv_ins  on comment_votes for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy cv_del  on comment_votes for delete to authenticated using (user_id = auth.uid());
-- comment_reactions
create policy cr_read on comment_reactions for select to authenticated using (user_id = auth.uid());
create policy cr_ins  on comment_reactions for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy cr_del  on comment_reactions for delete to authenticated using (user_id = auth.uid());
create policy ac_read on alert_confirmations for select to authenticated using (user_id = auth.uid());
create policy ac_ins  on alert_confirmations for insert to authenticated with check (user_id = auth.uid() and can_participate());
grant select, insert, delete on post_votes, post_reactions, comment_votes, comment_reactions to authenticated;
grant select, insert on alert_confirmations to authenticated;

-- ---------- reputation / badges ----------
create policy rep_read on reputation_events for select to authenticated using (user_id = auth.uid() or is_admin());
create policy badges_read on badges for select using (true);
create policy user_badges_read on user_badges for select using (true);
grant select on reputation_events to authenticated;
grant select on badges, user_badges to anon, authenticated;

-- ---------- notifications / push ----------
create policy notif_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_upd  on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_del  on notifications for delete to authenticated using (user_id = auth.uid());
grant select, delete on notifications to authenticated;
grant update (read_at) on notifications to authenticated;
create policy push_own on push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, delete on push_tokens to authenticated;

-- ---------- messaging ----------
create policy conv_read on conversations for select to authenticated using (is_conversation_member(id));
create policy cm_read on conversation_members for select to authenticated using (is_conversation_member(conversation_id));
create policy cm_upd on conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy msg_read on messages for select to authenticated using (
  (is_conversation_member(conversation_id) and (mod_status = 'visible' or sender_id = auth.uid()))
  or (is_admin() and (exists (select 1 from reports r where (r.target_type = 'message' and r.target_id = messages.id)
                                or r.conversation_id = messages.conversation_id)
                      or exists (select 1 from moderation_queue q where q.target_type = 'message' and q.target_id = messages.id))));
create policy msg_ins on messages for insert to authenticated with check (
  sender_id = auth.uid() and not is_system and can_participate() and is_conversation_member(conversation_id));
grant select on conversations to authenticated;
grant select on conversation_members to authenticated;
grant update (muted, hidden) on conversation_members to authenticated;
grant select on messages to authenticated;
grant insert (conversation_id, body) on messages to authenticated;

-- ---------- communities ----------
create policy comm_read on communities for select using (not is_removed or is_admin());
create policy cmem_read on community_members for select using (true);
create policy cmem_join on community_members for insert to authenticated with check (
  user_id = auth.uid() and role = 'member' and can_participate()
  and not exists (select 1 from community_bans b where b.community_id = community_members.community_id and b.user_id = auth.uid())
  and exists (select 1 from communities c where c.id = community_members.community_id and not c.is_removed));
create policy cmem_leave on community_members for delete to authenticated using (user_id = auth.uid());
create policy cmem_notify on community_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cban_read on community_bans for select to authenticated
  using (user_id = auth.uid() or is_community_mod(community_id));
grant select on communities, community_members to anon, authenticated;
grant insert (community_id, user_id), delete on community_members to authenticated;  -- user_id is pinned to auth.uid() by cmem_join; role is not granted, so it stays the default 'member'
grant update (notify_posts) on community_members to authenticated;
grant select on community_bans to authenticated;

-- ---------- moderation ----------
create policy ft_admin on filter_terms for all to authenticated using (is_admin()) with check (is_admin());
create policy reports_read on reports for select to authenticated using (reporter_id = auth.uid() or is_admin());
create policy mq_admin on moderation_queue for select to authenticated using (is_admin());
create policy strikes_read on strikes for select to authenticated using (user_id = auth.uid() or is_admin());
create policy ma_admin on moderation_actions for select to authenticated using (is_admin());
grant select, insert, update, delete on filter_terms to authenticated;
grant select on reports, moderation_queue, strikes, moderation_actions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- views ----------
grant select on post_cards, comment_cards, community_cards to anon, authenticated;

-- ---------- internal functions: not callable from the API ----------
revoke execute on function public._set_solved(uuid,uuid), public.award_rep(uuid,uuid,text,uuid,int),
  public.revoke_rep(text,uuid,uuid), public.award_badge(uuid,text),
  public.notify(uuid,notification_kind,uuid,text,text,uuid,uuid,uuid,uuid,text),
  public.send_push(uuid,text,text,jsonb), public._system_conversation(uuid), public._send_system_message(uuid,text),
  public.moderate_text(text,text,uuid), public._has_pattern(text,text), public._excerpt(report_target,uuid),
  public._set_mod_status(report_target,uuid,mod_status,text), public._notify_admins(),
  public.handle_new_user(), public.handle_user_email_change()
  from public, anon, authenticated;

-- ---- 20260927001200_p9_fixes.sql ----
set search_path = public, extensions;

-- ---------- P9 fix (a): guard against a malformed filter_terms.pattern ----------
-- filter_terms.pattern is a raw Postgres regex evaluated by moderate_text()
-- on every post/comment/message insert (20260927000900_moderation.sql). A
-- pattern with invalid regex syntax, added or edited from the admin Filters
-- screen, would make every future insert raise a Postgres regex error. This
-- trigger validates the pattern against an empty string before the row is
-- written, so a bad pattern is rejected here instead of breaking every insert.
create or replace function public.filter_terms_validate() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  begin
    perform '' ~ new.pattern;
  exception when others then
    raise exception 'filter_pattern_invalid';
  end;
  return new;
end $$;
create trigger t10_filter_terms_validate before insert or update of pattern on public.filter_terms
  for each row execute function public.filter_terms_validate();
revoke execute on function public.filter_terms_validate() from public, anon, authenticated;

-- ---------- P9 fix (b): missing `set search_path` on three helper functions ----------
-- These were created without it in 20260927000100_extensions_helpers.sql and
-- 20260927000500_notifications_push.sql. Existing migrations are not edited
-- (per MOBILE-PLAN.md convention); ALTER FUNCTION sets it in place instead.
alter function public.set_updated_at() set search_path = public, extensions;
alter function public.ist_day_start() set search_path = public, extensions;
alter function public.notification_category(public.notification_kind) set search_path = public, extensions;

-- ---------- P9 fix (c): get_profile() / posts_near() forward references ----------
-- Postgres validates a `language sql` function's body against the catalog at
-- CREATE time (unlike plpgsql, which defers to first call). Both functions
-- were originally defined earlier in the migration order than tables they
-- reference, which made a fresh run of the migrations fail immediately.
-- Definitions moved here verbatim (identical logic) once every dependency
-- exists; the originals in 20260927000200_profiles.sql and
-- 20260927000800_feed_search.sql were removed and now point here.

-- Public profile bundle for user/[username]
create or replace function public.get_profile(p_username text) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'profile', jsonb_build_object('id', p.id, 'username', p.username::text, 'display_name', p.display_name,
       'avatar_url', p.avatar_url, 'bio', p.bio, 'interests', p.interests, 'home_area', p.home_area,
       'home_pincode', p.home_pincode, 'reputation', p.reputation, 'post_count', p.post_count,
       'answer_count', p.answer_count, 'solved_count', p.solved_count, 'community_count', p.community_count,
       'role', p.role, 'created_at', p.created_at,
       'is_suspended', (p.ban_permanent or coalesce(p.banned_until > now(), false))),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'name', b.name,
                 'description', b.description, 'awarded_at', ub.awarded_at) order by b.sort)
               from user_badges ub join badges b on b.code = ub.badge_code where ub.user_id = p.id), '[]'),
    'communities', coalesce((select jsonb_agg(x) from (
                 select jsonb_build_object('id', c.id, 'slug', c.slug::text, 'name', c.name, 'category', c.category,
                        'role', m.role) x
                 from community_members m join communities c on c.id = m.community_id
                 where m.user_id = p.id and not c.is_removed order by m.joined_at desc limit 20) s), '[]'),
    'viewer', jsonb_build_object('is_me', p.id = auth.uid(),
       'i_blocked', exists (select 1 from blocks where blocker_id = auth.uid() and blocked_id = p.id),
       'conversation_id', (select id from conversations c where c.kind = 'direct'
                           and c.user_low = least(p.id, auth.uid()) and c.user_high = greatest(p.id, auth.uid()))))
  from profiles p where p.username = p_username::citext and p.onboarded_at is not null $$;

create or replace function public.posts_near(
  p_lat double precision, p_lng double precision, p_radius_km double precision default 10,
  p_types public.post_type[] default null, p_unanswered boolean default false,
  p_sort text default 'newest', p_community_id uuid default null,
  p_include_expired boolean default false, p_limit int default 200, p_offset int default 0)
returns setof public.post_cards language sql stable security invoker set search_path = public, extensions as $$
  with o as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography g)
  select c.* from public.post_cards c join public.posts p on p.id = c.id, o
  where (p_community_id is not null or st_dwithin(p.location, o.g, p_radius_km * 1000))
    and (p_community_id is null or p.community_id = p_community_id)
    and (p_types is null or p.type = any(p_types))
    and (p_include_expired or (p.status = 'active' and p.expires_at > now()))
    and p.mod_status = 'visible' and not p.community_removed
    and (not p_unanswered or (p.type = 'ask' and p.kind = 'request' and p.first_answer_at is null))
    -- adaptive reach for unanswered asks (2 km <30 min, 5 km <2 h, else 10 km); own posts and community feeds exempt
    and (p.type <> 'ask' or p.first_answer_at is not null or p.author_id = auth.uid() or p_community_id is not null
         or st_distance(p.location, o.g) <= 1000 * case when now() - p.created_at < interval '30 minutes' then 2
                                                        when now() - p.created_at < interval '2 hours' then 5 else 10 end)
    and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = p.author_id)
    and not exists (select 1 from public.reports r where r.reporter_id = auth.uid() and r.target_type = 'post' and r.target_id = p.id)
  order by case when p_sort = 'nearest' then st_distance(p.location, o.g) end asc nulls last, p.created_at desc
  limit least(p_limit, 300) offset p_offset $$;

-- ---- 20260927001300_post_images.sql ----
set search_path = public, extensions;

-- ---------- Post images/GIFs ----------
-- One optional image (or animated GIF, stored the same way — the bucket's
-- allowed_mime_types below includes image/gif) per post. Kept to a single
-- image for v1, matching the plan's minimalist scope; a post_images join
-- table for multiple images is a natural v2 extension if needed.

alter table public.posts add column if not exists image_url text
  check (image_url is null or char_length(image_url) <= 2048);

-- post_cards is `security_invoker`, so the caller's own SELECT grant on
-- posts.image_url (below) is what actually lets this column through, not
-- this view definition by itself. create or replace view can only append a
-- column at the end without dropping the view — inserting it in the middle
-- of the original column list isn't possible without a drop, which isn't
-- worth the churn for one column.
create or replace view public.post_cards with (security_invoker = true) as
select p.id, p.author_id, p.community_id, p.type, p.kind, p.tag, p.title, p.body, p.has_phone,
       p.lat, p.lng, p.loc_precision, p.pincode, p.area, p.city, p.starts_at, p.ends_at, p.expires_at,
       p.status, p.mod_status, p.community_removed, p.upvote_count, p.comment_count, p.answer_count,
       p.first_answer_at, p.solved_comment_id, p.solved_at, p.still_on_count, p.resolved_count,
       p.last_confirmed_at, p.reaction_counts, p.created_at, p.updated_at,
       (p.expires_at < now()) as is_expired,
       a.username::text as author_username, a.display_name as author_display_name,
       a.avatar_url as author_avatar_url, a.reputation as author_reputation,
       c.slug::text as community_slug, c.name as community_name,
       exists (select 1 from public.post_votes v where v.post_id = p.id and v.user_id = auth.uid()) as my_vote,
       array(select r.reaction from public.post_reactions r where r.post_id = p.id and r.user_id = auth.uid()) as my_reactions,
       (select ac.kind from public.alert_confirmations ac where ac.post_id = p.id and ac.user_id = auth.uid()) as my_confirmation,
       p.image_url
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.communities c on c.id = p.community_id;

-- Supplementary grants (posts' original select/insert/update grants live in
-- 20260927001100_rls_grants.sql and are left untouched; a GRANT only adds
-- privilege, so issuing another one here for just this column is safe and
-- doesn't need to repeat the full column list).
grant select (image_url) on posts to anon, authenticated;
grant insert (image_url) on posts to authenticated;
grant update (image_url) on posts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "post-images public read" on storage.objects for select using (bucket_id = 'post-images');
create policy "post-images owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post-images owner update" on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post-images owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---- 20260927001400_email_for_login.sql ----
set search_path = public, extensions;

-- ---------- Sign in with username, email or phone ----------
-- Username, email and phone are all unique per profile (§2.1/§2.2), so any
-- one of them should be usable to sign in — but Supabase Auth's
-- signInWithPassword only accepts an email. This resolves a username or
-- E.164 phone to the account's email first; the client still calls
-- signInWithPassword itself, so a wrong password still gets Supabase's own
-- generic "invalid login credentials" error and this never exposes whether
-- an identifier exists on its own.
create or replace function public.email_for_login(p_identifier text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_email text; v_id uuid;
begin
  if coalesce(p_identifier, '') = '' then return null; end if;

  -- Already an email: pass through as-is (still case-folded via private_profiles.email being citext).
  if p_identifier ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return lower(p_identifier);
  end if;

  -- E.164 Indian phone (client normalizes before calling this).
  if p_identifier ~ '^\+91[6-9][0-9]{9}$' then
    select id into v_id from private_profiles where phone_e164 = p_identifier;
  else
    -- Otherwise a username.
    select id into v_id from profiles where username = p_identifier::citext;
  end if;

  if v_id is null then return null; end if;
  select email into v_email from private_profiles where id = v_id;
  return v_email;
end $$;
-- No explicit grant needed: like email_available/username_available above,
-- a newly created function is EXECUTE-able by PUBLIC (anon + authenticated)
-- by default, which is what a pre-auth sign-in lookup needs.


-- ---- 20260927001500_login_throttle.sql ----
set search_path = public, extensions;

-- ---------- Login throttling (used by the login-with-identifier Edge Function) ----------
-- Keys are 'ip:<ip>', 'id:<sha256 of lower-cased identifier>' and
-- 'idip:<sha256 of identifier|ip>', so no usernames/emails/phones are stored here.
-- Counters live in a table, not in function memory, because Edge isolates are
-- short-lived and run as many parallel instances.
create table if not exists public.login_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_key_at_idx on public.login_attempts (key, at);
alter table public.login_attempts enable row level security;   -- no policies: service_role only

-- Records one attempt per key, then reports whether every key is still within
-- its limit (count includes this attempt). Check-and-record is one statement
-- sequence so parallel requests cannot all slip under the limit. Every attempt
-- counts; a successful sign-in then clears its own identifier+IP key.
create or replace function public.login_throttle_hit(p_keys text[], p_max int[], p_window interval)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare i int; ok boolean := true;
begin
  delete from login_attempts where at < now() - interval '1 day';
  insert into login_attempts(key) select unnest(p_keys);
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if (select count(*) from login_attempts where key = p_keys[i] and at > now() - p_window) > p_max[i] then
      ok := false;
    end if;
  end loop;
  return ok;
end $$;

create or replace function public.login_throttle_clear(p_key text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from login_attempts where key = p_key $$;

revoke all on function public.login_throttle_hit(text[], int[], interval) from public, anon, authenticated;
revoke all on function public.login_throttle_clear(text)                  from public, anon, authenticated;
grant execute on function public.login_throttle_hit(text[], int[], interval) to service_role;
grant execute on function public.login_throttle_clear(text)                  to service_role;

-- ---------- phone_available: signed-in callers only ----------
-- Only called from onboarding and Settings → Phone (both signed in), and it
-- tells the caller whether a number is registered, so there's no reason to
-- leave it open to anonymous callers. (username_available stays open: usernames
-- are public on profiles anyway. email_available stays open for the sign-up
-- form — see the follow-up note in DEPLOY notes: it is an existence oracle and
-- should be removed once sign-up relies on the signUp response alone.)
revoke execute on function public.phone_available(text) from public, anon;
grant  execute on function public.phone_available(text) to authenticated;

-- ---- 20260927001600_login_lockdown.sql ----
set search_path = public, extensions;

-- ---------- Close the email leak ----------
-- email_for_login() returned the real email for any username/phone to ANY
-- caller, signed in or not. Sign-in by username/phone now goes through the
-- login-with-identifier Edge Function, which does the lookup with the service
-- role and returns only a session.
--
-- RUN THIS ONLY AFTER the login-with-identifier function is deployed and the
-- updated app is live; otherwise username/phone sign-in stops working
-- (email sign-in is unaffected). Revoke first so a partial run still closes
-- the hole.
revoke execute on function public.email_for_login(text) from public, anon, authenticated;
drop function if exists public.email_for_login(text);

-- Account deletion now goes through the delete-account Edge Function (which
-- also clears storage); stop clients from calling the bare RPC, which would
-- leave uploaded files behind.
revoke execute on function public.delete_my_account() from public, anon, authenticated;

-- ---- 20260927001700_terms_feedback.sql ----
set search_path = public, extensions;

-- ---------- Terms acceptance ----------
-- Clients can't write private_profiles directly (only notification_prefs is
-- grantable), so acceptance goes through this RPC. The app compares
-- terms_version to its bundled TERMS_VERSION and re-prompts when it changes.
alter table public.private_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_version, '') = '' or char_length(p_version) > 32 then raise exception 'not_allowed'; end if;
  update private_profiles set terms_accepted_at = now(), terms_version = p_version where id = auth.uid();
end $$;
revoke execute on function public.accept_terms(text) from public, anon;
grant  execute on function public.accept_terms(text) to authenticated;

-- ---------- In-app feedback ----------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 3 and 2000),
  category text not null default 'other' check (category in ('bug', 'idea', 'other')),
  app_version text,
  platform text,
  status text not null default 'new' check (status in ('new', 'seen', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists feedback_admin_read on public.feedback;
create policy feedback_admin_read on public.feedback for select to authenticated using (public.is_admin());
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.feedback from anon, authenticated;
grant insert (message, category, app_version, platform) on public.feedback to authenticated;
grant select on public.feedback to authenticated;            -- rows still limited to admins by RLS
grant update (status) on public.feedback to authenticated;   -- ditto

create or replace function public.feedback_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is not null then
    new.user_id := uid; new.created_at := now(); new.status := 'new';
    select count(*) into n from feedback where user_id = uid and created_at > now() - interval '24 hours';
    if n >= 5 then raise exception 'rate_limited_feedback'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t10_feedback_guard on public.feedback;
create trigger t10_feedback_guard before insert on public.feedback
  for each row execute function public.feedback_guard();

-- ---- 20260927001800_service_role_grants.sql ----
set search_path = public, extensions;

-- The Edge Functions (delete-account, login-with-identifier) use the service
-- role, which bypasses RLS but still needs table privileges. This project's
-- tables didn't get them automatically (delete-account failed with
-- "permission denied for table messages"), so grant them explicitly.
-- service_role is a server-only key and is never shipped in the app.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- ---- 20260927001900_owner_account_deletion.sql ----
set search_path = public, extensions;

-- Deleting an account that owns a community failed: the cascade from
-- profiles -> community_members hit this guard and raised owner_cannot_leave.
-- The guard is meant to stop an owner *leaving* their community from the app,
-- not to block account deletion. Server-side deletes (delete-account Edge
-- Function, dashboard) run without a signed-in user, and during the cascade the
-- profile row is already gone, so allow either case. The community then keeps
-- existing with owner_id = null (FK is ON DELETE SET NULL) for an admin to reassign.
create or replace function public.community_members_guard() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
begin
  if old.role = 'owner'
     and auth.uid() is not null
     and not public.is_admin()
     and exists (select 1 from profiles where id = old.user_id) then
    raise exception 'owner_cannot_leave';
  end if;
  return old;
end $$;

-- ---- 20260927002000_app_config.sql ----
set search_path = public, extensions;

-- One-row remote config read by the app on launch / resume. Today it holds the
-- minimum supported app version: phones on an older native build see a blocking
-- "Update required" screen (mobile/src/components/UpdateRequiredGate.tsx).
-- Phones stuck on an old build can't receive OTA updates for newer runtimes, so
-- this lets us retire them before shipping database cleanups.
--
-- To raise it (ONLY after the new build is live on Play), in the SQL editor:
--   update app_config set min_supported_version = '1.2.0', message = '...' where id;
-- No write policies: it is edited via the SQL editor / service role only.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  min_supported_version text not null default '1.0.0'
    check (min_supported_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  message text,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (true) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);

revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;

-- ---- 20261010000100_fix_null_auth_checks.sql ----
set search_path = public, extensions;

-- ============================================================
-- Fix NULL-comparison authorization bypasses (SECURITY).
--
-- In SQL, `x <> NULL` is NULL, and `if NULL then ...` does not run. So an
-- authorization guard written as `if a <> b and not ... then raise` is silently
-- skipped whenever `a` or `b` is NULL:
--   * anon caller            -> auth.uid() is NULL  (delete_comment wiped any comment)
--   * ownerless community    -> communities.owner_id is NULL after the owner account
--                               is deleted (FK ON DELETE SET NULL), so any member
--                               passed the owner check.
-- Fix: `is distinct from` (NULL-safe), plus an explicit not_authenticated guard.
--
-- Functions changed (only the lines listed; signatures, security definer,
-- search_path and return types are unchanged; no grants touched):
--   delete_comment(uuid)
--     + declare uid uuid := auth.uid();
--     + if uid is null then raise exception 'not_authenticated'; end if;
--     ~ c.author_id <> auth.uid()  ->  c.author_id is distinct from uid
--   set_community_role(uuid,uuid,community_role)
--     ~ c.owner_id <> uid          ->  c.owner_id is distinct from uid
--   remove_community_member(uuid,uuid,text,boolean)
--     ~ c.owner_id <> uid          ->  c.owner_id is distinct from uid
--   messages_prepare()  (BEFORE INSERT trigger on messages; defense in depth)
--     ~ c.created_by <> new.sender_id -> c.created_by is distinct from new.sender_id
--       (a NULL sender_id or NULL created_by used to skip the "only the requester
--        may send while the request is pending" rule.)
--   update_community(uuid,text,text,text[],text,numeric)
--     ~ is_owner := (c.owner_id = uid) or public.is_admin()
--       -> is_owner := coalesce(c.owner_id = uid, false) or public.is_admin()
--       (ownerless community: NULL or false = NULL made `and not is_owner` NULL, so
--        any moderator could rename it / change category and radius.)
--   inbox_counts(), list_conversations(text)  (read paths; correctness, no leak)
--     ~ c.created_by <> auth.uid() -> c.created_by is distinct from auth.uid()
--       (a pending request whose creator account was deleted vanished from both
--        the requests box and the chats box, and was not counted.)
--
-- respond_to_request is intentionally left unchanged: it first requires
--   is_conversation_member (false for anon / non-members), so `c.created_by = me`
--   being NULL for a creator-deleted request only lets the remaining recipient
--   respond, which is the legitimate outcome. No wrong person gains access.
--
-- Other SECURITY DEFINER functions in public containing <> / != were reviewed and
-- judged SAFE (comparison is not an authorization guard, or NULL cannot reach it):
--   alert_confirmations_after, comments_notify, comments_prepare (is_answer flag),
--   posts_notify_community, posts_notify_nearby, notifications_push, enqueue_if_pending,
--   messages_after, revoke_rep, award_rep (reputation math; the `auth.uid() is not
--   null` branch only decides whether anti-abuse caps apply),
--   complete_onboarding / create_community / submit_report
--     (all start with `uid is null -> not_authenticated`; their <> comparisons are
--      content-filter results or uniqueness checks; submit_report `v_user = uid`
--      NULL only skips the self-report refusal, harmless),
--   username_available / phone_available
--     (read-only, scoped by auth.uid(); NULL yields no rows),
--   profiles_guard (trigger; intentionally skips when uid is NULL, i.e. server-side
--     writes; not a NULL-compare bug).
-- ============================================================

create or replace function public.delete_comment(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare uid uuid := auth.uid(); c comments; p posts;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from comments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  select * into p from posts where id = c.post_id;
  if c.author_id is distinct from uid and not public.is_admin() and not public.is_community_mod(p.community_id) then
    raise exception 'not_allowed'; end if;
  update comments set deleted_at = now(), body = '[deleted]' where id = p_id;
  if p.solved_comment_id = p_id then perform public._set_solved(p.id, null); end if;
end $function$;

create or replace function public.set_community_role(p_comm uuid, p_user uuid, p_role community_role)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare uid uuid := auth.uid(); c communities; m community_members;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from communities where id = p_comm;
  if not found then raise exception 'not_found'; end if;
  if c.owner_id is distinct from uid and not public.is_admin() then raise exception 'not_allowed'; end if;
  if p_role not in ('moderator','member') then raise exception 'bad_decision'; end if;
  select * into m from community_members where community_id = p_comm and user_id = p_user;
  if not found or m.role = 'owner' then raise exception 'not_found'; end if;
  update community_members set role = p_role where community_id = p_comm and user_id = p_user;
  if p_role = 'moderator' then perform public.award_badge(p_user, 'community_moderator'); end if;
  perform public.notify(p_user, 'community_role', uid,
    case when p_role = 'moderator' then 'You are now a moderator of ' || c.name
         else 'Your moderator role in ' || c.name || ' was removed' end,
    '', null, null, c.id, null, '/community/' || c.slug::text);
end $function$;

create or replace function public.remove_community_member(p_comm uuid, p_user uuid, p_reason text, p_ban boolean default true)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare uid uuid := auth.uid(); c communities; m community_members;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not public.is_community_mod(p_comm) then raise exception 'not_allowed'; end if;
  select * into c from communities where id = p_comm;
  select * into m from community_members where community_id = p_comm and user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if m.role = 'owner' then raise exception 'not_allowed'; end if;
  if m.role = 'moderator' and c.owner_id is distinct from uid and not public.is_admin() then raise exception 'not_allowed'; end if;
  delete from community_members where community_id = p_comm and user_id = p_user;
  if p_ban then
    insert into community_bans(community_id, user_id, banned_by, reason) values (p_comm, p_user, uid, p_reason)
    on conflict do nothing;
  end if;
  perform public.notify(p_user, 'community_member_removed', uid,
    'You were removed from ' || c.name, coalesce(p_reason,''), null, null, c.id, null, '/community/' || c.slug::text);
end $function$;

create or replace function public.messages_prepare()
 returns trigger
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare c conversations; n int; uid uuid := auth.uid();
begin
  if new.is_system then new.sender_id := null; return new; end if;
  if uid is not null then new.sender_id := uid; new.created_at := now(); end if;
  select * into c from conversations where id = new.conversation_id;
  if c.kind = 'system' then raise exception 'not_allowed'; end if;
  if c.status = 'declined' then raise exception 'request_declined'; end if;
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

create or replace function public.update_community(p_id uuid, p_name text, p_description text, p_rules text[], p_category text, p_radius_km numeric)
 returns void
 language plpgsql
 security definer
 set search_path = public, extensions
as $function$
declare uid uuid := auth.uid(); c communities; is_owner boolean; v_rules text; r jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into c from communities where id = p_id;
  if not found then raise exception 'not_found'; end if;
  if not public.is_community_mod(p_id) then raise exception 'not_allowed'; end if;
  is_owner := coalesce(c.owner_id = uid, false) or public.is_admin();
  if (p_name is distinct from c.name or p_category is distinct from c.category or p_radius_km is distinct from c.radius_km)
     and not is_owner then raise exception 'not_allowed'; end if;
  select array_to_string(coalesce(p_rules,'{}'), E'\n') into v_rules;
  r := public.moderate_text(coalesce(p_name,'') || E'\n' || coalesce(p_description,'') || E'\n' || coalesce(v_rules,''),
                            'community', uid);
  if r->>'action' <> 'allow' then raise exception 'content_blocked'; end if;
  update communities set name = coalesce(p_name, name), description = coalesce(p_description, description),
    rules = coalesce(p_rules, rules), category = coalesce(p_category, category),
    radius_km = coalesce(p_radius_km, radius_km) where id = p_id;
end $function$;

create or replace function public.inbox_counts()
 returns jsonb
 language sql
 stable security definer
 set search_path = public, extensions
as $function$
  select jsonb_build_object(
    'chats', coalesce((select sum(m.unread_count) from conversation_members m join conversations c on c.id = m.conversation_id
                        where m.user_id = auth.uid() and (c.status = 'accepted') and not m.muted and not m.hidden), 0),
    'requests', (select count(*) from conversation_members m join conversations c on c.id = m.conversation_id
                  where m.user_id = auth.uid() and c.status = 'pending' and c.created_by is distinct from auth.uid()
                    and not m.hidden and c.last_message_at is not null),
    'notifications', (select count(*) from notifications where user_id = auth.uid() and read_at is null)) $function$;

create or replace function public.list_conversations(p_box text default 'chats'::text)
 returns table(id uuid, kind conversation_kind, status conversation_status, created_by uuid, is_request boolean, other_user_id uuid, other_username text, other_display_name text, other_avatar_url text, last_message_at timestamp with time zone, last_message_preview text, last_sender_id uuid, unread_count integer, muted boolean)
 language sql
 stable security definer
 set search_path = public, extensions
as $function$
  select c.id, c.kind, c.status, c.created_by, (c.status = 'pending' and c.created_by is distinct from auth.uid()),
         o.id, o.username::text, o.display_name, o.avatar_url,
         c.last_message_at, c.last_message_preview, c.last_sender_id, m.unread_count, m.muted
  from conversation_members m
  join conversations c on c.id = m.conversation_id
  left join profiles o on o.id = case when c.user_low = auth.uid() then c.user_high else c.user_low end
  where m.user_id = auth.uid() and not m.hidden
    and (c.kind = 'system' or c.last_message_at is not null)
    and (case when p_box = 'requests' then c.status = 'pending' and c.created_by is distinct from auth.uid()
              else c.kind = 'system' or c.status = 'accepted' or c.created_by = auth.uid() end)
  order by c.last_message_at desc nulls last $function$;

-- ---- 20261010000200_revoke_anon_rpc_execute.sql ----
-- 20261010000200_revoke_anon_rpc_execute.sql
-- Defense in depth: stop the `anon` role (anyone holding the public anon key)
-- from EXECUTE-ing SECURITY DEFINER functions in schema public.
--
-- BACKGROUND
--   Supabase's default privileges grant EXECUTE on every new function in
--   `public` to anon + authenticated + service_role (pg_default_acl, owner
--   postgres), and PostgreSQL itself grants EXECUTE to PUBLIC by default.
--   20260927001100_rls_grants.sql only revoked a short "internal" list, so 63
--   SECURITY DEFINER functions (admin_*, set_community_role, start_conversation,
--   submit_report, update_phone, ...) were reachable by anon over PostgREST
--   (/rest/v1/rpc/<name>). Their in-body auth checks are the only barrier;
--   this migration adds the missing privilege layer.
--
-- ANALYSIS (read-only queries on dev; prod is identical)
--   A function used inside an RLS policy, security_invoker view, column
--   DEFAULT, CHECK constraint, index expression, trigger WHEN clause or a
--   SECURITY INVOKER function runs with the CALLER's privileges and therefore
--   needs EXECUTE for the caller's role. Functions called inside SECURITY
--   DEFINER functions run as the owner (postgres) and need nothing. Trigger
--   functions are not EXECUTE-checked at fire time.
--   Scanned: pg_policies (qual + with_check, all schemas), view definitions,
--   pg_attrdef, CHECK/EXCLUDE constraints, index definitions, non-internal
--   triggers, and prosrc of every SECURITY INVOKER function in public.
--   Result:
--     - Referenced by a policy that applies to anon (roles = {public}):
--         is_admin, is_community_mod   (comments_read, comm_read, posts_read)
--     - Referenced only by `TO authenticated` policies (never evaluated for
--       anon, and authenticated keeps EXECUTE): can_participate, is_banned,
--       is_conversation_member  -> revoked from anon.
--     - No view, default, CHECK constraint, index or invoker function calls a
--       SECURITY DEFINER function (invoker functions only call the invoker
--       helper to_prefix_tsquery). No storage/other-schema policy references
--       public functions.
--     - is_blocked_between(uuid,uuid): referenced ONLY from the SECURITY
--       DEFINER functions comments_prepare, messages_prepare and
--       start_conversation (run as owner) and not by the mobile app, so it is
--       revoked from anon AND authenticated (service_role/owner keep it).
--   Logged-out screens call (mobile/src/api/profiles.ts): username_available,
--   suggest_usernames, email_available, get_profile (public profile page);
--   slug_available is allow-listed too. phone_available and accept_terms were
--   already anon-revoked and stay so.
--
-- WHAT THIS DOES
--   1. For every SECURITY DEFINER function in public NOT in v_keep: revoke
--      EXECUTE from PUBLIC and anon, then re-grant to authenticated and
--      service_role if they had it before (so nothing authenticated/Edge
--      Functions can call today is lost). Prints a NOTICE per function.
--   2. Raises if any non-kept SECURITY DEFINER function is still anon-callable.
--   3. Future functions (owner postgres, i.e. migrations): a per-schema ALTER DEFAULT
--      PRIVILEGES can only ADD to the built-in global default (EXECUTE to PUBLIC), so
--      PUBLIC is removed with the GLOBAL form (no IN SCHEMA), the per-schema anon
--      default entry is revoked, and authenticated + service_role are granted
--      explicitly. supabase_admin defaults are not touched.
--   4. Unrelated but same theme: login_attempts had full table privileges
--      (incl. TRUNCATE, which bypasses RLS) for anon/authenticated, which would
--      let anyone reset the login throttle. Revoked; service_role is unchanged.
--   SECURITY INVOKER functions (posts_near, search_*, communities_near, helpers)
--   are intentionally untouched: they obey the caller's RLS/table privileges.
--
-- TEST: supabase/tests/security_rpc_access.sql
--   npx.cmd supabase db query --linked --file supabase/tests/security_rpc_access.sql
--   (passes only by ending in "ALL SECURITY RPC ACCESS CHECKS PASSED (rolled back)")
--
-- ROLLBACK (manual): grant execute on all functions in schema public to anon;

do $mig$
declare
  -- Functions that STAY executable by anon (SECURITY DEFINER only).
  v_keep text[] := array[
    'is_admin',          -- called from anon-applicable RLS policies (comments_read, comm_read, posts_read); policy exprs run as the caller
    'is_community_mod',  -- called from anon-applicable RLS policies (comments_read, posts_read)
    'get_profile',       -- public profile page (user/[username]) is viewable logged out
    'username_available',-- sign-up screen, before a session exists
    'slug_available',    -- allow-listed: community slug check (harmless boolean)
    'suggest_usernames', -- sign-up screen, before a session exists
    'email_available'    -- sign-up screen, before a session exists
  ];
  -- Also revoked from authenticated (only ever called from other definer fns).
  v_internal text[] := array['is_blocked_between'];
  r record;
  v_missing text;
  v_left text;
  n int := 0;
begin
  -- Typo guard: every keep/internal entry must exist as a public function.
  select string_agg(k, ', ') into v_missing
    from unnest(v_keep || v_internal) k
   where not exists (select 1 from pg_proc p
                      where p.pronamespace = 'public'::regnamespace and p.proname = k);
  if v_missing is not null then
    raise exception 'keep/internal list names unknown function(s): %', v_missing;
  end if;

  for r in
    select p.oid, p.oid::regprocedure::text as sig, p.proname,
           has_function_privilege('authenticated', p.oid, 'execute') as had_auth,
           has_function_privilege('service_role',  p.oid, 'execute') as had_srv,
           has_function_privilege('anon',          p.oid, 'execute') as had_anon
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind in ('f', 'p')
       and p.prosecdef
       and not (p.proname = any (v_keep))
     order by 2
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = any (v_internal) then
      execute format('revoke execute on function %s from authenticated', r.sig);
    elsif r.had_auth then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if r.had_srv then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
    if r.had_anon then
      n := n + 1;
      raise notice 'revoked anon/public execute: %', r.sig;
    end if;
  end loop;
  raise notice 'total functions revoked from anon: %', n;

  select string_agg(p.oid::regprocedure::text, ', ') into v_left
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not (p.proname = any (v_keep))
     and has_function_privilege('anon', p.oid, 'execute');
  if v_left is not null then
    raise exception 'still anon-executable after revoke: %', v_left;
  end if;
end
$mig$;

-- Future functions created by migrations (role postgres) are private by default.
-- Global form: removes the built-in PUBLIC EXECUTE (an IN SCHEMA revoke cannot).
alter default privileges for role postgres revoke execute on functions from public;
-- pg_default_acl also holds an explicit per-schema anon entry for postgres/public.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public grant  execute on functions to authenticated, service_role;

-- Throttle table is service_role-only (RLS on, no policies); also drop the
-- table-level privileges that bypass RLS (TRUNCATE) or are never needed.
revoke all on table public.login_attempts from public, anon, authenticated;


-- ---- 20261012000100_chat_attachments.sql ----
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


-- ---- 20261012000200_chat_attachments_removed_cleanup.sql ----
-- Retention clean-up now also covers photos on messages a moderator removed.
-- The clean-up job (Edge Function, runs daily) deletes the files through the
-- Storage API; this only widens which files it is told about.

set search_path = public, extensions;

create or replace function public._expired_chat_attachments(p_days int default 90, p_orphan_hours int default 24)
returns setof text
language sql stable security definer set search_path = public, extensions, storage as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-attachments'
     and (o.created_at < now() - make_interval(days => p_days)
          or (o.created_at < now() - make_interval(hours => p_orphan_hours)
              and not exists (select 1 from public.messages m where m.attachment_path = o.name))
          or exists (select 1 from public.messages m
                      where m.attachment_path = o.name and m.mod_status = 'removed')) $$;

revoke execute on function public._expired_chat_attachments(int, int) from public, anon, authenticated;
grant execute on function public._expired_chat_attachments(int, int) to service_role;


-- ---- 20261012000300_chat_photo_cap_and_push_priority.sql ----
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


-- ---- 20261012000400_delete_messages.sql ----
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

