set search_path = public, extensions;

-- One-row remote config read by the app on launch / resume. Today it holds the
-- minimum supported app version: phones on an older native build see a blocking
-- "Update required" screen (mobile/src/components/UpdateRequiredGate.tsx).
-- Phones stuck on an old build can't receive OTA updates for newer runtimes, so
-- this lets us retire them before shipping database cleanups.
--
-- To raise it (ONLY after the new build is live on Play), in the SQL editor:
--   update app_config set min_supported_version = '1.2.0', message = '...' where id;
-- No write policies: it is edited via the SQL editor / service role only.
create table if not exists public.app_config (
  id boolean primary key default true check (id),
  min_supported_version text not null default '1.0.0'
    check (min_supported_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  message text,
  updated_at timestamptz not null default now()
);

insert into public.app_config (id) values (true) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);

revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
