set search_path = public, extensions;

-- ---------- Terms acceptance ----------
-- Clients can't write private_profiles directly (only notification_prefs is
-- grantable), so acceptance goes through this RPC. The app compares
-- terms_version to its bundled TERMS_VERSION and re-prompts when it changes.
alter table public.private_profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

create or replace function public.accept_terms(p_version text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_version, '') = '' or char_length(p_version) > 32 then raise exception 'not_allowed'; end if;
  update private_profiles set terms_accepted_at = now(), terms_version = p_version where id = auth.uid();
end $$;
revoke execute on function public.accept_terms(text) from public, anon;
grant  execute on function public.accept_terms(text) to authenticated;

-- ---------- In-app feedback ----------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 3 and 2000),
  category text not null default 'other' check (category in ('bug', 'idea', 'other')),
  app_version text,
  platform text,
  status text not null default 'new' check (status in ('new', 'seen', 'closed')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_status_created_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists feedback_admin_read on public.feedback;
create policy feedback_admin_read on public.feedback for select to authenticated using (public.is_admin());
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.feedback from anon, authenticated;
grant insert (message, category, app_version, platform) on public.feedback to authenticated;
grant select on public.feedback to authenticated;            -- rows still limited to admins by RLS
grant update (status) on public.feedback to authenticated;   -- ditto

create or replace function public.feedback_guard() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is not null then
    new.user_id := uid; new.created_at := now(); new.status := 'new';
    select count(*) into n from feedback where user_id = uid and created_at > now() - interval '24 hours';
    if n >= 5 then raise exception 'rate_limited_feedback'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t10_feedback_guard on public.feedback;
create trigger t10_feedback_guard before insert on public.feedback
  for each row execute function public.feedback_guard();
