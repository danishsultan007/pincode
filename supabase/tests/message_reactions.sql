-- supabase/tests/message_reactions.sql
--
-- Regression test for migration 20261012000600_message_reactions.sql.
-- Run:  npx.cmd supabase db query --linked --file supabase/tests/message_reactions.sql
-- SUCCESS: ends with an error "ALL MESSAGE-REACTION CHECKS PASSED (rolled back)".

begin;

do $$
declare ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
        cab uuid := gen_random_uuid(); cac uuid := gen_random_uuid();
        m1 uuid := gen_random_uuid(); m2 uuid := gen_random_uuid(); m_req uuid := gen_random_uuid();
        u uuid;
begin
  foreach u in array array[ua, ub, uc] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'mreact_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  end loop;
  update public.profiles set onboarded_at = now(), display_name = 'Tester',
         username = ('mr_' || substr(md5(id::text), 1, 8))::citext where id in (ua, ub, uc);
  insert into public.conversations (id, kind, status, created_by, user_low, user_high)
  values (cab, 'direct', 'accepted', ua, least(ua, ub), greatest(ua, ub)),
         (cac, 'direct', 'pending',  ua, least(ua, uc), greatest(ua, uc));
  insert into public.conversation_members (conversation_id, user_id) values (cab, ua), (cab, ub), (cac, ua), (cac, uc);
  insert into public.messages (id, conversation_id, sender_id, body) values
    (m1, cab, ua, 'hello from A'), (m2, cab, ub, 'hello from B'), (m_req, cac, ua, 'request text');
  perform set_config('mr.a', ua::text, true); perform set_config('mr.b', ub::text, true); perform set_config('mr.c', uc::text, true);
  perform set_config('mr.m1', m1::text, true); perform set_config('mr.m2', m2::text, true); perform set_config('mr.req', m_req::text, true);
  perform set_config('mr.cab', cab::text, true);
end $$;

-- anon cannot call it
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin perform public.set_message_reaction(current_setting('mr.m1')::uuid, 'like');
    raise exception 'TEST FAILED: anon set_message_reaction ran';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- as A: react to B's message, switch, clear; cannot react in a pending request; cannot write the column directly
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare a text := current_setting('mr.a'); m2 uuid := current_setting('mr.m2')::uuid;
begin
  perform public.set_message_reaction(m2, 'like');
  assert (select reactions->>a from public.messages where id = m2) = 'like', 'TEST FAILED: reaction not stored';
  perform public.set_message_reaction(m2, 'love');
  assert (select reactions->>a from public.messages where id = m2) = 'love', 'TEST FAILED: switch failed';
  assert (select count(*) from jsonb_object_keys((select reactions from public.messages where id = m2))) = 1, 'TEST FAILED: more than one entry for A';
  perform public.set_message_reaction(m2, 'love');
  perform public.set_message_reaction(m2, 'love');   -- idempotent

  begin perform public.set_message_reaction(m2, 'bogus');
    raise exception 'TEST FAILED: invalid reaction accepted';
  exception when others then
    if sqlerrm <> 'bad_reaction' then raise exception 'TEST FAILED: expected bad_reaction, got %', sqlerrm; end if;
  end;

  begin perform public.set_message_reaction(current_setting('mr.req')::uuid, 'like');
    raise exception 'TEST FAILED: reaction allowed in a pending request';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise exception 'TEST FAILED: pending expected not_allowed, got %', sqlerrm; end if;
  end;

  -- users cannot edit messages directly
  begin update public.messages set reactions = '{"x":"like"}'::jsonb where id = m2;
    raise exception 'TEST FAILED: direct update of reactions succeeded';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- B reacts to A's message and to their own; both stored under their own id
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.set_message_reaction(current_setting('mr.m2')::uuid, 'haha');
  perform public.set_message_reaction(current_setting('mr.m1')::uuid, 'wow');
end $$;
reset role;
do $$
begin
  assert (select count(*) from jsonb_object_keys((select reactions from public.messages where id = current_setting('mr.m2')::uuid))) = 2,
    'TEST FAILED: expected two people reacting to m2';
end $$;

-- C is not in the A-B chat: cannot react
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.c'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.set_message_reaction(current_setting('mr.m1')::uuid, 'like');
    raise exception 'TEST FAILED: non-member reacted';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise exception 'TEST FAILED: non-member expected not_allowed, got %', sqlerrm; end if;
  end;
end $$;
reset role;

-- A clears; B keeps theirs
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.set_message_reaction(current_setting('mr.m2')::uuid, null); end $$;
reset role;
do $$
begin
  assert (select reactions from public.messages where id = current_setting('mr.m2')::uuid) = jsonb_build_object(current_setting('mr.b'), 'haha'),
    'TEST FAILED: after A clears only B''s reaction should remain';
end $$;

-- once B blocks A, nobody can react
insert into public.blocks (blocker_id, blocked_id) values (current_setting('mr.b')::uuid, current_setting('mr.a')::uuid);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.set_message_reaction(current_setting('mr.m2')::uuid, 'like');
    raise exception 'TEST FAILED: reaction allowed despite a block';
  exception when others then
    if sqlerrm <> 'blocked' then raise exception 'TEST FAILED: expected blocked, got %', sqlerrm; end if;
  end;
end $$;
reset role;
delete from public.blocks;

-- deleting a message for everyone clears its reactions (A's own message m1 has B's wow)
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin perform public.delete_message_for_everyone(current_setting('mr.m1')::uuid); end $$;
reset role;
do $$
begin
  assert (select reactions from public.messages where id = current_setting('mr.m1')::uuid) = '{}'::jsonb,
    'TEST FAILED: reactions should be cleared when a message is deleted for everyone';
end $$;

-- and a deleted message cannot be reacted to
select set_config('request.jwt.claims', json_build_object('sub', current_setting('mr.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  begin perform public.set_message_reaction(current_setting('mr.m1')::uuid, 'like');
    raise exception 'TEST FAILED: reacted to a deleted message';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise exception 'TEST FAILED: deleted expected not_allowed, got %', sqlerrm; end if;
  end;
end $$;
reset role;

do $$ begin raise exception 'ALL MESSAGE-REACTION CHECKS PASSED (rolled back)'; end $$;

rollback;
