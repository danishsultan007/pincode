set search_path = public, extensions;

-- ---------- Login throttling (used by the login-with-identifier Edge Function) ----------
-- Keys are 'ip:<ip>', 'id:<sha256 of lower-cased identifier>' and
-- 'idip:<sha256 of identifier|ip>', so no usernames/emails/phones are stored here.
-- Counters live in a table, not in function memory, because Edge isolates are
-- short-lived and run as many parallel instances.
create table if not exists public.login_attempts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists login_attempts_key_at_idx on public.login_attempts (key, at);
alter table public.login_attempts enable row level security;   -- no policies: service_role only

-- Records one attempt per key, then reports whether every key is still within
-- its limit (count includes this attempt). Check-and-record is one statement
-- sequence so parallel requests cannot all slip under the limit. Every attempt
-- counts; a successful sign-in then clears its own identifier+IP key.
create or replace function public.login_throttle_hit(p_keys text[], p_max int[], p_window interval)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare i int; ok boolean := true;
begin
  delete from login_attempts where at < now() - interval '1 day';
  insert into login_attempts(key) select unnest(p_keys);
  for i in 1 .. coalesce(array_length(p_keys, 1), 0) loop
    if (select count(*) from login_attempts where key = p_keys[i] and at > now() - p_window) > p_max[i] then
      ok := false;
    end if;
  end loop;
  return ok;
end $$;

create or replace function public.login_throttle_clear(p_key text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from login_attempts where key = p_key $$;

revoke all on function public.login_throttle_hit(text[], int[], interval) from public, anon, authenticated;
revoke all on function public.login_throttle_clear(text)                  from public, anon, authenticated;
grant execute on function public.login_throttle_hit(text[], int[], interval) to service_role;
grant execute on function public.login_throttle_clear(text)                  to service_role;

-- ---------- phone_available: signed-in callers only ----------
-- Only called from onboarding and Settings → Phone (both signed in), and it
-- tells the caller whether a number is registered, so there's no reason to
-- leave it open to anonymous callers. (username_available stays open: usernames
-- are public on profiles anyway. email_available stays open for the sign-up
-- form — see the follow-up note in DEPLOY notes: it is an existence oracle and
-- should be removed once sign-up relies on the signUp response alone.)
revoke execute on function public.phone_available(text) from public, anon;
grant  execute on function public.phone_available(text) to authenticated;
