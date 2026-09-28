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
