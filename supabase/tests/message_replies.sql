-- supabase/tests/message_replies.sql
--
-- Regression test for migration 20261012000700_message_replies.sql.
-- Run:  npx.cmd supabase db query --linked --file supabase/tests/message_replies.sql
-- SUCCESS: ends with an error "ALL REPLY CHECKS PASSED (rolled back)".
-- "TEST FAILED ..." means a check failed. Everything is rolled back either way.

begin;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  cab uuid := gen_random_uuid(); cac uuid := gen_random_uuid(); cp uuid := gen_random_uuid();
  m_ok uuid := gen_random_uuid(); m_b uuid := gen_random_uuid(); m_del uuid := gen_random_uuid();
  m_hid uuid := gen_random_uuid(); m_held uuid := gen_random_uuid(); m_other uuid := gen_random_uuid();
  m_pend uuid := gen_random_uuid(); u uuid;
begin
  foreach u in array array[ua, ub, uc] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'reply_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  end loop;
  update public.profiles set onboarded_at = now(), display_name = 'T', username = 't' || substr(id::text, 1, 8)
    where id in (ua, ub, uc);

  insert into public.conversations (id, kind, status, created_by, user_low, user_high) values
    (cab, 'direct', 'accepted', ua, least(ua, ub), greatest(ua, ub)),
    (cac, 'direct', 'accepted', ua, least(ua, uc), greatest(ua, uc)),
    (cp,  'direct', 'pending',  uc, least(uc, ub), greatest(uc, ub));
  insert into public.conversation_members (conversation_id, user_id) values
    (cab, ua), (cab, ub), (cac, ua), (cac, uc), (cp, uc), (cp, ub);

  insert into public.messages (id, conversation_id, sender_id, body) values
    (m_ok, cab, ua, 'hello from A'), (m_b, cab, ub, 'hello from B'), (m_del, cab, ua, 'to be deleted'),
    (m_hid, cab, ub, 'B will hide this'), (m_held, cab, ub, 'held for review'),
    (m_other, cac, ua, 'other conversation'), (m_pend, cp, uc, 'request message');
  update public.messages set mod_status = 'pending' where id = m_held;

  perform set_config('rp.a', ua::text, true); perform set_config('rp.b', ub::text, true);
  perform set_config('rp.c', uc::text, true); perform set_config('rp.cab', cab::text, true);
  perform set_config('rp.cp', cp::text, true);
  perform set_config('rp.ok', m_ok::text, true); perform set_config('rp.mb', m_b::text, true);
  perform set_config('rp.del', m_del::text, true); perform set_config('rp.hid', m_hid::text, true);
  perform set_config('rp.held', m_held::text, true); perform set_config('rp.other', m_other::text, true);
  perform set_config('rp.pend', m_pend::text, true);
end $$;

-- ---- as A: a valid reply, then every invalid target ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rp.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare cab uuid := current_setting('rp.cab')::uuid; rid uuid; t uuid;
begin
  insert into public.messages (conversation_id, body, reply_to_id) values (cab, 'a reply', current_setting('rp.mb')::uuid)
    returning id into rid;
  assert (select reply_to_id from public.messages where id = rid) = current_setting('rp.mb')::uuid,
    'TEST FAILED: reply_to_id not stored';
  -- replying to your own message is fine
  insert into public.messages (conversation_id, body, reply_to_id) values (cab, 'self reply', current_setting('rp.ok')::uuid);

  -- other conversation, nonexistent id, held message
  foreach t in array array[current_setting('rp.other')::uuid, gen_random_uuid(), current_setting('rp.held')::uuid] loop
    begin
      insert into public.messages (conversation_id, body, reply_to_id) values (cab, 'bad', t);
      raise exception 'TEST FAILED: replied to an invalid target %', t;
    exception when others then
      if sqlerrm <> 'bad_reply' then raise exception 'TEST FAILED: expected bad_reply for %, got %', t, sqlerrm; end if;
    end;
  end loop;

  -- deleted for everyone
  perform public.delete_message_for_everyone(current_setting('rp.del')::uuid);
  begin
    insert into public.messages (conversation_id, body, reply_to_id) values (cab, 'bad', current_setting('rp.del')::uuid);
    raise exception 'TEST FAILED: replied to a deleted message';
  exception when others then
    if sqlerrm <> 'bad_reply' then raise exception 'TEST FAILED: deleted target expected bad_reply, got %', sqlerrm; end if;
  end;

  -- the reply cannot be re-pointed afterwards
  begin
    update public.messages set reply_to_id = current_setting('rp.ok')::uuid where id = rid;
    raise exception 'TEST FAILED: reply_to_id was updatable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- as B: cannot reply to a message B hid; a pending recipient still cannot send ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rp.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  perform public.hide_message(current_setting('rp.hid')::uuid);
  begin
    insert into public.messages (conversation_id, body, reply_to_id)
      values (current_setting('rp.cab')::uuid, 'bad', current_setting('rp.hid')::uuid);
    raise exception 'TEST FAILED: replied to a message hidden for me';
  exception when others then
    if sqlerrm <> 'bad_reply' then raise exception 'TEST FAILED: hidden target expected bad_reply, got %', sqlerrm; end if;
  end;
  begin
    insert into public.messages (conversation_id, body, reply_to_id)
      values (current_setting('rp.cp')::uuid, 'bad', current_setting('rp.pend')::uuid);
    raise exception 'TEST FAILED: pending recipient replied';
  exception when others then
    if sqlerrm <> 'request_pending_accept_first' then raise exception 'TEST FAILED: expected request_pending_accept_first, got %', sqlerrm; end if;
  end;
end $$;
reset role;

-- ---- as C (not in the A/B chat): cannot read it, cannot reply into it ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rp.c'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.messages where id = current_setting('rp.ok')::uuid) = 0,
    'TEST FAILED: non-member can read a message';
  begin
    insert into public.messages (conversation_id, body, reply_to_id)
      values (current_setting('rp.cab')::uuid, 'bad', current_setting('rp.ok')::uuid);
    raise exception 'TEST FAILED: non-member replied into a chat';
  exception when others then
    if sqlerrm like 'TEST FAILED%' then raise; end if;
  end;
end $$;
reset role;

-- ---- block: no replies either ----
insert into public.blocks (blocker_id, blocked_id) values (current_setting('rp.b')::uuid, current_setting('rp.a')::uuid);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rp.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    insert into public.messages (conversation_id, body, reply_to_id)
      values (current_setting('rp.cab')::uuid, 'bad', current_setting('rp.mb')::uuid);
    raise exception 'TEST FAILED: replied across a block';
  exception when others then
    if sqlerrm <> 'blocked' then raise exception 'TEST FAILED: expected blocked, got %', sqlerrm; end if;
  end;
end $$;
reset role;
delete from public.blocks;

-- ---- anon cannot insert ----
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
begin
  begin
    insert into public.messages (conversation_id, body, reply_to_id)
      values (current_setting('rp.cab')::uuid, 'bad', current_setting('rp.ok')::uuid);
    raise exception 'TEST FAILED: anon inserted a reply';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- a hard delete of the original clears the pointer but keeps the reply ----
do $$
declare rid uuid := (select id from public.messages where body = 'a reply');
begin
  assert (select reply_to_id from public.messages where id = rid) is not null, 'TEST FAILED: reply lost its pointer';
  delete from public.messages where id = current_setting('rp.mb')::uuid;
  assert (select reply_to_id from public.messages where id = rid) is null,
    'TEST FAILED: hard delete of the original should clear reply_to_id';
  assert exists (select 1 from public.messages where id = rid), 'TEST FAILED: reply vanished with the original';
end $$;

do $$ begin raise exception 'ALL REPLY CHECKS PASSED (rolled back)'; end $$;

rollback;
