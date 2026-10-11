-- supabase/tests/single_reaction.sql
--
-- Regression test for migration 20261012000500_single_reaction.sql.
-- Run:  npx.cmd supabase db query --linked --file supabase/tests/single_reaction.sql
-- SUCCESS: ends with an error "ALL SINGLE-REACTION CHECKS PASSED (rolled back)".

begin;

do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); v_post uuid := gen_random_uuid(); v_c uuid := gen_random_uuid();
        u uuid;
begin
  foreach u in array array[ua, ub] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'react_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  end loop;
  update public.profiles set onboarded_at = now() where id in (ua, ub);
  insert into public.posts (id, author_id, type, title, body, lat, lng)
  values (v_post, ub, 'ask', 'reaction test post', 'fixture', 12.9915, 77.6944);
  insert into public.comments (id, post_id, author_id, body) values (v_c, v_post, ub, 'reaction test comment');
  perform set_config('sr.a', ua::text, true); perform set_config('sr.b', ub::text, true);
  perform set_config('sr.post', v_post::text, true); perform set_config('sr.comment', v_c::text, true);
end $$;

-- anon cannot call the functions
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
begin
  begin perform public.set_post_reaction(current_setting('sr.post')::uuid, 'like');
    raise exception 'TEST FAILED: anon set_post_reaction ran';
  exception when insufficient_privilege then null; end;
  begin perform public.set_comment_reaction(current_setting('sr.comment')::uuid, 'like');
    raise exception 'TEST FAILED: anon set_comment_reaction ran';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- as A: set, switch, clear, and the unique rule
select set_config('request.jwt.claims', json_build_object('sub', current_setting('sr.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare p uuid := current_setting('sr.post')::uuid; c uuid := current_setting('sr.comment')::uuid; a uuid := current_setting('sr.a')::uuid;
begin
  perform public.set_post_reaction(p, 'like');
  assert (select count(*) from public.post_reactions where post_id = p and user_id = a) = 1, 'TEST FAILED: one reaction expected';
  perform public.set_post_reaction(p, 'love');   -- switch
  assert (select array_agg(reaction) from public.post_reactions where post_id = p and user_id = a) = array['love'],
    'TEST FAILED: switching should leave only love';
  perform public.set_post_reaction(p, 'love');   -- idempotent
  assert (select count(*) from public.post_reactions where post_id = p and user_id = a) = 1, 'TEST FAILED: repeat set duplicated';

  -- a direct second insert (what old app versions do) switches the reaction, never adds a second
  insert into public.post_reactions (post_id, user_id, reaction) values (p, a, 'haha');
  assert (select array_agg(reaction) from public.post_reactions where post_id = p and user_id = a) = array['haha'],
    'TEST FAILED: a direct insert should replace the previous reaction';
  assert coalesce((select (reaction_counts->>'love')::int from public.posts where id = p), 0) = 0,
    'TEST FAILED: love count should drop when the direct insert replaced it';
  perform public.set_post_reaction(p, 'love');   -- back to love for the later checks

  begin perform public.set_post_reaction(p, 'bogus');
    raise exception 'TEST FAILED: invalid reaction accepted';
  exception when others then
    if sqlerrm <> 'bad_reaction' then raise exception 'TEST FAILED: expected bad_reaction, got %', sqlerrm; end if;
  end;

  -- same rules for comments
  perform public.set_comment_reaction(c, 'wow');
  perform public.set_comment_reaction(c, 'thanks');
  assert (select array_agg(reaction) from public.comment_reactions where comment_id = c and user_id = a) = array['thanks'],
    'TEST FAILED: comment switch should leave only thanks';
  insert into public.comment_reactions (comment_id, user_id, reaction) values (c, a, 'like');
  assert (select array_agg(reaction) from public.comment_reactions where comment_id = c and user_id = a) = array['like'],
    'TEST FAILED: a direct comment insert should replace the previous reaction';
  perform public.set_comment_reaction(c, 'thanks');
end $$;
reset role;

-- counters follow the switches (love = 1, like = 0; thanks = 1, wow = 0)
do $$
declare p uuid := current_setting('sr.post')::uuid; c uuid := current_setting('sr.comment')::uuid;
begin
  assert coalesce((select (reaction_counts->>'love')::int from public.posts where id = p), 0) = 1, 'TEST FAILED: love count';
  assert coalesce((select (reaction_counts->>'like')::int from public.posts where id = p), 0) = 0, 'TEST FAILED: like count after switch';
  assert coalesce((select (reaction_counts->>'thanks')::int from public.comments where id = c), 0) = 1, 'TEST FAILED: thanks count';
  assert coalesce((select (reaction_counts->>'wow')::int from public.comments where id = c), 0) = 0, 'TEST FAILED: wow count after switch';
end $$;

-- B reacts too (independent), then A clears
select set_config('request.jwt.claims', json_build_object('sub', current_setting('sr.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.set_post_reaction(current_setting('sr.post')::uuid, 'love'); end $$;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('sr.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.set_post_reaction(current_setting('sr.post')::uuid, null); end $$;
reset role;
do $$
declare p uuid := current_setting('sr.post')::uuid;
begin
  assert (select count(*) from public.post_reactions where post_id = p and user_id = current_setting('sr.a')::uuid) = 0, 'TEST FAILED: clear should remove A reaction';
  assert coalesce((select (reaction_counts->>'love')::int from public.posts where id = p), 0) = 1, 'TEST FAILED: B reaction should remain after A clears';
end $$;

do $$ begin raise exception 'ALL SINGLE-REACTION CHECKS PASSED (rolled back)'; end $$;

rollback;
