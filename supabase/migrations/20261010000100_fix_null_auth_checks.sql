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
