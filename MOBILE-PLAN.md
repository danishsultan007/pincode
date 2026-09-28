# MOBILE-PLAN.md: pincode · your neighborhood (native app, v2)

> **Audience:** the Sonnet coding agent that builds this app. Follow the plan file by file and in the phase order in §9. Every decision is already made. Where something is ambiguous, use the default in §10. Do not modify the web prototype (`index.html`, `app.js`, `store.js`, `geo.js`, `pincodes.js`, `styles.css`, `serve.ps1`). Read `store.js` (for the seed data) and `styles.css` (for the tokens) as references only.
>
> **Repo root:** `C:\Users\Danish Sultan\Documents\Mohalla`. The new code goes only in `mobile/`, `supabase/`, `SETUP.md` and `MOBILE-PLAN.md`.

---

## 0. Summary of key decisions

| Topic | Decision |
|---|---|
| Expo SDK | **SDK 57** (stable since 30 Jun 2026: React Native 0.86.3, React 19.2.3, TypeScript ~6.0.3). Expo packages now share the `57.x` version line. |
| Router | Expo Router `~57.0.23` with the `src/app` directory. Since SDK 56 Expo Router no longer uses React Navigation, so **never import `@react-navigation/*`**. Import `Stack`, `Tabs`, `Redirect`, `useRouter`, `useLocalSearchParams`, `useFocusEffect` from `expo-router`, and theme items from `expo-router/react-navigation`. `typedRoutes` is **off**, so `tsc` works without generated types. |
| Web | `web.output: "single"` (SPA, no static rendering). Leaflet touches `window` at import time and would crash static rendering. |
| Auth | Supabase Auth. Google uses the **browser-based PKCE flow** (`signInWithOAuth` + `expo-web-browser` + `exchangeCodeForSession`). It works in Expo Go, dev builds and the web, and needs only the Google **Web** OAuth client. Email and password is the fallback. The Android and iOS Google client IDs are created (see SETUP) and kept as placeholder env vars for a later native sign-in, but v1 does not use them. |
| Onboarding | Mandatory for every account: username (with suggestions) → phone (+91) → home area and interests. The whole step is one atomic RPC, `complete_onboarding`. |
| Data access | Supabase JS v2 with an **untyped client**. Hand-written TS models live in `src/types/models.ts`. Server-side reads go through **security-invoker views** (`post_cards`, `comment_cards`, `community_cards`) and **RPCs**. Every write is checked by RLS plus triggers or by SECURITY DEFINER RPCs. |
| Push | Expo Push API, called **from Postgres via `pg_net`** in an AFTER INSERT trigger on `notifications` (and on `messages`). This acts as a DB-level webhook, so **no Edge Functions are needed in v1** and the user never has to deploy anything with a CLI. |
| Expiry and bans | Computed at read time (`expires_at < now()`, `banned_until > now()`), so there are no cron jobs. |
| Maps | `react-native-maps` 1.27.2 on native (it ships in Expo Go and needs no key there) and `leaflet` + `react-leaflet` on web. Both implement one shared props interface through platform files. |
| State | `@tanstack/react-query` v5 for server state, plus React context for session, location and toast. |
| Icons | Our own `Icon` component on `react-native-svg`, using Feather-style (MIT) paths. `@expo/vector-icons` is deprecated since SDK 56 and is not used. |
| Theme | Light only, with one teal accent `#0f766e` and no emoji anywhere in the chrome. The only emoji are the six reaction glyphs, which are user content. |
| Reactions | Stored as **codes** (`like`, `love`, `haha`, `wow`, `thanks`, `celebrate`) and mapped to 👍 ❤️ 😂 😮 🙏 🎉 in the client. This avoids emoji variation-selector mismatches between the client and the DB. |
| Threads | Stored depth is 0–8. The UI shows depths 0–2 inline, and a deeper reply shows "Continue this thread →", which opens the thread screen. |
| Community creation | Needs **reputation ≥ 100, account age ≥ 30 days, no strike in the last 90 days, not banned, and fewer than 3 owned communities**. Enforced in `create_community`. |
| Strike ladder | Counts strikes from the last 365 days: 1 = **warning**, 2 = **final warning**, 3 = **7-day suspension**, 4 and above = **permanent ban**. A strike marked "severe" means an immediate permanent ban. |
| Phone | India only, E.164 `+91[6-9]XXXXXXXXX`, unique. Stored **unverified** (OTP is deferred). |

---

## 1. Architecture overview

```
 Expo app (iOS / Android / Web)
   ├─ Expo Router screens ── react-query hooks ── src/api/* (thin supabase calls)
   ├─ AuthProvider (session + my profile)  LocationProvider (lat/lng/area/radius)
   ├─ Realtime channels: notifications(user), conversation_members(user), messages(conversation)
   └─ expo-notifications: registers Expo push token → push_tokens table
            │  HTTPS (anon/publishable key + user JWT)
 Supabase
   ├─ Auth (Google OAuth PKCE, email/password)  → trigger creates profiles/private_profiles
   ├─ Postgres + PostGIS + pg_trgm + citext + pg_net
   │    tables + RLS + column grants; triggers for counters, reputation, badges,
   │    notifications, content filter, moderation queue; RPCs for feed/search/admin
   │    notifications INSERT → send_push() → net.http_post → https://exp.host/--/api/v2/push/send
   ├─ Realtime (postgres_changes on messages, notifications, conversation_members, conversations)
   └─ Storage bucket "avatars" (public read, owner write)
```

### 1.1 Folder tree

```
Mohalla/
├─ MOBILE-PLAN.md                 (this file)
├─ SETUP.md                       (user steps, §9 P9 content)
├─ supabase/
│  ├─ README.md                   (order to run files; CLI alternative)
│  ├─ migrations/
│  │  ├─ 20260927000100_extensions_helpers.sql
│  │  ├─ 20260927000200_profiles.sql
│  │  ├─ 20260927000300_posts_comments.sql
│  │  ├─ 20260927000400_reputation_badges.sql
│  │  ├─ 20260927000500_notifications_push.sql
│  │  ├─ 20260927000600_messaging.sql
│  │  ├─ 20260927000700_communities.sql
│  │  ├─ 20260927000800_feed_search.sql
│  │  ├─ 20260927000900_moderation.sql
│  │  ├─ 20260927001000_storage_realtime.sql
│  │  └─ 20260927001100_rls_grants.sql
│  ├─ seed.sql
│  └─ tests/smoke.sql             (transaction + rollback; RLS/trigger assertions)
└─ mobile/
   ├─ package.json  app.config.ts  tsconfig.json  expo-env.d.ts
   ├─ .env.example  .gitignore  README.md  eas.json
   └─ src/
      ├─ app/                         (Expo Router routes, see §4)
      ├─ components/
      │  ├─ ui/        Text.tsx Button.tsx IconButton.tsx Icon.tsx Chip.tsx ChipRow.tsx Segmented.tsx
      │  │             TextField.tsx SearchInput.tsx Avatar.tsx Card.tsx Divider.tsx RingDivider.tsx
      │  │             EmptyState.tsx Banner.tsx Screen.tsx Header.tsx ListRow.tsx SectionTitle.tsx
      │  │             Sheet.tsx (modal body wrapper) Badge.tsx Skeleton.tsx AvailabilityHint.tsx
      │  ├─ post/      PostCard.tsx AlertMini.tsx AlertsStrip.tsx TypeLabel.tsx DateBlock.tsx
      │  │             PostStatusLine.tsx VoteButton.tsx ReactionBar.tsx PhoneReveal.tsx
      │  │             ShareRow.tsx PostActions.tsx FeedList.tsx
      │  ├─ comments/  CommentThread.tsx CommentItem.tsx CommentComposer.tsx
      │  ├─ map/       PostsMap.tsx (web/leaflet) PostsMap.native.tsx PostsMap.types.ts
      │  │             LocationPickerMap.tsx (web) LocationPickerMap.native.tsx Crosshair.tsx
      │  ├─ chat/      ConversationRow.tsx MessageBubble.tsx MessageComposer.tsx RequestBar.tsx
      │  ├─ community/ CommunityCard.tsx CommunityHeader.tsx MemberRow.tsx
      │  ├─ profile/   ProfileHeader.tsx StatsRow.tsx BadgeList.tsx InterestChips.tsx
      │  ├─ notifications/ NotificationRow.tsx
      │  └─ forms/     DateTimeChips.tsx DurationChips.tsx TagPicker.tsx InterestPicker.tsx
      ├─ providers/    AuthProvider.tsx LocationProvider.tsx QueryProvider.tsx ToastProvider.tsx
      │                RealtimeProvider.tsx PushProvider.tsx
      ├─ api/          posts.ts comments.ts profiles.ts chat.ts notifications.ts
      │                communities.ts search.ts moderation.ts admin.ts
      ├─ hooks/        useFeed.ts usePost.ts useComments.ts useProfile.ts useInbox.ts
      │                useCommunities.ts useSearch.ts useDebounced.ts useRequireAuth.ts useAdmin.ts
      ├─ lib/          env.ts supabase.ts auth.ts location.ts pincodes.ts geo.ts format.ts
      │                phone.ts username.ts share.ts errors.ts confirm.ts push.ts
      │                constants.ts copy.ts feedGroups.ts tree.ts
      ├─ theme/        tokens.ts
      └─ types/        models.ts css.d.ts
```

---

## 2. Database (Supabase Postgres)

### 2.0 Conventions (the agent must follow all of these)

1. Every migration file starts with `set search_path = public, extensions;`. PostGIS, citext and pg_trgm live in the `extensions` schema.
2. Every function has `set search_path = public, extensions` (the definer ones especially).
3. Errors are raised as **plain keys**, `raise exception 'username_taken';`, and the client maps them to copy in `src/lib/errors.ts`. Full key list: `not_authenticated, not_allowed, not_found, username_invalid, username_taken, username_reserved, username_change_too_soon, display_name_invalid, display_name_reserved, phone_invalid, phone_taken, username_or_phone_taken, rate_limited_posts, rate_limited_comments, rate_limited_messages, rate_limited_requests, rate_limited_reports, self_vote, own_post, not_an_alert, not_an_answer, post_not_found, bad_parent, parent_deleted, thread_too_deep, blocked, request_pending, request_pending_accept_first, request_declined, content_blocked, not_a_member, community_unavailable, community_not_eligible, slug_invalid, slug_taken, owner_cannot_leave, already_reported, cannot_report_self, already_resolved, bad_decision`.
4. **Trigger naming decides firing order** (Postgres fires same-timing triggers alphabetically): `t10_*` prepare/normalize, `t20_*` content filter, `t30_*` community checks, `t50_*` counters/reputation (AFTER), `t60_*` notifications (AFTER), `t70_*` moderation enqueue (AFTER).
5. **"No-JWT bypass":** when `auth.uid() is null` (SQL editor, seed, service role), triggers skip rate limits, reputation caps and the content filter, and keep explicit `created_at`/`author_id` values. Clients always carry a JWT (anon cannot insert), so this is safe.
6. Functions prefixed `_` are internal. Revoke EXECUTE on them (and on `award_rep`, `revoke_rep`, `award_badge`, `notify`, `send_push`, `moderate_text`) from `public, anon, authenticated` in the grants file.
7. PL/pgSQL binds late. Functions may call functions defined in a later file, **because all migrations run in one sitting before any data exists**. Run them strictly in filename order.
8. Tables enable RLS at creation. All policies and grants live in `…001100_rls_grants.sql`.

### 2.1 `20260927000100_extensions_helpers.sql`

```sql
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
```

### 2.2 `20260927000200_profiles.sql`

```sql
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
    if public.username_available(cand) and not (cand = any(found)) then found := found || cand; end if;
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
```

### 2.3 `20260927000300_posts_comments.sql`

```sql
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
```

**Trigger functions.** Write them all as `security definer set search_path = public, extensions`.

```sql
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
```

**Votes, reactions and confirmations** (AFTER triggers, all definer):

```sql
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
-- public.comment_reactions_after(): identical but on comments/comment_id. Trigger t50_comment_reactions.

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
```

**Solved, delete comment and reveal phone:**

```sql
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
```

### 2.4 `20260927000400_reputation_badges.sql`

**Point values (final):**

| Event | Recipient | Points | Reversal |
|---|---|---|---|
| Post upvote | post author | +1 | Vote removed → the ledger row is deleted and the points are subtracted |
| Comment upvote ("Helpful" on answers) | comment author | +2 | Same |
| Answer marked "This solved it" | answer author | +15 | Unsolved or switched → revoked |
| Alert "still happening" confirmation | alert author | +1 | none |
| Content removed by an admin | author | −10 | none |

**Anti-abuse rules** (applied only when `auth.uid()` is not null):

- No self-votes or self-confirmations. The triggers raise `self_vote` or `own_post`.
- A voter whose account is younger than 24 h gives **0 points**. The vote still counts toward the displayed total.
- A recipient earns at most **50 points per IST day** from upvotes and confirmations combined.
- The same voter can give the same recipient at most **5 points per day**.
- Solved: one asker can give one answerer points for at most **3 solves per rolling 7 days**. Further solves award 0.
- Zero-point events are still written to the ledger, so that removing a vote reverses cleanly.

```sql
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
```

### 2.5 `20260927000500_notifications_push.sql`

**Every event that creates a notification** (kind → recipient → trigger point → pref category):

| kind | Recipient | Created by | Pref key |
|---|---|---|---|
| `post_answer` | post author | top-level answer on their Ask (comments t60) | answers |
| `post_comment` | post author | any other comment on their post (not already notified as the parent author) | replies |
| `comment_reply` | parent comment author | a reply to their comment | replies |
| `answer_solved` | answer author | `_set_solved` | answers |
| `post_upvotes` | post author | upvote milestones 1, 5, 10, 25, 50, 100 | votes |
| `comment_upvotes` | comment author | milestones 1, 5, 10, 25 | votes |
| `badge_earned` | user | `award_badge` | votes |
| `alert_confirmed` | alert author | first and fifth "still on"; auto-resolved by 2 neighbors | alerts |
| `alert_nearby` | users whose home is within 2 km of a new visible Alert (max 300) | posts t60 | alerts |
| `message_request` | recipient | first message in a pending conversation | messages |
| `request_accepted` | requester | `respond_to_request('accept')` | messages |
| `community_new_post` | members with `notify_posts = true` (max 500) | posts t60 (community) | communities |
| `community_role` | member | made or removed as moderator | communities |
| `community_post_removed` | post author | a mod removes the post from the community | communities |
| `community_member_removed` | member | a mod removes or bans them | communities |
| `content_held` | author/sender | content filter or report threshold hid their item | always (moderation) |
| `content_restored` | author | admin restored the item | always |
| `content_removed` | author | admin removed the item | always |
| `warning` | user | strikes 1–2 (also a system chat message) | always |
| `suspension` | user | strike 3 (7 days) or a permanent ban (also a system chat message) | always |
| `ban_lifted` | user | `admin_lift_ban` | always |
| `report_update` | reporters | admin actioned the reported item | always |
| `mod_queue` | every admin | new open queue item (throttled to 1 per admin per 10 min) | always |

Chat messages in **accepted** conversations send a push directly from the messages trigger (pref `messages`, conversation not muted) and **create no notification row**. The unread counts in the chat list cover them.

Reactions never create notifications (too noisy).

```sql
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
```

### 2.6 `20260927000600_messaging.sql`

**Rules**

- There is one direct conversation per pair of users (`user_low < user_high`, unique).
- `start_conversation` creates it as **pending**. While it is pending, the creator can send **exactly one** message. The recipient sees the conversation under **Requests** with **Accept / Decline / Block**. The recipient must accept before replying.
- A declined conversation accepts no further messages, and the sender sees "Message not delivered".
- Block inserts a row in `blocks` and declines the conversation. Blocks stop DMs in both directions, stop comments and replies between the two users, and hide the blocked author's posts and notifications from the blocker.
- Each user has one **system** conversation with "pincode Team" (`sender_id` null, `is_system` true). It is read-only for the user.

```sql
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
```

### 2.7 `20260927000700_communities.sql`

```sql
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
```

**Functions** (all definer; signatures are final, bodies follow the rules given):

- `can_create_community() returns jsonb`. Returns `{allowed, reasons[], reputation, required_reputation:100, account_age_days, required_age_days:30, owned, max_owned:3}`. The reasons are `reputation`, `account_age`, `account_status` (not onboarded or banned), `recent_strike` (any strike in the last 90 days) and `owned_limit` (3 or more non-removed owned communities). Age is `extract(day from now() - profiles.created_at)`.
- `slug_available(p_slug text) returns boolean`. Checks the regex and uniqueness.
- `create_community(p_slug, p_name, p_description, p_rules text[], p_kind community_kind, p_category text, p_lat, p_lng, p_radius_km numeric, p_pincode, p_area, p_city) returns text` (the slug). Steps: check `can_create_community()->>'allowed'` (else `community_not_eligible`), then the slug regex and uniqueness (`slug_invalid` / `slug_taken`), then `moderate_text(name||description||rules, 'community', uid)`, where anything other than `allow` raises `content_blocked`. Then insert, insert the owner membership, and call `award_badge(uid, 'community_founder')`.
- `update_community(p_id, p_name, p_description, p_rules, p_category, p_radius_km) returns void`. A moderator may change description and rules. Only the owner (or an admin) may change name, category and radius. Runs the content filter.
- `join_community(p_id)` and `leave_community(p_id)` are **direct table ops** under RLS (see §2.11). The owner cannot leave (a BEFORE DELETE trigger raises `owner_cannot_leave` unless an admin is removing them).
- `set_community_role(p_comm, p_user, p_role community_role) returns void`. Owner or admin only; `p_role in ('moderator','member')`; the target is an existing non-owner member. Sends a `community_role` notification. Promotion awards `community_moderator`.
- `remove_community_member(p_comm, p_user, p_reason text, p_ban boolean default true) returns void`. The caller must be a moderator. Only the owner or an admin may remove a moderator, and nobody can remove the owner. Deletes the membership, inserts `community_bans` if `p_ban`, and notifies `community_member_removed`.
- `unban_community_member(p_comm, p_user)`. Moderator only.
- `mod_set_post_removed(p_post uuid, p_removed boolean, p_reason text) returns void`. The caller must be a moderator of `post.community_id`. Sets `community_removed`. On removal, notifies the author with `community_post_removed`.

Triggers:

```sql
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
```

- `t50_posts_community_count` (AFTER INSERT/DELETE on posts): adjusts `communities.post_count`.
- `t60_posts_notify_community` (AFTER INSERT on posts, community not null, visible): inserts `community_new_post` for members with `notify_posts` (excluding the author, limit 500). The title is `'New in ' || community.name || ': ' || title` and the URL is `/post/<id>`.
- `t50_community_members_counters` (AFTER INSERT/DELETE): adjusts `communities.member_count` and `profiles.community_count`.
- `t10_community_members_guard` (BEFORE DELETE): raises `owner_cannot_leave` when `old.role = 'owner'` and `not is_admin()`.

### 2.8 `20260927000800_feed_search.sql`

The views are **security invoker**, so RLS applies. The client computes the distance with haversine.

```sql
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
```

**Search ranking decision:** separate RPCs per tab (Posts, Communities, Users), loaded lazily for the active tab only. Post results within `p_near_km` (5 km) come first, then relevance, then recency. There is no `search_all`, which avoids three queries per keystroke.

### 2.9 `20260927000900_moderation.sql`

```sql
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
          v_flag := true; reasons := reasons || 'link_from_new_account'; end if;
      elsif t.category = 'phone' then
        if p_scope = 'message' then continue; end if;
        if p_scope = 'message_request' then v_flag := true; reasons := reasons || 'phone_in_request'; continue; end if;
        select (select count(*) from posts where author_id = p_author and has_phone_text and created_at > now() - interval '24 hours')
             + (select count(*) from comments where author_id = p_author and has_phone_text and created_at > now() - interval '24 hours')
          into v_recent;
        if v_recent >= 3 then v_flag := true; reasons := reasons || 'phone_spam'; end if;
      elsif t.action = 'block' then v_block := true; reasons := reasons || t.category;
      else v_flag := true; reasons := reasons || t.category; end if;
    end if;
  end loop;
  return jsonb_build_object('action', case when v_block then 'block' when v_flag then 'flag' else 'allow' end,
                            'reasons', to_jsonb(reasons));
end $$;
```

**The content-filter BEFORE triggers** (`t20_*`) are attached to posts (INSERT, or UPDATE OF title/body), comments (INSERT, or UPDATE OF body) and messages (INSERT). Logic:

1. Build the text (post = title + body).
2. Always set `has_phone_text := _has_pattern(txt,'phone')` and `has_link := _has_pattern(txt,'url')`.
3. If `auth.uid() is null`, or it is a system message, or it is a comment update where `new.body = '[deleted]'`, return.
4. `r := moderate_text(txt, scope, author)`. The scope for messages is `'message_request'` when the conversation is pending, else `'message'`.
5. `block` → `raise exception 'content_blocked'`.
6. `flag` → `new.mod_status := 'pending'; new.mod_reason := 'auto: ' || reasons`.
7. Return new.

**The enqueue AFTER triggers** (`t70_*_enqueue`, shared function `public.enqueue_if_pending()` with `tg_argv[0]` = target type) are attached to posts, comments and messages (AFTER INSERT OR UPDATE OF mod_status). When `new.mod_status = 'pending'` and (INSERT, or `old.mod_status <> 'pending'`):

- Read the author generically: `coalesce(to_jsonb(new)->>'author_id', to_jsonb(new)->>'sender_id')::uuid`. Build the excerpt as `left(coalesce(to_jsonb(new)->>'title','') || ' ' || coalesce(to_jsonb(new)->>'body',''), 280)`.
- Upsert into `moderation_queue` with `on conflict (target_type, target_id) where status = 'open' do update set reasons = moderation_queue.reasons || excluded.reasons`. The source is `'filter'` when `mod_reason like 'auto:%'`, else `'reports'`.
- `notify(author, 'content_held', null, 'Your <type> is being reviewed', 'It is hidden while the pincode Team takes a look, usually within a day.', …, url)`.
- `perform _notify_admins()`. This inserts a `mod_queue` notification ("New item in the moderation queue", url `/admin`) for each admin who has no `mod_queue` notification in the last 10 minutes.

**RPCs:**

```sql
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
```

- `_excerpt(type, id) returns text`: 280 characters of title/body, the username for `user`, the name for `community`.
- `_set_mod_status(type report_target, id uuid, status mod_status, reason text)`: updates `posts`, `comments` or `messages` (`mod_status`, `mod_reason`). For `community` + `removed` it sets `communities.is_removed = true`. For `user` it does nothing.
- `admin_resolve_item(p_item uuid, p_decision text, p_strike boolean default false, p_reason text default null, p_category report_category default 'other', p_severe boolean default false) returns void`. Admin only; the item must be open, else `already_resolved`.
  - `restore` / `dismiss`: `_set_mod_status(..., 'visible', null)` (for restore, only if it was pending or removed). Open reports → `dismissed`. If it was hidden, notify the author with `content_restored`.
  - `remove`: `_set_mod_status(..., 'removed', p_reason)`, then `award_rep(author, auth.uid(), 'moderation_penalty', target_id, -10)`. Open reports → `actioned`. Notify the author with `content_removed` (body = reason). Notify each reporter with `report_update` ("Thanks for your report. We removed content that broke our guidelines.").
  - Anything else raises `bad_decision`.
  - If `p_strike`: `v_strike := admin_issue_strike(target_user, coalesce(p_reason,'Community guidelines violation'), p_category, p_severe, p_item)`.
  - Set the queue `status = 'resolved'`, `resolution`, `strike_id`, `resolved_at` and `resolved_by`. Insert into `moderation_actions`.
- `admin_issue_strike(p_user uuid, p_reason text, p_category report_category, p_severe boolean default false, p_queue uuid default null) returns uuid`. Admin only.
  - `n := (count of strikes in the last 365 days) + 1`.
  - `action := case when p_severe then 'permanent_ban' when n = 1 then 'warning' when n = 2 then 'final_warning' when n = 3 then 'suspension_7d' else 'permanent_ban' end`.
  - Insert the strike. Update the profile: `strike_count + 1`; for a suspension, `banned_until = greatest(coalesce(banned_until, now()), now()) + interval '7 days'`; for a permanent ban, `ban_permanent = true`.
  - Send a **system chat message** (`_send_system_message`) with these templates, where `%1$s` = category and `%2$s` = reason:
    - warning: `Warning from pincode Team (%1$s): %2$s. This is your first strike. Please follow the community guidelines. Repeated violations lead to a suspension.`
    - final_warning: `Final warning from pincode Team (%1$s): %2$s. This is your second strike in 12 months. One more and your account will be suspended for 7 days.`
    - suspension_7d: `Your account is suspended until <DD Mon YYYY, HH12:MI AM IST> (%1$s): %2$s. You can still read, but you cannot post, comment, react, vote or message. Another violation leads to a permanent ban.`
    - permanent_ban: `Your account has been permanently banned (%1$s): %2$s.`
  - Notify: `warning` kind for warning and final_warning, `suspension` kind for the rest. The URL is `/chat/<system conversation id>`.
  - Log to `moderation_actions`.
- `admin_lift_ban(p_user uuid, p_note text) returns void`: clears `banned_until` and `ban_permanent`, sends a system message and a `ban_lifted` notification, and logs the action.
- `admin_remove_content(p_type report_target, p_id uuid, p_reason text, p_strike boolean default false, p_category report_category default 'other', p_severe boolean default false) returns void`: upserts an open queue item with `source = 'admin'`, then calls `admin_resolve_item(item, 'remove', ...)`.
- `admin_test_filter(p_text text, p_scope text) returns jsonb`: admin only. Calls `moderate_text(p_text, p_scope, auth.uid())`.

**Ban enforcement is in RLS.** Every INSERT policy on content tables requires `can_participate()` (see §2.11), and the RPCs `start_conversation`, `create_community` and `reveal_post_phone` check it too. A banned user can still sign in, read, see their system chat, edit notification prefs, report, and delete their account.

### 2.10 `20260927001000_storage_realtime.sql`

```sql
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
```

Avatar path: `avatars/<uid>/avatar-<timestamp>.jpg`. `profiles.avatar_url` stores the public URL.

### 2.11 `20260927001100_rls_grants.sql` (policies and grants for every table)

```sql
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
-- repeat for post_reactions (pr_*), comment_votes (cv_*), comment_reactions (cr_*)
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
grant insert (community_id), delete on community_members to authenticated;
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
```

`reserved_usernames` has RLS enabled and no policies, so it is only reachable through definer functions. Every other public RPC keeps the default EXECUTE and checks `auth.uid()` or `is_admin()` itself.

### 2.12 `supabase/seed.sql` (Mahadevapura demo data)

Run it after all migrations, in the SQL editor. There is no JWT there, so the triggers keep the explicit timestamps and authors and skip the caps and the filter.

1. **Users.** Insert about 32 users into `auth.users` with fixed ids `00000000-0000-4000-8000-0000000000NN` (NN = 01…32). Use exactly these columns:
   - `instance_id = '00000000-0000-0000-0000-000000000000'`, `aud = 'authenticated'`, `role = 'authenticated'`
   - `email = '<username>@demo.pincode.invalid'`, `encrypted_password = ''` (seed users cannot sign in)
   - `email_confirmed_at = now()`, `raw_app_meta_data = '{"provider":"email","providers":["email"]}'`
   - `raw_user_meta_data = jsonb_build_object('full_name', <name>)`
   - `created_at = now() - interval '<120..400> days'`, `updated_at = now()`
   - `confirmation_token = ''`, `recovery_token = ''`, `email_change_token_new = ''`, `email_change = ''`. **Empty strings, not NULL**, or the Supabase Auth dashboard fails to list users.

   The trigger creates the profiles. Then `update public.profiles set username = …, bio = …, interests = …, home_area = …, home_pincode = …, onboarded_at = created_at` for each user.

   Names come from the prototype authors and commenters: Priya, Kavitha, Rohan, Anjali, Lakshmi, Deepak, Suresh, Meera, Neha, Imran, Sunita, Karthik, Vijay, Farah, Arjun, Divya, Nisha, Ganesh, Mr. Iyer, Pooja, Ravi, Rekha, Anita, Sneha, Kabir, Latha, Ankit, Farhan, Zara, Kiran, Bhavani, and "RWA Gachibowli". Usernames look like `priya_hoodi`, `kavitha_cooks`, `iyer_sir`, `rwa_gachibowli`, and must pass `^[A-Za-z][A-Za-z0-9_]{2,19}$` without reserved words. Where the same first name appears in two cities, use one user.

2. **Communities** (ids `00000000-0000-4000-b000-0000000000NN`):

   | slug | name | kind/category | center (lat,lng) | radius km | owner | moderators |
   |---|---|---|---|---|---|---|
   | hoodi-neighbors | Hoodi Neighbors | area/area | 12.9913, 77.7159 | 2 | Priya | Rohan |
   | mahadevapura-parents | Mahadevapura Parents | interest/parents | 12.9915, 77.6944 | 4 | Divya | Anjali |
   | brookefield-pet-parents | Brookefield Pet Parents | interest/pets | 12.9680, 77.7150 | 3 | Nisha | Ganesh |
   | mahadevapura-wellness | Mahadevapura Wellness | interest/fitness | 12.9880, 77.6990 | 4 | Sneha | none |
   | kr-puram-civic-watch | KR Puram Civic Watch | area/civic | 13.0077, 77.6960 | 3 | Rekha | Arjun |
   | bellandur-lake-volunteers | Bellandur Lake Volunteers | interest/environment | 12.9260, 77.6762 | 5 | Karthik | none |
   | indiranagar-foodies | Indiranagar Foodies | interest/food | 12.9784, 77.6408 | 3 | Kabir | none |

   Each community gets a 2–3 sentence description, 3 rules, the owner and moderator memberships, and 4–10 regular members drawn from the seed users.

3. **Posts.** **Transcribe all 26 posts from `store.js` → `seedPosts()` exactly** (title, body, type, tag, kind, lat/lng, area, pincode, city, author, age, phone, upvotes, comments with offsets and helpful counts, solved index, stillOn, untilIn, startsIn/durMs, status/expiresIn).
   - Ids: `00000000-0000-4000-9000-000000000101` to `…114` for `seed-mdp-01..14`, and `…201` to `…212` for `seed-oth-01..12`.
   - Mapping rules:
     - `created_at = now() - age`
     - alert `untilIn` → `ends_at = now() + untilIn`
     - event: `starts_at = now() + startsIn` and `ends_at = starts_at + durMs`
     - phone `'9845012345'` → `phone_e164 = '+919845012345'` (the trigger rounds the location)
     - `seed-mdp-05` (`status: "expired"`) → insert with `created_at = now() - 40 days`; it expires automatically, and `expires_at` is computed.
   - Community assignment: mdp-01 and mdp-09 → hoodi-neighbors; mdp-07 → mahadevapura-parents; mdp-08 → brookefield-pet-parents; mdp-14 → mahadevapura-wellness; mdp-12 → kr-puram-civic-watch; oth-04 stays null. The author must be a member of the community.
4. **Comments.** Ids are `'00000000-0000-4000-a000-' || lpad(post_seq,6,'0') || lpad(comment_seq,6,'0')`. `created_at = post.created_at + offset`. The first-answer and answer counters come from the triggers.

   Add these nested replies to demonstrate threads:
   - mdp-01, comment 1 (Kavitha) ← reply from Priya: "That would be great, messaging you now." ← reply from Kavitha: "Sent you her details."
   - mdp-03, comment 1 (Suresh) ← reply from Deepak: "Do you have his number?" ← reply from Suresh: "Messaged you on pincode."
   - mdp-08, comment 1 (Ganesh) ← reply from Nisha: "Thank you! Heading there now."
5. **Votes.** Use temp helpers in the seed:
   - `create function pg_temp.seed_post_votes(p uuid, n int)` inserts `n` `post_votes` from the first `n` seed users who are not the author.
   - `pg_temp.seed_comment_votes(c uuid, n int)` does the same for comment helpful counts.
   - `pg_temp.seed_still_on(p uuid, n int)` inserts `alert_confirmations(kind = 'still_on')`.

   The triggers award reputation and write notifications, which is fine.
6. **Solved.** `select public._set_solved(post_id, comment_id)` for every post with `solved`.
7. **Reactions.** Add a few `comment_reactions`: 3 × `thanks` and 2 × `like` on the mdp-01 Kavitha answer, 2 × `thanks` on the mdp-04 Imran answer, 1 × `love` on the mdp-08 Ganesh comment.
8. Finish with `select count(*) from posts;` (26 expected).

### 2.13 `supabase/tests/smoke.sql`

Run it in the SQL editor. It wraps everything in `begin; … rollback;`. For each check, impersonate a seed user with `set local role authenticated; select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);` and use `do $$ begin … assert …; end $$;`. Reset with `reset role;` between users.

Assertions:

1. `select count(*) from posts_near(12.9915, 77.6944, 10)` ≥ 8.
2. `username_available('priya_hoodi')` is false, and `username_available('fresh_name_77')` is true.
3. `(select count(*) from suggest_usernames('hoodi', 5))` = 5.
4. A self-vote on your own post raises `self_vote`.
5. Inserting a comment containing "you have won a lottery" gives `mod_status = 'pending'` and creates a queue row.
6. A second message in a pending conversation raises `request_pending`.
7. After the admin (postgres) sets `banned_until = now() + 1 day` for user X, user X's post insert fails with an RLS error (`new row violates row-level security policy`).
8. `can_create_community()->>'allowed'` is true for Priya (reputation raised via the seed plus `update profiles set reputation = 150` inside the test) and false for a fresh user.
9. `search_posts('carpenter', 12.9915, 77.6944)` returns `seed-mdp-03` first.
10. `search_posts('plumber', 12.9260, 77.6762)` returns the expired `seed-mdp-05`.

---

## 3. Notifications design

- **Storage:** the `notifications` table (§2.5). Rows are created only by definer functions and triggers.
- **In-app:** `RealtimeProvider` (mounted inside `(tabs)/_layout.tsx` when signed in) opens:
  - `supabase.channel('notif:'+uid).on('postgres_changes', {event:'INSERT', schema:'public', table:'notifications', filter:'user_id=eq.'+uid}, …)`. This invalidates `['notifications']` and `['inboxCounts']` and shows a toast with the title, which is tappable and follows `data.url`.
  - `supabase.channel('cm:'+uid).on('postgres_changes', {event:'*', schema:'public', table:'conversation_members', filter:'user_id=eq.'+uid}, …)`. This invalidates `['conversations']` and `['inboxCounts']`.
  - The chat screen opens its own `supabase.channel('msg:'+convId)` on `messages` with filter `conversation_id=eq.<id>` (INSERT) and appends to the `['messages', id]` cache.
- **Badges:** the Inbox tab `tabBarBadge` = `chats + requests + notifications` from `inbox_counts()`. The query refetches on focus and on realtime events, and shows nothing when the total is 0.
- **Push:**
  - `PushProvider` runs after onboarding.
  - Skip when `Platform.OS === 'web'`, or when `!Device.isDevice`, or on Android when `Constants.executionEnvironment === 'storeClient'` (Expo Go: Android push is unavailable in Expo Go since SDK 53), or when `EXPO_PUBLIC_EAS_PROJECT_ID` is empty.
  - Otherwise: request permission; on Android `setNotificationChannelAsync('default', {name:'Default', importance: MAX})`; `getExpoPushTokenAsync({projectId})`; call the `register_push_token` RPC.
  - On sign-out, delete the token row, then call `signOut`.
  - `setNotificationHandler`: `shouldShowBanner` is true unless `data.conversationId === currentOpenChatId` (a module-level variable set by the chat screen); `shouldShowList: true`, `shouldPlaySound: false`, `shouldSetBadge: false`.
  - `addNotificationResponseReceivedListener` does `router.push(data.url)`. Also handle `getLastNotificationResponseAsync()` on cold start.
- **Server side:** `notifications` INSERT → `send_push()` → `net.http_post` to the Expo push API. Chat messages call `send_push` directly. The Expo receipts API and pruning of invalid tokens are deferred.

---

## 4. Screens and navigation (Expo Router, `mobile/src/app`)

```
_layout.tsx                 Root: QueryProvider > AuthProvider > LocationProvider > ToastProvider > PushProvider;
                            <Stack screenOptions={{headerShown:false, contentStyle:{backgroundColor:colors.bg}}}>.
                            Registers modal screens with presentation:'modal': compose, location, report, and
                            community/new. If !env.isConfigured, render <SetupNeeded/> instead of the Stack.
index.tsx                   Redirect: no session -> /welcome; session && !profile.onboarded_at -> /onboarding; else /(tabs)
+not-found.tsx
welcome.tsx                 (auth) Wordmark, tagline, "Continue with Google", "Continue with email", guidelines link
sign-in.tsx                 email + password; "Forgot password?"; link to sign-up
sign-up.tsx                 email (live email_available), password (>=8), confirm; note "Next you'll pick a username"
forgot-password.tsx         resetPasswordForEmail(email, {redirectTo: createURL('auth/callback')})
reset-password.tsx          new password form (after PASSWORD_RECOVERY event)
auth/callback.tsx           completes OAuth/email links: maybeCompleteAuthSession(); on native completeAuthFromUrl(url);
                            on web wait for session; then router.replace('/')
onboarding.tsx              3 steps (Username+name / Phone / Area+interests); calls complete_onboarding
guidelines.tsx              static community guidelines
(tabs)/_layout.tsx          Guard (no session -> Redirect /welcome; not onboarded -> /onboarding). Tabs:
                            index(Home) · communities · search · inbox · profile. Mounts RealtimeProvider.
(tabs)/index.tsx            Home: List/Map
(tabs)/communities.tsx
(tabs)/search.tsx
(tabs)/inbox.tsx            Segmented: Chats · Requests (n) · Notifications (n)
(tabs)/profile.tsx          My profile
post/[id]/index.tsx         Post detail (anonymous read allowed)
post/[id]/thread/[commentId].tsx   "Continue this thread" view
compose.tsx                 modal; params: type?, lat?, lng?, communityId?, title?
location.tsx                modal: location/radius picker
report.tsx                  modal; params: targetType, targetId, conversationId?, userId?
user/[username].tsx         public profile (anonymous read allowed)
profile/edit.tsx
settings/index.tsx          account: username, phone, home area, notifications, blocked users, guidelines, sign out, delete account, Admin (if admin)
settings/notifications.tsx
settings/blocked.tsx
settings/username.tsx
settings/phone.tsx
chat/[id].tsx
community/new.tsx           modal (eligibility gate + form)
community/[slug]/index.tsx  community page (anonymous read allowed)
community/[slug]/edit.tsx   mods
community/[slug]/members.tsx
admin/_layout.tsx           guard: profile.role === 'admin' else <Redirect href="/(tabs)/profile"/>
admin/index.tsx             moderation queue
admin/item/[id].tsx
admin/user/[id].tsx
admin/filters.tsx
```

**Anonymous access:** `post/[id]`, `user/[username]` and `community/[slug]` render for signed-out users, which matters for WhatsApp share links opened on the web. Every mutating action calls `useRequireAuth()`, which `router.push('/welcome')`s when there is no session.

### Screen specs

| Screen | Purpose | Data | Key components / behavior |
|---|---|---|---|
| **Home** `(tabs)/index` | Nearby feed (prototype parity) | `useFeed`: `posts_near(lat,lng, max(radius,10), types, unanswered)`. Alerts: `posts_near(lat,lng,radius,['alert'],sort 'nearest')`. Search: `search_posts(q, lat, lng, p_max_km = searchRadius ?? radius, p_near_km = radius)` | `Header` (wordmark "pincode" + muted "your neighborhood"; `LocationPill` "Mahadevapura · 560048 · 5 km" → `/location`). `AskPrompt` "Ask your neighborhood anything…" → compose. `SearchInput` "Search nearby: cook, carpenter, pediatrician…" (debounce 250 ms). Chips All · Unanswered · Alerts · Events. `Segmented` List/Map. `AlertsStrip` (All filter only, hidden while searching). Summary line. `FeedList` with ring groups from `buildFeedGroups` (RINGS [1,3,5,10], MIN_FEED 8, divider "A bit further away (3–5 km)"). Sort Newest/Nearest. `EmptyState` (prototype copy: "No one has asked anything within X km yet." / "Be the first. Your neighbors will see it."; actions: Widen radius, Ask, Jump to Mahadevapura). FAB "+ Ask". Map mode: `PostsMap` with the same items plus alerts, radius circle and user dot. **Tap marker → `router.push('/post/'+id)`**. **Long-press → `router.push({pathname:'/compose', params:{lat,lng}})`**. The "+ Here" button toggles crosshair mode, whose "Post here" button uses the map center. Banned banner: "Your account is suspended until …". Location-denied banner uses the prototype copy. Pull to refresh. |
| **Post detail** `post/[id]` | Full post plus the thread | `post_cards` where `id = :id`; `comment_cards` where `post_id` (limit 500, `order created_at`) | Type label (dot + "ASK · OFFERING" / "ALERT" / "EVENT"), title 20/600, meta "Hoodi · 560048 · 2.1 km · 3h ago", community link "in Hoodi Neighbors". Badges: "Answered in 25 min" (solved only), "Still on · 3 confirmed · 20m ago", "Until 4:00 pm", event `DateBlock` + "Sat 27 Sep, 10:00 am". Body. `PhoneReveal` ("Show number" → `reveal_post_phone` → Call / WhatsApp `https://wa.me/91XXXXXXXXXX`). Author row → profile. Action row: `VoteButton`, `ReactionBar`, alerts "Still happening" / "Resolved" (non-authors, once), `ShareRow` (WhatsApp `whatsapp://send?text=` with `https://wa.me/?text=` fallback, native Share, Copy link). Overflow via ActionSheet/confirm: author → Edit (compose in edit mode), Delete, Mark resolved (alerts); others → Report, Block author; mod → Remove from community; admin → Remove (admin). `CommentThread` + sticky `CommentComposer` ("Write an answer…" on Asks by non-authors, "Add a comment…" otherwise). A `?comment=<id>` param scrolls to and highlights that comment. Pending own post shows the banner "Under review, only you can see this". |
| **Thread** `post/[id]/thread/[commentId]` | Deep sub-thread | Reuses the `['comments', postId]` cache | Renders the subtree rooted at `commentId` with depth re-based to 0, and a "Back to post" link. |
| **Compose** (modal) | Create or edit a post | `myCommunities` for the picker | Segmented Ask/Alert/Event. Ask: "Looking for / Offering", `TagPicker` (cook, maid, repair, electrician, plumber, pets, doctor, other, plus custom), optional phone with the note "Your pin will be shown about 200 m away". Alert: "Until" `DurationChips` (1h, 3h, 6h, Tonight, 24h). Event: `DateTimeChips` (next 14 days × 30-minute slots) + duration chips (1h, 2h, 3h, Half day, All day), start required. Title (3–120) with per-type hint copy from the prototype, body (≤2000). Location row "Hoodi · 560048 · Change" → `LocationPickerMap` inline (220 px). Community select (optional; prefilled from params). Submit labels "Post ask / Post alert / Post event". After insert `select('id, mod_status')`: pending → toast "Posted. It's being reviewed and will appear shortly." Then navigate to the post. |
| **Location** (modal) | Change feed center and radius | offline pincodes; Nominatim on web | Search "Pincode or area, e.g. 560048 or Hoodi" (submit only), "Use my current location", jump chips Mahadevapura · Whitefield · KR Puram · Marathahalli · Bellandur, radius segmented 1/3/5/10 km. |
| **Welcome / Sign-in / Sign-up** | Auth | none | Google button: `Button variant="ghost"` with a drawn "G" monogram (`Text`), no emoji. Errors mapped via `errors.ts`. |
| **Onboarding** | Mandatory profile | `suggest_usernames(hint)`, `username_available`, `phone_available` | **Step 1:** display name (prefilled from Google), username field with live `AvailabilityHint` (debounce 400 ms: "Checking…", "Available", "Taken", "3–20 letters, numbers or _, starting with a letter"), suggestion chips (6, hint = home area or first name) with a refresh icon; tap fills the field. **Step 2:** phone with a fixed "+91" prefix and 10-digit input, live availability, the note "Used for account safety. Never shown publicly." **Step 3:** home area ("Use my location" or pincode input via offline lookup) and `InterestPicker` (curated chips + "Add your own", max 15). Finish → `complete_onboarding` → invalidate `['me']` → `/(tabs)`. Back/next buttons; state kept in the component. |
| **Communities tab** | Discover nearby communities | `communities_near(lat,lng, distance, category, null, sort, null)`; my communities from `community_cards` where `my_role` is not null; `can_create_community()` | "Your communities" horizontal list; category chips (All + categories); distance segmented 2/5/10/25 km; sort Nearby/Members/Newest; `CommunityCard` list (name, "Parents · Hoodi · 1.2 km", "124 members", Join button); "Start a community" → `community/new`. |
| **Community page** | View and participate | `community_cards` by slug; `posts_near(..., p_community_id)`; members (`community_members` + `profiles` embed) | `CommunityHeader` (name, category · area, member count, Join/Leave, "Notify me about new posts" toggle for members), segmented Posts · About · Members. Posts: `FeedList` + "+ Post in community". About: description, rules (numbered), moderators, created date, mini map. Members: list with role tags; owner sees "Make moderator/Remove moderator"; mods see "Remove member" (confirm, with an optional ban). Overflow: Edit (mods), Report community. |
| **Community new** (modal) | Create | `can_create_community()`, `slug_available` | If not allowed, show a checklist: "Reputation 42 / 100", "Account age 12 / 30 days", reasons in plain copy. If allowed: name, slug (auto from name, editable, live availability), kind (Area/Interest), category chips, description, up to 10 rules, center (`LocationPickerMap`, default the current location), radius chips (1, 2, 3, 5, 10 km) → `create_community` → navigate to the page. |
| **Search tab** | Global search | `search_posts` / `communities_near(p_radius_km: null, p_q)` / `search_users` | `SearchInput` (autofocus), segmented Posts · Communities · Users. The active tab queries only when `q.length ≥ 2` (debounce 300 ms). Recent searches (AsyncStorage, max 8). Post results show "From 3 weeks ago" when expired, resolved or older than 7 days. |
| **Inbox tab** | Chats, requests, notifications | `list_conversations('chats'/'requests')`, `notifications` (+ actor embed) paged by 30, `inbox_counts()` | `ConversationRow` (avatar, name or "pincode Team", preview, time, unread pill). Requests show "wants to message you". `NotificationRow` (icon by kind, title, body, time, unread dot); tap → mark read + `router.push(data.url)`; "Mark all read". |
| **Chat** `chat/[id]` | DM thread | `conversations` + members; `messages` desc limit 50, load older with `lt('created_at', oldest)`; realtime | Inverted FlatList of `MessageBubble` (mine right in `accentSoft`, theirs left in `surface`). Held message: "Held for review". System conversation: header "pincode Team", read-only (no composer). A pending request received shows `RequestBar` Accept / Decline / Block (+ Report). A pending request sent: composer disabled after one message, with the text "Waiting for them to accept". Declined: "Message not delivered." Header menu: View profile, Mute/Unmute, Block, Report user (→ report with `conversationId`). Calls `mark_conversation_read` on focus and on each new message while focused. |
| **Profile (own)** | Rich profile | `me` + `get_profile(username)`; `post_cards` by `author_id`; `comment_cards` by `author_id`, `is_answer` | `ProfileHeader` (avatar, display name, @username, bio, home area · pincode, "Joined Sep 2026"), `StatsRow` (Reputation, Posts, Answers, Solved, Communities), `BadgeList`, interests chips, communities list, segmented Posts · Answers. Buttons Edit profile and Settings. |
| **Public profile** `user/[username]` | Same, read-only | `get_profile` | Message (→ `start_conversation` → chat), overflow Block/Unblock and Report user. "Account suspended" tag if suspended. |
| **Edit profile** | Edit | `me` | Avatar (`expo-image-picker`, `allowsEditing`, aspect 1:1, quality 0.7 → upload), display name, bio (300), interests, home area (→ `set_home_location`). Links to change username (30-day rule) and phone. |
| **Settings** | Account | `private_profiles` | Notification toggles (replies, answers, votes, alerts, messages, communities) with the note "Safety messages from pincode Team are always on". Blocked list with unblock. Guidelines. Sign out. Delete account (double confirm → `delete_my_account` → signOut). Admin (visible only if `role === 'admin'`). |
| **Report** (modal) | Report anything | none | Radio list: Impersonation or imposter / Illegal content or activity / Scam or suspicious / Harassment or hate / Spam / Something else. Details (optional, 1000). For user/message targets, "Also block this user" (default on). Submit → `submit_report` → toast "Thanks. Our team will review it." The item is hidden locally (feeds exclude posts you reported). |
| **Admin queue** | Moderation | `moderation_queue` (status filter, order `created_at` desc) + `profiles` embed on `target_user_id` | Segmented Open/Resolved; rows show a type tag, reason chips, excerpt, report count, source, age and @author. |
| **Admin item** | Decide | queue row, `reports` for the target (`reporter` embed), the target content (post via `post_cards` / comment / message allowed by admin RLS), the author's strikes | Buttons Restore, Remove, Remove + strike (category picker, reason text, "Severe: permanent ban" switch), Dismiss; "Open author" → admin user. Shows the next strike outcome: "This will be strike 2 → final warning". |
| **Admin user** | User standing | `profiles`, `strikes`, `moderation_actions` | Status (active / suspended until / banned), strike history, Issue strike, Lift ban. |
| **Admin filters** | Filter terms | `filter_terms` | List with an active toggle; add form (pattern, category, action, scopes); "Test text" box → `admin_test_filter`. |

---

## 5. Auth flow detail

1. **Client** (`src/lib/supabase.ts`):
   ```ts
   import 'react-native-url-polyfill/auto';
   import AsyncStorage from '@react-native-async-storage/async-storage';
   import { createClient } from '@supabase/supabase-js';
   import { AppState, Platform } from 'react-native';
   import { env } from './env';
   export const supabase = createClient(env.supabaseUrl || 'https://placeholder.supabase.co', env.supabaseAnonKey || 'placeholder', {
     auth: { storage: Platform.OS === 'web' ? undefined : AsyncStorage, autoRefreshToken: true, persistSession: true,
             detectSessionInUrl: Platform.OS === 'web', flowType: 'pkce' },
   });
   if (Platform.OS !== 'web') AppState.addEventListener('change', s =>
     s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh());
   ```
2. **Google** (`src/lib/auth.ts`):
   ```ts
   WebBrowser.maybeCompleteAuthSession();
   export async function signInWithGoogle() {
     if (Platform.OS === 'web') {
       const { error } = await supabase.auth.signInWithOAuth({ provider: 'google',
         options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } } });
       if (error) throw error; return;
     }
     const redirectTo = Linking.createURL('auth/callback');   // exp://…/--/auth/callback in Expo Go, pincode://auth/callback in builds
     const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google',
       options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
     if (error) throw error;
     const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
     if (res.type === 'success') await completeAuthFromUrl(res.url);
   }
   export async function completeAuthFromUrl(url: string) {
     const { queryParams } = Linking.parse(url);
     if (queryParams?.error_description) throw new Error(String(queryParams.error_description));
     const code = queryParams?.code;
     if (typeof code === 'string') {
       const { data } = await supabase.auth.getSession();
       if (!data.session) { const { error } = await supabase.auth.exchangeCodeForSession(code); if (error) throw error; }
     }
   }
   ```
   `auth/callback.tsx` also calls `completeAuthFromUrl(Linking.getLinkingURL() ?? '')` on native, to cover Android returning through a deep link. On web, `detectSessionInUrl` handles it.
3. **Email:** `signUp({email, password, options:{emailRedirectTo: Linking.createURL('auth/callback')}})`. If `data.session` is null, show "Check your inbox to confirm, then sign in." `signInWithPassword`. Forgot password → recovery email → callback → the `onAuthStateChange('PASSWORD_RECOVERY')` handler → `/reset-password` → `updateUser({password})`.
4. **AuthProvider** exposes `{session, user, me (profile + private), loading, refreshMe, signOut}`:
   - `me` is a react-query `['me']` doing `profiles.select('*').eq('id', uid).single()` and `private_profiles.select('*').eq('id', uid).single()` in parallel.
   - It subscribes to `onAuthStateChange`, sets the session and invalidates `['me']`.
   - `signOut` unregisters the push token, calls `supabase.auth.signOut()` and `queryClient.clear()`.
5. **Gate:** `index.tsx` and `(tabs)/_layout.tsx` redirect as in §4 while `loading` shows a centered ActivityIndicator. `onboarding.tsx` redirects to `/(tabs)` if already onboarded.
6. **Uniqueness UX:** email via `email_available` on sign-up (debounced). Username and phone as above. The final guarantee is the DB unique constraints (email citext on `private_profiles` plus `auth.users`, username citext, phone E.164). Supabase links a Google identity to an existing account with the same verified email, so no duplicates appear.

---

## 6. Moderation flow

1. **Automated:** the `t20` filter on insert or edit either blocks (the client shows "This contains language that isn't allowed on pincode.") or flags. A flagged item gets `mod_status = 'pending'`: hidden from everyone except the author, admins and community moderators. It gets a queue item, the author gets a `content_held` notification, and admins get `mod_queue` (throttled).
2. **User reports:** the report modal calls `submit_report`. It creates or merges a queue item. Three distinct open reporters (or two for "illegal") auto-hide posts, comments and messages as pending. The reporter no longer sees the post in feeds.
3. **Admin review** (`/admin`): Restore, Dismiss, Remove, or Remove + strike, via `admin_resolve_item`. Strikes follow the ladder: warning, then final warning, then a 7-day suspension, then a permanent ban (severe means an immediate permanent ban; only strikes from the last 365 days count). Each step posts a message in the user's **pincode Team** system chat and sends a `warning` or `suspension` notification.
4. **Enforcement:** `can_participate()` sits in every content INSERT policy and in the key RPCs. Suspension ends automatically when `banned_until` passes. The client shows a suspension banner and disables composers, but the server is the source of truth.
5. **Community moderators** remove posts from their community (`community_removed`, a separate flag, reversible) and remove or ban members from it. They have no global powers.
6. **Admin bootstrap:** SQL only (SETUP §7): `update profiles set role = 'admin' where username = '<you>';`.

---

## 7. Design system (React Native)

### 7.1 `src/theme/tokens.ts` (mirrors the prototype's `styles.css`)

```ts
export const colors = {
  bg: '#fafaf9', surface: '#ffffff', surface2: '#f5f5f4', line: '#e7e5e4', lineStrong: '#d6d3d1',
  ink: '#1c1917', ink2: '#57534e', ink3: '#8a847d',
  accent: '#0f766e', accentInk: '#ffffff', accentSoft: '#ecf6f4',
  ask: '#0f766e', alert: '#b45309', event: '#6d5bd0',
  danger: '#b42318', dangerSoft: '#fdecea', backdrop: 'rgba(28,25,23,0.32)',
} as const;
export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 24, s6: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const text = {
  label:     { fontSize: 11, fontWeight: '600', letterSpacing: 0.66, textTransform: 'uppercase', color: colors.ink2 },
  meta:      { fontSize: 12, lineHeight: 16, color: colors.ink3 },
  secondary: { fontSize: 13, lineHeight: 18, color: colors.ink2 },
  bodySm:    { fontSize: 14, lineHeight: 20, color: colors.ink2 },
  body:      { fontSize: 15, lineHeight: 22, color: colors.ink },
  cardTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.ink },
  wordmark:  { fontSize: 18, fontWeight: '600', letterSpacing: -0.2, color: colors.ink },
  title:     { fontSize: 20, lineHeight: 26, fontWeight: '600', color: colors.ink },
} as const;
export const typeColor = { ask: colors.ask, alert: colors.alert, event: colors.event } as const;
export const numeric = { fontVariant: ['tabular-nums'] as const };
```

**Rules**

- Font weights are 400, 500 and 600 only, with system fonts.
- The type colors appear only as 6 px dots, the 2 px left rule on alert cards (`borderLeftWidth: 2, borderLeftColor: colors.alert`), and map markers.
- The active filter chip uses an `ink` background with white text. The toggle-pressed state is `accentSoft` + `accent`.
- No hex colors outside `tokens.ts`. No emoji in chrome.
- Minimum touch target is 44 px (use `hitSlop`).

### 7.2 Shared components (in `components/ui`, with props)

- `Text` `{variant: keyof text, numeric?, numberOfLines?}`.
- `Button` `{variant: 'primary'|'ghost'|'text'|'danger', size?: 'md'|'sm', loading?, disabled?, icon?, onPress}`. Heights 36 and 32.
- `IconButton` `{name, onPress, label}`, 32 px round.
- `Icon` `{name, size=16, color}`. SVG strokes (width 1.8, round caps). Names: `pin, search, map, list, plus, x, chevron-down, chevron-right, chevron-left, check, share, link, more, arrow-up, message, bell, user, users, home, inbox, flag, shield, send, camera, settings, phone, clock, calendar, alert, star, lock, log-out, edit, trash, refresh, crosshair`.
- `Chip` `{label, selected?, pressed?, onPress}`, 32 px pill. `ChipRow` `{scroll?}`.
- `Segmented` `{options: {value,label,badge?}[], value, onChange, full?}`.
- `TextField` `{label, value, onChangeText, error?, hint?, right?, prefix?, multiline?, maxLength?, secureTextEntry?, keyboardType?}`.
- `AvailabilityHint` `{state: 'idle'|'checking'|'ok'|'taken'|'invalid', message}`.
- `SearchInput` `{value, onChangeText, placeholder, onClear, autoFocus?}`.
- `Avatar` `{uri?, name, size = 36}`. Falls back to the initial on `surface2`.
- `Card` `{onPress?, variant?: 'default'|'alert'|'past'}`. Past means opacity 0.8.
- `RingDivider` `{label}`, `EmptyState` `{title, text, actions}`, `Banner` `{text, tone: 'neutral'|'warn', onDismiss?}`, `Screen` (SafeArea + bg + optional scroll), `Header` `{title?, left?, right?, wordmark?}`, `ListRow`, `SectionTitle`, `Badge` `{label, tone}`, `Skeleton`, `Sheet` (modal content wrapper with handle + title + close).
- Toast: `useToast().show(message, {actionLabel?, onAction?})`, dark `ink` pill, bottom, 2.5 s.
- `confirmAsync(title, message, {confirmLabel, destructive})`. Uses `window.confirm` on web, because `Alert.alert` with buttons does nothing on react-native-web, and `Alert.alert` on native.
- `actionSheet(options)`. `ActionSheetIOS` on iOS, a simple modal list elsewhere (a `Sheet` with `ListRow`s).

### 7.3 Domain components

- `PostCard` (prototype card anatomy: top row dot + label + `· tag` + right "2.1 km · 3h"; title clamped to 2 lines; body clamped to 2 lines; foot "area · pincode", `PostStatusLine`, `VoteButton`). `DateBlock` for events.
- `AlertMini` (220 px), `AlertsStrip`, `FeedList` (SectionList of groups).
- `PostStatusLine` rules (prototype D5): solved → "Answered in 25 min" (accent + check icon); has answers → "3 answers"; unanswered active request → "No answers yet · help out" (accent); alert → "Still on · 3 confirmed · 2h ago" or "Until 4:00 pm"; event → "Sat 27 Sep, 10:00 am".
- `ReactionBar` `{counts, mine, onToggle(code)}`. Shows chips for non-zero reactions plus a "+" that opens the row of six.
- `CommentItem` `{comment, depth, isPostAuthor, isSolved, canSolve, onReply, onVote, onReact, onSolve, onMore}`. Indent 16 px per depth level with a 1 px `line` rail. Vote label: "Helpful · n" for answers (`is_answer`), "Upvote · n" otherwise.
- `CommentThread` builds the tree with `lib/tree.ts`:
  - top level: solved first, then `upvote_count` desc, then `created_at` asc;
  - replies: `created_at` asc;
  - render depth ≤ 2 inline. Children at depth 3+ are replaced by "Continue this thread (n) →" linking to `/post/[id]/thread/[commentId of the depth-2 node]`.
- `CommentComposer` `{replyingTo?: {id, username}, onCancelReply}`. Shows the chip "Replying to @x ×".
- `ShareRow`: `lib/share.ts` has `postLink(id) = (env.webUrl ? env.webUrl + '/post/' + id : Linking.createURL('/post/' + id))` and `shareWhatsApp(title, link)`.

### 7.4 `lib` utilities

- `format.ts`: port `timeAgo`, `relAge`, `fmtDuration` ("N min" under 60, "N h" under 48 h, else "N d"), `fmtKm` (1 decimal), `fmtTime` and `fmtWhen` with `Intl.DateTimeFormat('en-IN', …)`, `joinedLabel`.
- `geo.ts`: `haversineKm`.
- `pincodes.ts`: port `pincodes.js` verbatim as a typed `PINCODES` record, plus `findNearestPincode` and `findPincodeByArea`.
- `location.ts`:
  - `getCurrentPosition()` via `expo-location`: `requestForegroundPermissionsAsync`, then `getCurrentPositionAsync({accuracy: Balanced})` raced against a 10 s timeout.
  - `reverseGeocode()`: offline lookup within 3 km → native `Location.reverseGeocodeAsync` (postalCode, district/subregion/city) → web Nominatim (throttled to 1 request per 1.1 s, cached in memory, `email=` param).
  - `forwardGeocode()`: port of the prototype order (offline pincode → area alias → Nominatim).
- `constants.ts`:
  - `DEFAULT_LOC = {lat: 12.9915, lng: 77.6944, area: 'Mahadevapura', city: 'Bengaluru', pincode: '560048'}`
  - `RINGS = [1,3,5,10]`, `MIN_FEED = 8`, `RADII = [1,3,5,10]`
  - `TAGS` (prototype list)
  - `REACTIONS = [{code:'like',glyph:'👍'},{code:'love',glyph:'❤️'},{code:'haha',glyph:'😂'},{code:'wow',glyph:'😮'},{code:'thanks',glyph:'🙏'},{code:'celebrate',glyph:'🎉'}]`
  - `REPORT_CATEGORIES` (with labels and descriptions)
  - `COMMUNITY_CATEGORIES` (same as the DB check list, with labels)
  - `INTERESTS` (cooking, pets, parenting, fitness, running, cycling, yoga, cricket, football, badminton, books, gardening, music, movies, photography, tech, startups, volunteering, environment, food, travel, art, gaming, spirituality, home repair, languages, seniors, events)
  - `REP = {communityMinRep: 100, communityMinAgeDays: 30}`
- `copy.ts`: all user-facing strings, in US spelling (prototype `COPY` carried over).
- `errors.ts`: `messageFor(error)`. Maps the §2.0 keys, Postgres `23505` → "That's already taken.", `42501` / "row-level security" → "You can't do that right now" (or the suspension copy when `me` is banned), and network errors.
- `phone.ts`: `normalizeIndianPhone()`, identical to the SQL version. `username.ts`: `USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,19}$/`.
- `feedGroups.ts`: `buildFeedGroups(items, radius)`, per the prototype algorithm:
  ```ts
  export function buildFeedGroups(items: FeedItem[], radiusKm: number) {
    const within = items.filter(x => x.distKm <= radiusKm);
    const groups = [{ divider: null as string | null, items: within }];
    let total = within.length, from = radiusKm;
    for (const to of RINGS) {
      if (total >= MIN_FEED) break; if (to <= from) continue;
      const band = items.filter(x => x.distKm > from && x.distKm <= to);
      if (band.length) { groups.push({ divider: `A bit further away (${from}–${to} km)`, items: band }); total += band.length; }
      from = to;
    }
    return groups;
  }
  ```

### 7.5 Maps

- `PostsMap.types.ts`:
  ```ts
  export type PostsMapProps = {
    center: {lat: number; lng: number};
    radiusKm: number;
    items: {id: string; lat: number; lng: number; type: 'ask'|'alert'|'event'; title: string}[];
    user?: {lat: number; lng: number} | null;
    onPressPost(id: string): void;
    onLongPress(c: {lat: number; lng: number}): void;
    pinMode: boolean;
    onConfirmPin(c: {lat: number; lng: number}): void;
  };
  ```
- `PostsMap.native.tsx` (react-native-maps): `initialRegion` with `latitudeDelta = radiusKm / 111 * 2.6`. Each post is a `Marker` with a custom 14 px dot `View` (type color, 2 px white border, `tracksViewChanges={false}`); `onPress` calls `onPressPost`. `Circle` for the radius (stroke `accent`, fill `rgba(15,118,110,0.06)`). The map's `onLongPress` gives the coordinate. `onRegionChangeComplete` tracks the center for pin mode. `Crosshair` overlay plus a "Post here" button when `pinMode`.
- `PostsMap.tsx` (web, react-leaflet): `import 'leaflet/dist/leaflet.css'`. `MapContainer` (`style={{height:'100%', width:'100%'}}`), `TileLayer` OSM with attribution, a `CircleMarker` per post (`eventHandlers.click`), a `Circle` for the radius, and `useMapEvents({contextmenu})` for long-press or right-click. Same crosshair overlay. Wrap it in a View with `position: 'relative', overflow: 'hidden', borderRadius: radius.md`.
- `LocationPickerMap.native.tsx` / `.tsx`: a draggable marker, and a tap moves it. `onChange(lat,lng)` and then the caller reverse-geocodes.
- `src/types/css.d.ts`: `declare module '*.css';`.

---

## 8. Dependencies (SDK 57, lean)

`mobile/package.json`:

```json
{
  "name": "pincode-mobile",
  "private": true,
  "version": "0.1.0",
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "typecheck": "tsc --noEmit",
    "export:web": "expo export --platform web"
  },
  "dependencies": {
    "expo": "~57.0.25",
    "expo-router": "~57.0.23",
    "expo-linking": "~57.0.11",
    "expo-constants": "~57.0.19",
    "expo-status-bar": "~57.0.1",
    "expo-splash-screen": "~57.0.9",
    "expo-web-browser": "~57.0.3",
    "expo-location": "~57.0.20",
    "expo-notifications": "~57.0.21",
    "expo-device": "~57.0.2",
    "expo-image-picker": "~57.0.20",
    "expo-clipboard": "~57.0.2",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "react-native": "0.86.3",
    "react-native-web": "~0.21.0",
    "react-native-screens": "~4.26.0",
    "react-native-safe-area-context": "~5.7.0",
    "react-native-svg": "15.15.4",
    "react-native-maps": "1.27.2",
    "@react-native-async-storage/async-storage": "2.2.0",
    "react-native-url-polyfill": "^2.0.0",
    "@supabase/supabase-js": "^2.117.2",
    "@tanstack/react-query": "^5.104.0",
    "leaflet": "^1.9.4",
    "react-leaflet": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "~6.0.3",
    "@types/react": "~19.2.2",
    "@types/leaflet": "^1.9.12"
  }
}
```

Deliberately **not** included:

- `@expo/vector-icons` (deprecated)
- `react-native-reanimated`, `react-native-gesture-handler`, bottom-sheet libraries (modals use router `presentation: 'modal'`)
- date-picker libraries (we use custom chips)
- `dayjs` / `date-fns`, `libphonenumber`, `expo-auth-session`, `expo-crypto`, `expo-secure-store`, `expo-image`

If Metro reports a missing peer of `expo-router` (for example `react-native-gesture-handler`), install that one with `npx expo install <name>`.

`tsconfig.json`:

```json
{ "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true, "baseUrl": ".", "paths": { "@/*": ["./src/*"] }, "types": [] },
  "include": ["**/*.ts", "**/*.tsx", "expo-env.d.ts"] }
```

`expo-env.d.ts`: `/// <reference types="expo/types" />`.

`app.config.ts`:

```ts
import type { ExpoConfig } from 'expo/config';
const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY;
const config: ExpoConfig = {
  name: 'pincode', slug: 'pincode', scheme: 'pincode', version: '0.1.0',
  orientation: 'portrait', userInterfaceStyle: 'light',
  ios: { bundleIdentifier: 'com.pincode.app', supportsTablet: false },
  android: { package: 'com.pincode.app' },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    'expo-router',
    ['expo-location', { locationWhenInUsePermission: 'pincode uses your location to show posts from your neighborhood.' }],
    ['expo-image-picker', { photosPermission: 'pincode needs your photos to set a profile picture.' }],
    ['expo-notifications', { color: '#0f766e' }],
    ...(mapsKey ? [['react-native-maps', { androidGoogleMapsApiKey: mapsKey }] as [string, any]] : []),
  ],
  extra: { eas: { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined } },
  experiments: { typedRoutes: false },
};
export default config;
```

`.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-OR-PUBLISHABLE-KEY
# Optional: public web URL used in share links (e.g. after deploying the web build)
EXPO_PUBLIC_WEB_URL=
# Optional: EAS project id (needed for push notifications on real devices)
EXPO_PUBLIC_EAS_PROJECT_ID=
# Reserved for future native Google Sign-In (v1 uses the browser flow via Supabase)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
# Build-time only (development/production builds on Android)
GOOGLE_MAPS_ANDROID_API_KEY=
```

`src/lib/env.ts` reads each `process.env.EXPO_PUBLIC_*` **by literal name** (Expo inlines only literal accesses) and exports `env` and `isConfigured = url && key && !url.includes('YOUR-PROJECT')`.

`eas.json`: a minimal `development` profile (`developmentClient: true`, `distribution: internal`) and a `preview` profile, for the optional push testing in SETUP.

---

## 9. Build sequence (phases, with acceptance checks)

Node may be missing while the code is written. Each phase lists **static checks**, which the agent runs with Grep/Glob/Read, and **runtime checks**, which run once Node and Supabase exist (recorded in SETUP.md, §"Verify").

### P0: scaffold (no backend calls)

**Files:** `mobile/package.json`, `app.config.ts`, `tsconfig.json`, `expo-env.d.ts`, `.env.example`, `.gitignore` (node_modules, .expo, dist, .env, ios, android), `eas.json`, `README.md`, `src/theme/tokens.ts`, `src/lib/{env,supabase,format,geo,pincodes,constants,copy,errors,confirm,phone,username,feedGroups,tree}.ts`, `src/types/{models,css.d}.ts`, `components/ui/*`, `providers/{QueryProvider,ToastProvider}.tsx`, `src/app/_layout.tsx` with the `SetupNeeded` screen, `src/app/+not-found.tsx`. Also `supabase/README.md`.

**Static:** no `@react-navigation` imports; no `@expo/vector-icons`; every route file has `export default`; no hex colors outside `theme/tokens.ts` (grep `#[0-9a-fA-F]{6}` in `src` excluding tokens); no `process.env[`.

### P1: database (all SQL)

**Files:** every migration in §2 (full SQL), `seed.sql`, `tests/smoke.sql`.

**Static:**
- Every function has `set search_path`.
- Every `create table` is followed by `enable row level security`.
- Every table has a grant section in 1100.
- Internal functions are revoked.
- Trigger names follow the `tNN_` scheme.
- No `select *` of `posts` in the views (`phone_e164` excluded).
- Every error key used in SQL exists in `errors.ts`.

**Runtime:**
- All files run in order without errors in the SQL editor.
- `seed.sql` returns 26.
- `smoke.sql` completes with all asserts passing and rolls back.

### P2: auth + onboarding + profile basics

**Files:** `lib/auth.ts`, `providers/AuthProvider.tsx`, `LocationProvider.tsx`, `lib/location.ts`, `app/index.tsx`, `welcome`, `sign-in`, `sign-up`, `forgot-password`, `reset-password`, `auth/callback`, `onboarding`, `guidelines`, `(tabs)/_layout` (guard + 5 tabs, placeholders for the later tabs), `(tabs)/profile`, `profile/edit`, `settings/*` (without the admin link), `user/[username]`, `api/profiles.ts`, `hooks/useProfile.ts`.

**Runtime:**
- Google sign-in works on web (`localhost:8081`) and in Expo Go.
- Email sign-up works.
- Onboarding blocks the tabs until it is complete.
- A taken username, email or phone shows "Taken" live.
- Suggestions are all available and fill the field on tap.
- The avatar uploads and displays.
- Reloading the app keeps the session.

### P3: feed, map, composer, post detail (prototype parity)

**Files:** `(tabs)/index`, `location` modal, `compose`, `post/[id]/index`, `components/post/*`, `components/map/*`, `components/forms/*`, `api/posts.ts`, `hooks/useFeed.ts`, `usePost.ts`, `lib/share.ts`.

**Runtime:**
- With location denied, the app opens in Mahadevapura with ≥ 8 posts and the alerts strip.
- Rings appear at radius 1.
- Filters work; "Unanswered" excludes offers.
- The List/Map toggle works. **A marker tap opens the detail; a long-press opens the composer pinned at that spot.**
- An Ask can be posted, upvoted by another account, and removing the vote reverts the count.
- Alert "Still happening" extends the expiry. Two "Resolved" confirmations resolve it.
- WhatsApp share and copy link work.
- `pincode://post/<seed id>` (native) and `/post/<id>` (web) open the post.
- An anonymous web visitor can read a shared post.

### P4: threads, reactions, reputation, badges

**Files:** `components/comments/*`, `post/[id]/thread/[commentId]`, `api/comments.ts`, `hooks/useComments.ts`, `BadgeList`, `StatsRow`.

**Runtime:**
- Replies nest; depth 3+ shows "Continue this thread".
- Reply notifications reach the parent author (and the post author, once).
- One reaction per emoji per user, toggleable.
- Helpful votes count; self-vote is refused with the "You can't vote on your own post" copy.
- "This solved it" pins the answer, shows "Answered in N min", and adds +15 to the answerer's reputation. Unsolving reverts it.
- The badge `first_answer` appears on the profile.

### P5: DMs, notifications, push

**Files:** `(tabs)/inbox`, `chat/[id]`, `components/chat/*`, `components/notifications/*`, `providers/RealtimeProvider.tsx`, `PushProvider.tsx`, `lib/push.ts`, `api/chat.ts`, `api/notifications.ts`, `hooks/useInbox.ts`.

**Runtime:**
- "Message" on a profile creates a request.
- The recipient sees Requests (1) with Accept / Decline / Block. The sender cannot send a second message before acceptance.
- After accepting, messages arrive in realtime on both devices.
- Unread counts and the tab badge update.
- Notifications list items deep-link correctly.
- Push arrives on an iOS Expo Go or Android dev build when the app is backgrounded (optional; needs EAS).

### P6: communities

**Files:** `(tabs)/communities`, `community/new`, `community/[slug]/{index,edit,members}`, `components/community/*`, `api/communities.ts`, `hooks/useCommunities.ts`.

**Runtime:**
- Nearby-first listing with category, distance and sort filters.
- Join and leave update the counts.
- Posting in a community shows the post in both the community and the nearby feed.
- A new account sees the eligibility checklist and is refused server-side.
- A seeded eligible user (SETUP test tip) can create a community.
- The owner makes and removes a moderator; a moderator removes a post and a member (who cannot rejoin while banned).

### P7: search

**Files:** `(tabs)/search`, `api/search.ts`, `hooks/useSearch.ts`.

**Runtime:**
- "carpenter" finds `seed-mdp-03` near Mahadevapura first.
- "plumber" finds the expired Bellandur ask labelled "From 5 weeks ago".
- Users are found by a username prefix and by name.
- Communities are found by name or category.
- Blocked users are excluded.

### P8: moderation and admin

**Files:** `report` modal, `admin/*`, `api/moderation.ts`, `api/admin.ts`, `hooks/useAdmin.ts`, the settings admin link, banned banners and disabled composers.

**Runtime:**
- A comment with "registration fee" is held: the author sees "Under review", others don't see it, and the admin queue shows it.
- A slur is blocked with the error copy.
- Three reports hide a post.
- The admin removes it with a strike: the user gets a system chat warning. Repeating escalates to final warning, then a 7-day suspension (posting fails with RLS and the UI shows the banner), then a permanent ban.
- Lift ban works.
- The admin area is invisible and redirects for non-admins.

### P9: polish and SETUP.md

- Empty and error states on every list.
- Pull-to-refresh.
- Loading skeletons.
- Accessibility labels on icon buttons.
- Keyboard avoidance on composers (`KeyboardAvoidingView` with behavior `padding` on iOS).
- Web max-width 720 container (the `Screen` component centers content on web).
- Final pass on copy.

Write **SETUP.md** (content below) and `supabase/README.md`.

**Final static checks (no Node):**
- Every import path resolves to an existing file. Grep `from '@/` and verify each target.
- Every `supabase.rpc('<name>'` has a matching `create or replace function public.<name>` with the same argument names (`p_*`).
- Every `.from('<table>')` is a granted table or view.
- There is no `select('*')` on the `posts` table (use `post_cards`).
- Every route referenced in `router.push`, `href` and notification URLs exists.
- There is no `Alert.alert` with buttons outside `confirm.ts` and `actionSheet`.
- `web.output` is `"single"`.

**Checks once Node is installed** (run from `mobile/`):
- `npm install`
- `npx expo install --check`, then `npx expo install --fix` if anything is flagged
- `npx tsc --noEmit` (zero errors)
- `npx expo export --platform web` (builds `dist/`)
- `npx expo start --web`, then click through P2–P8
- `npx expo start` with Expo Go on a phone on the same Wi-Fi (or `npx expo start --tunnel`)

### SETUP.md content (the agent writes this file; keep the steps numbered)

1. **Install Node.js LTS.**
   - Download the Windows installer (.msi) for the current LTS from https://nodejs.org. React Native 0.86 needs **Node 20.19.4 or newer**, so choose 22.x or 24.x.
   - Run the installer with the default options and reopen PowerShell.
   - Check: `node -v` and `npm -v`.
2. **Create the Supabase project.**
   - Go to https://supabase.com → New project. Name it `pincode`, set a strong database password (save it), and choose the region **South Asia (Mumbai)**. Free plan.
   - In Project Settings → API (or "API Keys"), copy the **Project URL** and the **anon / publishable** key.
3. **Enable extensions** (optional, because the first migration also does it): Database → Extensions → enable `postgis`, `pg_trgm`, `citext`, `pg_net`.
4. **Run the migrations.**
   - Option A (no CLI): SQL Editor → New query → paste each file from `supabase/migrations/` **in filename order** → Run. Then paste and run `supabase/seed.sql`, then `supabase/tests/smoke.sql` (it should finish without errors and roll back).
   - Option B (CLI): from the repo root, `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`, then run `seed.sql` in the SQL editor.
5. **Configure Auth.**
   - Authentication → Sign In / Providers → **Email**: enabled. For development, turn **"Confirm email" off** (the built-in mailer is heavily rate-limited). Before launch, set up custom SMTP and turn it back on. Minimum password length 8.
   - Authentication → URL Configuration:
     - **Site URL** `http://localhost:8081`
     - **Redirect URLs**: `http://localhost:8081/**`, `pincode://**`, `exp://**`
6. **Google OAuth.**
   - At https://console.cloud.google.com create the project "pincode".
   - APIs & Services → **OAuth consent screen**: External; app name "pincode"; your support email; scopes `openid`, `email`, `profile`; add yourself as a **test user**.
   - Credentials → Create credentials → **OAuth client ID** → **Web application**:
     - Authorized JavaScript origins: `http://localhost:8081`
     - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
     - Copy the **Client ID** and **Client secret**.
   - Supabase → Authentication → Providers → **Google** → enable, paste the ID and secret, save.
   - Optional (future native sign-in; not used by v1): create an **Android** client (package `com.pincode.app` + SHA-1 from `npx eas-cli credentials`) and an **iOS** client (bundle id `com.pincode.app`), and paste their IDs into `.env`.
7. **Make yourself admin.** Sign up in the app and finish onboarding, then run in the SQL editor: `update public.profiles set role = 'admin' where username = 'YOUR_USERNAME';`
   - Test tip for community creation: `update public.profiles set reputation = 150, created_at = now() - interval '40 days' where username = 'YOUR_USERNAME';`
8. **Configure the app.** `cd mobile`, `copy .env.example .env`, and fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
9. **Install and run.**
   - `npm install`, then `npx expo install --fix`.
   - `npx expo start`, then press **w** for the web, or scan the QR code with **Expo Go** (Play Store / App Store; the phone must be on the same Wi-Fi, or use `npx expo start --tunnel`).
10. **Verify.** Run `npx tsc --noEmit` and `npx expo export --platform web`, then follow the acceptance checks in MOBILE-PLAN §9.
11. **Optional: push notifications on a real device.**
    - Run `npx eas-cli login` and `npx eas-cli init`, then copy the project id into `EXPO_PUBLIC_EAS_PROJECT_ID`.
    - For Android, create a Firebase project, add the Android app `com.pincode.app`, and upload the FCM V1 service-account key in expo.dev → Credentials.
    - Build in the cloud (this avoids installing Android Studio on the limited disk) with `npx eas-cli build --profile development --platform android`, install the APK, then run `npx expo start --dev-client`.
    - iOS push works in Expo Go.
12. **Optional: Android maps in dev or production builds.** Create a Google Maps SDK for Android API key, restricted to the package and SHA-1, set `GOOGLE_MAPS_ANDROID_API_KEY`, and rebuild. Expo Go needs no key.

**Disk note:** `node_modules` is about 600–800 MB. No Android Studio or Xcode is needed.

---

## 10. Risks, open questions (with chosen defaults), deferred

### Risks and mitigations

| Risk | Mitigation |
|---|---|
| PostGIS, citext and trgm live in the `extensions` schema, so definer functions fail with "function st_… does not exist" | Every function and file sets `search_path = public, extensions` (§2.0). |
| RLS recursion on `conversation_members` | Membership checks go through the definer `is_conversation_member()`. |
| Supabase default grants expose tables and columns (for example `posts.phone_e164`) | Global `revoke all` + column-level grants. Feeds read `post_cards`. The phone is only available via `reveal_post_phone`. |
| Android push is unavailable in Expo Go (SDK 53+) | In-app realtime works in Expo Go. Push needs an EAS dev build (SETUP step 11). The code skips push registration gracefully. |
| The Google consent screen shows `<ref>.supabase.co` | Acceptable for v1. A custom auth domain is deferred. |
| `Alert.alert` buttons do nothing on the web | `confirmAsync` and the `actionSheet` abstraction. |
| Leaflet crashes static web rendering | `web.output: "single"`. Leaflet is imported only in `.tsx` (web) files. |
| SDK 57 version drift | Versions are pinned from the SDK 57 `bundledNativeModules.json`; run `npx expo install --fix` after the first install. |
| `pg_net` failures are silent (push is best-effort) | Acceptable. Responses are in `net._http_response` for debugging. |
| Nominatim usage policy (web only) | Submit-only geocoding, 1 request/s throttle, cache, `email` param. Native uses the platform geocoder. |
| Seed auth users with NULL token columns break the Auth dashboard | The seed sets them to `''`. |
| Alert fan-out cost (300 recipients per alert) | The cap is in SQL. H3/queue-based fan-out is deferred. |
| Content-filter false positives (phone numbers in genuine recommendations) | Phone numbers flag only on velocity (4th in 24 h) or in message requests. Links flag only for accounts newer than 7 days or below 20 reputation. |
| Username enumeration via availability RPCs | Accepted (standard signup UX). Supabase's API rate limits apply. |

### Open questions and chosen defaults

- Phone OTP verification: **no** in v1 (`phone_verified = false`). Deferred because of SMS cost.
- Phone countries: **India (+91) only.**
- Anonymous browsing: **only for shared post, profile and community pages.** The tabs require sign-in.
- Dark mode: **no** (light only, like the prototype).
- Language: **English (US spelling)**. All strings are in `copy.ts` for later i18n.
- Comment depth: **stored ≤ 8, shown ≤ 2 inline.**
- Reputation threshold for communities: **100** + 30 days + no strike in 90 days + fewer than 3 owned.
- Private or invite-only communities: **no.** All are public and open to join.
- Images in posts or chats: **no** (avatars only).
- Username changes: **once per 30 days.**
- Strike window: **365 days.** Temporary ban length: **7 days.**
- Auto-hide threshold: **3 distinct reporters** (2 for "illegal").
- Push for reactions: **none.**

### Deferred (v2+)

Phone OTP; native Google Sign-In (`signInWithIdToken`); images in posts and chats; message edit, unsend and typing indicators; appeals flow; owner transfer; private communities; Expo push receipts and token pruning; server-side reach-widening notifications ("answer routing"); H3 fan-out; LLM auto-tagging; pincode boundary polygons (India Post); verified-resident badges; web hosting of the share site (`EXPO_PUBLIC_WEB_URL`); custom auth domain; analytics for the answered-within-1-hour metric (the data exists in `first_answer_at`); i18n (Hindi and Kannada); dark mode.

---

### References (checked Sep 2026)

- [Expo SDK 57 changelog](https://expo.dev/changelog/sdk-57): RN 0.86, React 19.2
- [Expo SDK 56 changelog](https://expo.dev/changelog/sdk-56): Router drops React Navigation, Node ≥ 20.19.4, TS 6.0.3, `@expo/vector-icons` deprecated
- [SDK 57 bundledNativeModules.json](https://raw.githubusercontent.com/expo/expo/sdk-57/packages/expo/bundledNativeModules.json) and the [default template package.json](https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-default/package.json)
- [Expo Router tabs](https://docs.expo.dev/router/advanced/tabs/) and the [React Navigation migration note](https://docs.expo.dev/router/migrate/from-react-navigation/)
- [react-native-maps in Expo](https://docs.expo.dev/versions/latest/sdk/map-view/)
- [expo-notifications](https://docs.expo.dev/versions/latest/sdk/notifications/): Android push needs a dev build
- [Supabase Expo quickstart](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
- npm: [@supabase/supabase-js 2.117.2](https://registry.npmjs.org/@supabase/supabase-js/latest), [@tanstack/react-query 5.104.0](https://registry.npmjs.org/@tanstack/react-query/latest), [react-leaflet 5.0.0](https://registry.npmjs.org/react-leaflet/latest)

### Critical files for implementation

- `C:\Users\Danish Sultan\Documents\Mohalla\supabase\migrations\20260927000300_posts_comments.sql`
- `C:\Users\Danish Sultan\Documents\Mohalla\supabase\migrations\20260927001100_rls_grants.sql`
- `C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\app\(tabs)\index.tsx`
- `C:\Users\Danish Sultan\Documents\Mohalla\mobile\src\lib\auth.ts`
- `C:\Users\Danish Sultan\Documents\Mohalla\store.js` (source of the seed data to transcribe into `supabase\seed.sql`)