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
