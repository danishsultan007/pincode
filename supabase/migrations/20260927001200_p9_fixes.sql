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
