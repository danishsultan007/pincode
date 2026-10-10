-- supabase/tests/null_auth_checks.sql
--
-- Regression test for migration 20261010000100_fix_null_auth_checks.sql
-- (NULL-comparison authorization bypasses in delete_comment, set_community_role,
-- remove_community_member).
--
-- HOW TO RUN (after the migration has been applied to the target project):
--   npx.cmd supabase db query --linked --file supabase/tests/null_auth_checks.sql
-- or paste the whole file into the SQL editor.
--
-- SUCCESS SIGNAL: the run ends with an error whose message starts with
--   "ALL NULL-AUTH CHECKS PASSED (rolled back)"
-- That error is deliberate: it aborts the transaction so nothing persists.
-- Any message starting with "TEST FAILED" means a check failed (and is also rolled back).
-- The explicit rollback at the end is never reached on purpose; the whole script is
-- one transaction either way, so no data is left behind.
--
-- Fixtures: three throwaway auth.users (+ their profiles via the on_auth_user_created
-- trigger), one post, two comments, one ownerless community. All ids are random.

begin;

-- ------------------------------------------------------------
-- 0. Fixtures (run as the session owner / superuser role).
-- ------------------------------------------------------------
do $$
declare
  u_author uuid := gen_random_uuid();
  u_other  uuid := gen_random_uuid();
  u_mod    uuid := gen_random_uuid();
  v_post   uuid := gen_random_uuid();
  v_c1     uuid := gen_random_uuid();   -- comment by u_author (used by anon / other / author tests)
  v_c2     uuid := gen_random_uuid();   -- second comment by u_author (author-delete test)
  v_comm   uuid := gen_random_uuid();
  u uuid;
begin
  foreach u in array array[u_author, u_other, u_mod] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'nullauth_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
      '', '', '', '');
  end loop;

  assert (select count(*) from public.profiles where id in (u_author, u_other, u_mod)) = 3,
    'fixture: on_auth_user_created should have created 3 profiles';

  insert into public.posts (id, author_id, type, title, body, lat, lng)
  values (v_post, u_author, 'ask', 'null-auth test post', 'fixture post', 12.9915, 77.6944);

  insert into public.comments (id, post_id, author_id, body)
  values (v_c1, v_post, u_author, 'null-auth fixture comment one'),
         (v_c2, v_post, u_author, 'null-auth fixture comment two');

  -- Ownerless community: owner_id NULL, as after the owner deletes their account.
  insert into public.communities (id, slug, name, description, kind, category, lat, lng, radius_km, owner_id)
  values (v_comm, 'nullauth-' || substr(replace(v_comm::text, '-', ''), 1, 12), 'Null auth test',
          'fixture', 'area', 'area', 12.9915, 77.6944, 2, null);
  insert into public.community_members (community_id, user_id, role)
  values (v_comm, u_other, 'member'),
         (v_comm, u_mod,   'moderator'),
         (v_comm, u_author,'moderator');

  perform set_config('nullauth.author', u_author::text, true);
  perform set_config('nullauth.other',  u_other::text,  true);
  perform set_config('nullauth.mod',    u_mod::text,    true);
  perform set_config('nullauth.c1',     v_c1::text,     true);
  perform set_config('nullauth.c2',     v_c2::text,     true);
  perform set_config('nullauth.comm',   v_comm::text,   true);

  assert (select owner_id from public.communities where id = v_comm) is null, 'fixture: community must be ownerless';
end $$;

-- ------------------------------------------------------------
-- (a) anon (no JWT, auth.uid() IS NULL) must not be able to delete a comment.
-- ------------------------------------------------------------
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
begin
  begin
    perform public.delete_comment(current_setting('nullauth.c1')::uuid);
    raise exception 'TEST FAILED: (a) anon delete_comment succeeded';
  exception when others then
    if sqlerrm = 'not_authenticated' then
      null;                                    -- expected
    elsif sqlstate = '42501' then
      raise notice '(a) anon blocked by EXECUTE grant (permission denied) - also acceptable';
    else
      raise exception 'TEST FAILED: (a) anon delete_comment expected not_authenticated, got: %', sqlerrm;
    end if;
  end;
end $$;
reset role;
do $$
begin
  assert (select body from public.comments where id = current_setting('nullauth.c1')::uuid)
         = 'null-auth fixture comment one',
    'TEST FAILED: (a) comment body changed after anon delete_comment';
  assert (select deleted_at from public.comments where id = current_setting('nullauth.c1')::uuid) is null,
    'TEST FAILED: (a) comment deleted_at set after anon delete_comment';
end $$;

-- ------------------------------------------------------------
-- (b) authenticated non-author, non-admin, non-mod -> not_allowed.
-- ------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('nullauth.other'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.delete_comment(current_setting('nullauth.c1')::uuid);
    raise exception 'TEST FAILED: (b) non-author delete_comment succeeded';
  exception when others then
    if sqlerrm <> 'not_allowed' then
      raise exception 'TEST FAILED: (b) non-author delete_comment expected not_allowed, got: %', sqlerrm;
    end if;
  end;
end $$;
reset role;
do $$
begin
  assert (select body from public.comments where id = current_setting('nullauth.c1')::uuid)
         = 'null-auth fixture comment one',
    'TEST FAILED: (b) comment body changed after non-author delete_comment';
end $$;

-- ------------------------------------------------------------
-- (c) the author can delete their own comment.
-- ------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('nullauth.author'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.delete_comment(current_setting('nullauth.c2')::uuid);
end $$;
reset role;
do $$
begin
  assert (select body from public.comments where id = current_setting('nullauth.c2')::uuid) = '[deleted]',
    'TEST FAILED: (c) author delete_comment did not blank the comment';
  assert (select deleted_at from public.comments where id = current_setting('nullauth.c2')::uuid) is not null,
    'TEST FAILED: (c) author delete_comment did not set deleted_at';
end $$;

-- ------------------------------------------------------------
-- (d) ownerless community: a plain member must NOT be able to promote themselves.
-- ------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('nullauth.other'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.set_community_role(current_setting('nullauth.comm')::uuid,
                                      current_setting('nullauth.other')::uuid, 'moderator');
    raise exception 'TEST FAILED: (d) member self-promotion in ownerless community succeeded';
  exception when others then
    if sqlerrm <> 'not_allowed' then
      raise exception 'TEST FAILED: (d) set_community_role expected not_allowed, got: %', sqlerrm;
    end if;
  end;
end $$;
reset role;
do $$
begin
  assert (select role from public.community_members
           where community_id = current_setting('nullauth.comm')::uuid
             and user_id = current_setting('nullauth.other')::uuid) = 'member',
    'TEST FAILED: (d) member role changed in ownerless community';
end $$;

-- ------------------------------------------------------------
-- (e) ownerless community: a moderator must NOT be able to remove another moderator
--     (only the owner or an admin may; owner_id NULL used to bypass this).
-- ------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('nullauth.mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.remove_community_member(current_setting('nullauth.comm')::uuid,
                                           current_setting('nullauth.author')::uuid, 'test', false);
    raise exception 'TEST FAILED: (e) moderator removed another moderator in ownerless community';
  exception when others then
    if sqlerrm <> 'not_allowed' then
      raise exception 'TEST FAILED: (e) remove_community_member expected not_allowed, got: %', sqlerrm;
    end if;
  end;
end $$;
reset role;
do $$
begin
  assert exists (select 1 from public.community_members
                  where community_id = current_setting('nullauth.comm')::uuid
                    and user_id = current_setting('nullauth.author')::uuid),
    'TEST FAILED: (e) moderator was removed from ownerless community';
end $$;

-- ------------------------------------------------------------
-- (f) ownerless community: a moderator (non-owner) must NOT be able to rename it.
-- ------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('nullauth.mod'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.update_community(current_setting('nullauth.comm')::uuid, 'Hijacked name', null, null, null, null);
    raise exception 'TEST FAILED: (f) moderator renamed ownerless community';
  exception when others then
    if sqlerrm <> 'not_allowed' then
      raise exception 'TEST FAILED: (f) update_community expected not_allowed, got: %', sqlerrm;
    end if;
  end;
end $$;
reset role;
do $$
begin
  assert (select name from public.communities where id = current_setting('nullauth.comm')::uuid) = 'Null auth test',
    'TEST FAILED: (f) community name changed by non-owner moderator';
end $$;

-- ------------------------------------------------------------
-- Success: abort deliberately so nothing persists.
-- ------------------------------------------------------------
do $$
begin
  raise exception 'ALL NULL-AUTH CHECKS PASSED (rolled back)';
end $$;

rollback;
