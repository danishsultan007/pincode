-- Delivered / read ticks for direct chats.
--
-- * conversation_receipts: one row per (conversation, person) saying how far THAT person has got:
--   delivered_at = the newest message their app has synced, read_at = the newest message they have
--   opened the chat on. The sender's app compares a message's created_at with the other person's row.
--   Only the functions below write it.
-- * private_profiles.read_receipts: switch (default on). Off = this person's read_at stops moving
--   (and the app shows them no read ticks either). "Delivered" is always recorded.
-- * conversation_members: members could read EACH OTHER's row (last_read_at, muted, hidden,
--   unread_count). That leaked what the receipts switch is meant to hide, so the policy is narrowed
--   to your own row. The app only ever reads its own row.

set search_path = public, extensions;

-- ---------- the switch ----------
alter table public.private_profiles add column if not exists read_receipts boolean not null default true;
grant update (read_receipts) on public.private_profiles to authenticated;

-- ---------- receipts ----------
create table if not exists public.conversation_receipts (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  primary key (conversation_id, user_id)
);
alter table public.conversation_receipts enable row level security;
drop policy if exists cr_read on public.conversation_receipts;
create policy cr_read on public.conversation_receipts for select to authenticated
  using (public.is_conversation_member(conversation_id));
revoke all on table public.conversation_receipts from public, anon, authenticated;
grant select on public.conversation_receipts to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.conversation_receipts;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Existing chats: what people have already opened counts as read.
insert into public.conversation_receipts (conversation_id, user_id, delivered_at, read_at)
select m.conversation_id, m.user_id, m.last_read_at, m.last_read_at
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
 where c.kind = 'direct' and c.status = 'accepted' and m.last_read_at is not null
on conflict do nothing;

-- ---------- delivered: "my app has synced my chats" ----------
-- Called by the app on start, on coming back to the foreground, and when a chat changes. For every
-- accepted direct chat it marks the newest message from the OTHER person as delivered (not simply
-- the newest message: if I replied meanwhile, theirs must still be marked). Rows are only written
-- when the value moves, so repeat calls cost nothing.
create or replace function public.mark_chats_delivered() returns void language plpgsql
security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  insert into conversation_receipts (conversation_id, user_id, delivered_at)
  select c.id, uid, x.t
    from conversations c
    join conversation_members m on m.conversation_id = c.id and m.user_id = uid
    cross join lateral (
      select max(g.created_at) as t from messages g
       where g.conversation_id = c.id and g.sender_id is distinct from uid
         and not g.is_system and g.mod_status = 'visible') x
   where c.kind = 'direct' and c.status = 'accepted' and x.t is not null
     and not public.is_blocked_between(c.user_low, c.user_high)
  on conflict (conversation_id, user_id) do update set delivered_at = excluded.delivered_at
   where conversation_receipts.delivered_at is null or conversation_receipts.delivered_at < excluded.delivered_at;
end $$;
revoke execute on function public.mark_chats_delivered() from public, anon;
grant execute on function public.mark_chats_delivered() to authenticated;

-- ---------- read: opening the chat (same signature, so older app versions give read ticks too) ----------
create or replace function public.mark_conversation_read(p_conv uuid) returns void language plpgsql
security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); c conversations; share boolean; newest timestamptz;
begin
  if uid is null then return; end if;
  update conversation_members set last_read_at = now(), unread_count = 0
   where conversation_id = p_conv and user_id = uid;
  if not found then return; end if;
  select * into c from conversations where id = p_conv;
  select max(g.created_at) into newest from messages g
   where g.conversation_id = p_conv and g.sender_id is distinct from uid
     and not g.is_system and g.mod_status = 'visible';
  if c.kind = 'direct' and c.status = 'accepted' and newest is not null
     and not public.is_blocked_between(c.user_low, c.user_high) then
    select coalesce(read_receipts, true) into share from private_profiles where id = uid;
    share := coalesce(share, true);
    insert into conversation_receipts (conversation_id, user_id, delivered_at, read_at)
    values (p_conv, uid, newest, case when share then newest end)
    on conflict (conversation_id, user_id) do update
      set delivered_at = greatest(coalesce(conversation_receipts.delivered_at, '-infinity'::timestamptz), excluded.delivered_at),
          read_at = case when share
                         then greatest(coalesce(conversation_receipts.read_at, '-infinity'::timestamptz), excluded.read_at)
                         else conversation_receipts.read_at end
      where conversation_receipts.delivered_at is null or conversation_receipts.delivered_at < excluded.delivered_at
         or (share and (conversation_receipts.read_at is null or conversation_receipts.read_at < excluded.read_at));
  end if;
end $$;

-- ---------- members can no longer read each other's membership row ----------
drop policy if exists cm_read on public.conversation_members;
create policy cm_read on public.conversation_members for select to authenticated
  using (user_id = auth.uid());
