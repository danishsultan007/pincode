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
