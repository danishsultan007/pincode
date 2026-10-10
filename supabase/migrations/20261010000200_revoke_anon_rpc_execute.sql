-- 20261010000200_revoke_anon_rpc_execute.sql
-- Defense in depth: stop the `anon` role (anyone holding the public anon key)
-- from EXECUTE-ing SECURITY DEFINER functions in schema public.
--
-- BACKGROUND
--   Supabase's default privileges grant EXECUTE on every new function in
--   `public` to anon + authenticated + service_role (pg_default_acl, owner
--   postgres), and PostgreSQL itself grants EXECUTE to PUBLIC by default.
--   20260927001100_rls_grants.sql only revoked a short "internal" list, so 63
--   SECURITY DEFINER functions (admin_*, set_community_role, start_conversation,
--   submit_report, update_phone, ...) were reachable by anon over PostgREST
--   (/rest/v1/rpc/<name>). Their in-body auth checks are the only barrier;
--   this migration adds the missing privilege layer.
--
-- ANALYSIS (read-only queries on dev; prod is identical)
--   A function used inside an RLS policy, security_invoker view, column
--   DEFAULT, CHECK constraint, index expression, trigger WHEN clause or a
--   SECURITY INVOKER function runs with the CALLER's privileges and therefore
--   needs EXECUTE for the caller's role. Functions called inside SECURITY
--   DEFINER functions run as the owner (postgres) and need nothing. Trigger
--   functions are not EXECUTE-checked at fire time.
--   Scanned: pg_policies (qual + with_check, all schemas), view definitions,
--   pg_attrdef, CHECK/EXCLUDE constraints, index definitions, non-internal
--   triggers, and prosrc of every SECURITY INVOKER function in public.
--   Result:
--     - Referenced by a policy that applies to anon (roles = {public}):
--         is_admin, is_community_mod   (comments_read, comm_read, posts_read)
--     - Referenced only by `TO authenticated` policies (never evaluated for
--       anon, and authenticated keeps EXECUTE): can_participate, is_banned,
--       is_conversation_member  -> revoked from anon.
--     - No view, default, CHECK constraint, index or invoker function calls a
--       SECURITY DEFINER function (invoker functions only call the invoker
--       helper to_prefix_tsquery). No storage/other-schema policy references
--       public functions.
--     - is_blocked_between(uuid,uuid): referenced ONLY from the SECURITY
--       DEFINER functions comments_prepare, messages_prepare and
--       start_conversation (run as owner) and not by the mobile app, so it is
--       revoked from anon AND authenticated (service_role/owner keep it).
--   Logged-out screens call (mobile/src/api/profiles.ts): username_available,
--   suggest_usernames, email_available, get_profile (public profile page);
--   slug_available is allow-listed too. phone_available and accept_terms were
--   already anon-revoked and stay so.
--
-- WHAT THIS DOES
--   1. For every SECURITY DEFINER function in public NOT in v_keep: revoke
--      EXECUTE from PUBLIC and anon, then re-grant to authenticated and
--      service_role if they had it before (so nothing authenticated/Edge
--      Functions can call today is lost). Prints a NOTICE per function.
--   2. Raises if any non-kept SECURITY DEFINER function is still anon-callable.
--   3. Future functions (owner postgres, i.e. migrations): a per-schema ALTER DEFAULT
--      PRIVILEGES can only ADD to the built-in global default (EXECUTE to PUBLIC), so
--      PUBLIC is removed with the GLOBAL form (no IN SCHEMA), the per-schema anon
--      default entry is revoked, and authenticated + service_role are granted
--      explicitly. supabase_admin defaults are not touched.
--   4. Unrelated but same theme: login_attempts had full table privileges
--      (incl. TRUNCATE, which bypasses RLS) for anon/authenticated, which would
--      let anyone reset the login throttle. Revoked; service_role is unchanged.
--   SECURITY INVOKER functions (posts_near, search_*, communities_near, helpers)
--   are intentionally untouched: they obey the caller's RLS/table privileges.
--
-- TEST: supabase/tests/security_rpc_access.sql
--   npx.cmd supabase db query --linked --file supabase/tests/security_rpc_access.sql
--   (passes only by ending in "ALL SECURITY RPC ACCESS CHECKS PASSED (rolled back)")
--
-- ROLLBACK (manual): grant execute on all functions in schema public to anon;

do $mig$
declare
  -- Functions that STAY executable by anon (SECURITY DEFINER only).
  v_keep text[] := array[
    'is_admin',          -- called from anon-applicable RLS policies (comments_read, comm_read, posts_read); policy exprs run as the caller
    'is_community_mod',  -- called from anon-applicable RLS policies (comments_read, posts_read)
    'get_profile',       -- public profile page (user/[username]) is viewable logged out
    'username_available',-- sign-up screen, before a session exists
    'slug_available',    -- allow-listed: community slug check (harmless boolean)
    'suggest_usernames', -- sign-up screen, before a session exists
    'email_available'    -- sign-up screen, before a session exists
  ];
  -- Also revoked from authenticated (only ever called from other definer fns).
  v_internal text[] := array['is_blocked_between'];
  r record;
  v_missing text;
  v_left text;
  n int := 0;
begin
  -- Typo guard: every keep/internal entry must exist as a public function.
  select string_agg(k, ', ') into v_missing
    from unnest(v_keep || v_internal) k
   where not exists (select 1 from pg_proc p
                      where p.pronamespace = 'public'::regnamespace and p.proname = k);
  if v_missing is not null then
    raise exception 'keep/internal list names unknown function(s): %', v_missing;
  end if;

  for r in
    select p.oid, p.oid::regprocedure::text as sig, p.proname,
           has_function_privilege('authenticated', p.oid, 'execute') as had_auth,
           has_function_privilege('service_role',  p.oid, 'execute') as had_srv,
           has_function_privilege('anon',          p.oid, 'execute') as had_anon
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.prokind in ('f', 'p')
       and p.prosecdef
       and not (p.proname = any (v_keep))
     order by 2
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    if r.proname = any (v_internal) then
      execute format('revoke execute on function %s from authenticated', r.sig);
    elsif r.had_auth then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
    if r.had_srv then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
    if r.had_anon then
      n := n + 1;
      raise notice 'revoked anon/public execute: %', r.sig;
    end if;
  end loop;
  raise notice 'total functions revoked from anon: %', n;

  select string_agg(p.oid::regprocedure::text, ', ') into v_left
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not (p.proname = any (v_keep))
     and has_function_privilege('anon', p.oid, 'execute');
  if v_left is not null then
    raise exception 'still anon-executable after revoke: %', v_left;
  end if;
end
$mig$;

-- Future functions created by migrations (role postgres) are private by default.
-- Global form: removes the built-in PUBLIC EXECUTE (an IN SCHEMA revoke cannot).
alter default privileges for role postgres revoke execute on functions from public;
-- pg_default_acl also holds an explicit per-schema anon entry for postgres/public.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres in schema public grant  execute on functions to authenticated, service_role;

-- Throttle table is service_role-only (RLS on, no policies); also drop the
-- table-level privileges that bypass RLS (TRUNCATE) or are never needed.
revoke all on table public.login_attempts from public, anon, authenticated;

