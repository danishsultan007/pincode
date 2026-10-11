-- One reaction per person per post and per comment (like Facebook / WhatsApp / LinkedIn).
--
-- Before: the key was (post, user, reaction), so one person could add all six reactions.
-- Now:
--   1. Existing duplicates are collapsed to each user's newest reaction. The deletes fire the
--      existing counter triggers, so reaction_counts stay correct.
--   2. A unique index (post/comment, user) makes a second reaction impossible, even for old app
--      versions that still insert directly (they get a harmless "already taken" error).
--   3. set_post_reaction / set_comment_reaction replace or clear the caller's reaction in one
--      transaction: pass a reaction to set or switch it, or null to remove it.

set search_path = public, extensions;

-- 1) collapse duplicates, keeping the newest reaction per user
delete from public.post_reactions a using public.post_reactions b
 where a.post_id = b.post_id and a.user_id = b.user_id
   and (a.created_at, a.reaction) < (b.created_at, b.reaction);

delete from public.comment_reactions a using public.comment_reactions b
 where a.comment_id = b.comment_id and a.user_id = b.user_id
   and (a.created_at, a.reaction) < (b.created_at, b.reaction);

-- 2) enforce it
create unique index if not exists post_reactions_one_per_user on public.post_reactions (post_id, user_id);
create unique index if not exists comment_reactions_one_per_user on public.comment_reactions (comment_id, user_id);

-- Old app versions still insert directly. Instead of failing with "already taken" when they switch
-- reaction, replace the person's previous reaction first (the delete keeps the counters right).
-- Inserting the SAME reaction again still fails, as before.
create or replace function public.reaction_replace_before_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if tg_table_name = 'post_reactions' then
    delete from public.post_reactions where post_id = new.post_id and user_id = new.user_id and reaction <> new.reaction;
  else
    delete from public.comment_reactions where comment_id = new.comment_id and user_id = new.user_id and reaction <> new.reaction;
  end if;
  return new;
end $$;
revoke execute on function public.reaction_replace_before_insert() from public, anon;
drop trigger if exists t05_post_reactions_single on public.post_reactions;
create trigger t05_post_reactions_single before insert on public.post_reactions
  for each row execute function public.reaction_replace_before_insert();
drop trigger if exists t05_comment_reactions_single on public.comment_reactions;
create trigger t05_comment_reactions_single before insert on public.comment_reactions
  for each row execute function public.reaction_replace_before_insert();

-- 3) set / switch / clear
create or replace function public.set_post_reaction(p_post uuid, p_reaction text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  -- Removing your own reaction is always allowed; adding one needs an active account.
  if p_reaction is not null and not public.can_participate(uid) then raise exception 'not_allowed'; end if;
  if p_reaction is not null and p_reaction not in ('like','love','haha','wow','thanks','celebrate') then
    raise exception 'bad_reaction';
  end if;
  -- Two quick switches by the same person must not interleave.
  perform pg_advisory_xact_lock(hashtext(p_post::text || uid::text));
  delete from public.post_reactions where post_id = p_post and user_id = uid and reaction is distinct from p_reaction;
  if p_reaction is not null then
    insert into public.post_reactions (post_id, user_id, reaction) values (p_post, uid, p_reaction)
    on conflict do nothing;
  end if;
end $$;

create or replace function public.set_comment_reaction(p_comment uuid, p_reaction text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_reaction is not null and not public.can_participate(uid) then raise exception 'not_allowed'; end if;
  if p_reaction is not null and p_reaction not in ('like','love','haha','wow','thanks','celebrate') then
    raise exception 'bad_reaction';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_comment::text || uid::text));
  delete from public.comment_reactions where comment_id = p_comment and user_id = uid and reaction is distinct from p_reaction;
  if p_reaction is not null then
    insert into public.comment_reactions (comment_id, user_id, reaction) values (p_comment, uid, p_reaction)
    on conflict do nothing;
  end if;
end $$;

revoke execute on function public.set_post_reaction(uuid, text) from public, anon;
revoke execute on function public.set_comment_reaction(uuid, text) from public, anon;
grant execute on function public.set_post_reaction(uuid, text) to authenticated;
grant execute on function public.set_comment_reaction(uuid, text) to authenticated;
