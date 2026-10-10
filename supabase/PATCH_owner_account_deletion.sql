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
