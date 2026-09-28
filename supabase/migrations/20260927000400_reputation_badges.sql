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
