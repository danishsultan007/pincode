-- supabase/tests/security_rpc_access.sql
-- Verifies the RPC privilege model set by
-- supabase/migrations/20261010000200_revoke_anon_rpc_execute.sql:
--   (a) every public SECURITY DEFINER function outside the anon keep-list is
--       NOT executable by anon, and (except the internal ones) still IS
--       executable by authenticated and service_role;
--   (b) everything the logged-out app does still works as `anon`;
--   (c) the main reads/RPCs of the signed-in app still work as `authenticated`
--       (no "permission denied for function/table").
-- Everything runs in one transaction and always ends in an exception, so
-- NOTHING persists. Success = the final error message:
--   ALL SECURITY RPC ACCESS CHECKS PASSED (rolled back)
-- Any other error = a failed check (the message lists the offenders).
--
-- Run (DEV only, after the migration is applied there):
--   npx.cmd supabase db query --linked --file supabase/tests/security_rpc_access.sql
-- or paste into the Supabase SQL editor. Needs no seed data (creates a
-- throwaway auth user inside the transaction).

begin;

-- ---------------------------------------------------------------------------
-- (a) catalog assertions
-- ---------------------------------------------------------------------------
do $$
declare
  -- keep in sync with v_keep in the migration
  v_keep text[] := array['is_admin','is_community_mod','get_profile','username_available',
                         'slug_available','suggest_usernames','email_available'];
  -- SECURITY DEFINER functions that authenticated is intentionally NOT allowed to run
  v_no_auth text[] := array['_excerpt','_has_pattern','_notify_admins','_send_system_message',
    '_set_mod_status','_set_solved','_system_conversation','award_badge','award_rep',
    'delete_my_account','filter_terms_validate','handle_new_user','handle_user_email_change',
    'login_throttle_clear','login_throttle_hit','moderate_text','notify','revoke_rep',
    'send_push','is_blocked_between',
    '_chat_attachment_paths_for_user','_expired_chat_attachments'];
  v_anon text; v_auth text; v_srv text; v_keepmiss text;
begin
  select string_agg(p.oid::regprocedure::text, E'\n  ' order by p.proname) into v_anon
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not (p.proname = any (v_keep))
     and has_function_privilege('anon', p.oid, 'execute');
  assert v_anon is null, E'anon can still EXECUTE SECURITY DEFINER functions:\n  ' || v_anon;

  select string_agg(p.oid::regprocedure::text, E'\n  ' order by p.proname) into v_auth
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not (p.proname = any (v_keep)) and not (p.proname = any (v_no_auth))
     and not has_function_privilege('authenticated', p.oid, 'execute');
  assert v_auth is null, E'authenticated lost EXECUTE on:\n  ' || v_auth;

  select string_agg(p.oid::regprocedure::text, E'\n  ' order by p.proname) into v_auth
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'is_blocked_between'
     and has_function_privilege('authenticated', p.oid, 'execute');
  assert v_auth is null, E'is_blocked_between should be internal-only but authenticated can run:\n  ' || v_auth;

  select string_agg(p.oid::regprocedure::text, E'\n  ' order by p.proname) into v_srv
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef
     and not has_function_privilege('service_role', p.oid, 'execute');
  assert v_srv is null, E'service_role lost EXECUTE on:\n  ' || v_srv;

  select string_agg(k, ', ') into v_keepmiss from unnest(v_keep) k
   where not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
                      and p.proname = k and has_function_privilege('anon', p.oid, 'execute'));
  assert v_keepmiss is null, 'keep-list functions anon cannot execute: ' || v_keepmiss;

  assert not has_table_privilege('anon', 'public.login_attempts', 'truncate')
     and not has_table_privilege('authenticated', 'public.login_attempts', 'truncate')
     and not has_table_privilege('anon', 'public.login_attempts', 'select'),
    'anon/authenticated still hold privileges on public.login_attempts';

  -- future functions must not default to anon/PUBLIC
  assert not exists (
    select 1 from pg_default_acl d
     where pg_get_userbyid(d.defaclrole) = 'postgres' and d.defaclobjtype = 'f'
       and d.defaclnamespace in (0, 'public'::regnamespace)   -- global + public entries (not storage etc.)
       and exists (select 1 from aclexplode(d.defaclacl) a
                    where a.privilege_type = 'EXECUTE' and (a.grantee = 0 or a.grantee = 'anon'::regrole))),
    'default privileges for postgres still grant EXECUTE on new functions to PUBLIC/anon';
end $$;

-- Real effect of the default-privilege change: a function created now by the
-- migration owner role (postgres) must be private to anon but open to
-- authenticated/service_role. (Passes only AFTER the migration is applied.)
set local role postgres;
create function public.__acl_probe() returns int language sql as 'select 1';
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'public.__acl_probe()', 'execute'),
    'NEW function created by postgres is executable by anon (default privileges not fixed: global PUBLIC revoke missing?)';
  assert has_function_privilege('authenticated', 'public.__acl_probe()', 'execute'),
    'NEW function created by postgres is not executable by authenticated';
  assert has_function_privilege('service_role', 'public.__acl_probe()', 'execute'),
    'NEW function created by postgres is not executable by service_role';
end $$;
drop function public.__acl_probe();

-- Helper: run a statement as the CURRENT role. Fails on permission denied and on
-- any "object does not exist / bad column / bad argument" error (renamed function,
-- wrong arg name, missing table: 42883 42P01 42703 42P02 42704 42601). Any other
-- error fails too unless its message matches (ILIKE) an entry of the explicit
-- allow-list p_ok given by the caller for that specific call.
create function pg_temp.chk(q text, p_ok text[] default '{}') returns void language plpgsql as $f$
begin
  execute q;
exception when others then
  if sqlstate in ('42883','42P01','42703','42P02','42704','42601') or sqlerrm ilike 'permission denied%' then
    raise exception 'FAIL [%] as % -> % (%)', q, current_user, sqlerrm, sqlstate;
  end if;
  if not exists (select 1 from unnest(p_ok) o where sqlerrm ilike o) then
    raise exception 'UNEXPECTED ERROR [%] as % -> % (%)', q, current_user, sqlerrm, sqlstate;
  end if;
end $f$;
-- (the migration's default privileges no longer give new functions to PUBLIC, so grant explicitly)
grant execute on function pg_temp.chk(text, text[]) to public;

-- ---------------------------------------------------------------------------
-- (b) logged-out app, as anon
-- ---------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare t text;
begin
  -- tables/views anon can read today (information_schema.role_table_grants) and
  -- that run policy functions (is_admin / is_community_mod) as anon
  foreach t in array array['community_cards','profiles','communities',
                           'comments','community_members','badges','user_badges','app_config'] loop
    perform pg_temp.chk(format('select * from public.%I limit 1', t));
  end loop;
  perform pg_temp.chk('select id from public.posts limit 1');        -- column-level select grant

  -- RPCs on the keep-list: must run without "permission denied"
  perform pg_temp.chk($q$select public.username_available('x_test_user')$q$);
  perform pg_temp.chk($q$select public.slug_available('x-test-slug')$q$);
  perform pg_temp.chk($q$select public.email_available('nobody@example.invalid')$q$);
  perform pg_temp.chk($q$select * from public.suggest_usernames('hoodi', 3)$q$);
  perform pg_temp.chk($q$select public.get_profile('no_such_user_xyz')$q$);
  perform pg_temp.chk($q$select public.is_admin()$q$);
  perform pg_temp.chk($q$select public.is_community_mod('00000000-0000-4000-8000-0000000000ff')$q$);
  -- NOTE: post_cards, comment_cards, posts_near and search_posts are NOT asserted for anon: they already fail
  -- with 'permission denied for table post_votes/comment_votes/blocks' (table grants, unrelated to EXECUTE).
  -- SECURITY INVOKER read function anon can call
  perform pg_temp.chk($q$select * from public.communities_near(12.99, 77.69, 25)$q$);

  assert public.username_available('zq_free_name_9') is true, 'username_available(unused) should be true';
  assert public.get_profile('no_such_user_xyz') is null, 'get_profile(missing) should be null';
  assert public.is_admin() is not true, 'anon must not be admin';
end $$;

-- must now be BLOCKED for anon (privilege layer, before any in-body check)
do $$
declare q text; blocked int := 0; leaked text := '';
begin
  foreach q in array array[
    $q$select public.admin_test_filter('a','b')$q$,
    $q$select public.start_conversation('00000000-0000-4000-8000-0000000000ff')$q$,
    $q$select public.submit_report('post'::report_target,'00000000-0000-4000-8000-0000000000ff','spam'::report_category,'x',null)$q$,
    $q$select public.update_phone('+919999999999')$q$,
    $q$select public.can_create_community()$q$,
    $q$select public.inbox_counts()$q$,
    $q$select public.is_blocked_between('00000000-0000-4000-8000-0000000000fe','00000000-0000-4000-8000-0000000000ff')$q$,
    $q$select public.set_community_role('00000000-0000-4000-8000-0000000000ff','00000000-0000-4000-8000-0000000000fe','member')$q$
  ] loop
    begin
      execute q;
      leaked := leaked || E'\n  ' || q;
    exception when others then
      if sqlerrm ilike 'permission denied for function%' then blocked := blocked + 1;
      else leaked := leaked || E'\n  ' || q || '  -> ' || sqlerrm; end if;
    end;
  end loop;
  assert leaked = '', 'anon reached a function it should not be able to execute:' || leaked;
  assert blocked = 8, 'expected 8 anon calls blocked, got ' || blocked;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- (c) signed-in app, as authenticated (throwaway user, rolled back)
-- ---------------------------------------------------------------------------
do $$
declare v uuid := gen_random_uuid(); v_name text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'rpc-access-test-' || v || '@test.invalid', '', now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"RPC Access Test"}'::jsonb,
    now(), now(), '', '', '', '');
  assert exists (select 1 from public.profiles where id = v), 'handle_new_user did not create a profile for the throwaway user';
  -- finish onboarding as the superuser (same columns seed.sql sets) so can_participate() passes
  -- and the posts insert below really runs the write-path triggers
  update public.profiles set username = 'zz_rpc_probe', bio = 'rpc access test', interests = '{}',
    home_area = 'Hoodi', home_pincode = '560048', home_city = 'Bengaluru', onboarded_at = now()
   where id = v;
  v_name := 'zz_rpc_probe';
  perform set_config('test.uid', v::text, true);
  perform set_config('test.uname', v_name, true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('test.uid'), 'role', 'authenticated')::text, true);

do $$
declare t text; uid text := current_setting('test.uid'); uname text := current_setting('test.uname');
begin
  assert auth.uid() = uid::uuid, 'jwt claim not applied';
  foreach t in array array['post_cards','comment_cards','community_cards','profiles','communities',
      'comments','community_members','badges','user_badges','app_config','post_votes',
      'comment_votes','post_reactions','comment_reactions','alert_confirmations','conversations',
      'conversation_members','messages','notifications','blocks','reports','strikes','private_profiles',
      'feedback','reputation_events','community_bans','moderation_queue','moderation_actions','filter_terms'] loop
    perform pg_temp.chk(format('select * from public.%I limit 1', t));
  end loop;

  perform pg_temp.chk('select id from public.posts limit 1');  -- posts has column-level grants only

  -- feed / search / lists (named notation: argument names are the app's p_* names)
  perform pg_temp.chk('select * from public.posts_near(p_lat := 12.99, p_lng := 77.69, p_radius_km := 10)');
  perform pg_temp.chk('select * from public.posts_near(p_lat := 12.99, p_lng := 77.69, p_radius_km := 10, p_sort := ''newest'', p_limit := 50, p_offset := 0)');
  perform pg_temp.chk('select * from public.search_posts(p_q := ''plumber'', p_lat := 12.99, p_lng := 77.69)');
  perform pg_temp.chk('select * from public.search_users(p_q := ''a'')');
  perform pg_temp.chk('select * from public.communities_near(p_lat := 12.99, p_lng := 77.69)');
  perform pg_temp.chk('select * from public.list_conversations(''chats'')');
  perform pg_temp.chk('select * from public.list_conversations(''requests'')');
  perform pg_temp.chk('select public.inbox_counts()');
  perform pg_temp.chk('select public.can_create_community()');
  perform pg_temp.chk(format('select public.get_profile(%L)', uname));
  perform pg_temp.chk(format('select public.get_profile(%L)', 'no_such_user_xyz'));
  perform pg_temp.chk('select public.username_available(''abc_test_1'')');
  perform pg_temp.chk('select public.email_available(''nobody@example.invalid'')');
  perform pg_temp.chk('select public.phone_available(''+919999999999'')');
  perform pg_temp.chk('select public.slug_available(''abc-test'')');
  perform pg_temp.chk('select * from public.suggest_usernames(''hoodi'', 3)');
  perform pg_temp.chk('select public.is_admin()');
  perform pg_temp.chk('select public.is_banned(auth.uid())');
  perform pg_temp.chk('select public.can_participate(auth.uid())');
  perform pg_temp.chk('select public.is_community_mod(auth.uid())');
  perform pg_temp.chk('select public.is_conversation_member(gen_random_uuid())');

  -- write paths that go through policy functions (can_participate) and
  -- trigger functions (posts_prepare, posts_filter, ...); business errors are fine
  -- must SUCCEED: onboarded user, RLS can_participate(), triggers posts_prepare/posts_filter/posts_counters
  perform pg_temp.chk($q$insert into public.posts(type, kind, tag, title, body, lat, lng, pincode, area, city)
      values ('ask','request','cook','rpc access test','rpc access test body',12.99,77.70,'560048','Hoodi','Bengaluru')$q$);
  assert exists (select 1 from public.posts where author_id = auth.uid() and title = 'rpc access test'),
    'posts insert by the onboarded throwaway user did not go through';
  perform pg_temp.chk('select public.mark_all_notifications_read()');
  perform pg_temp.chk($q$select public.register_push_token('ExponentPushToken[test]','android')$q$);
  perform pg_temp.chk($q$select public.start_conversation(gen_random_uuid())$q$, array['not_found']);
  perform pg_temp.chk($q$select public.accept_terms('1.0')$q$);
end $$;

reset role;

do $$ begin
  raise exception 'ALL SECURITY RPC ACCESS CHECKS PASSED (rolled back)';
end $$;

rollback;







