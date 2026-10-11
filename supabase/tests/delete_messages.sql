-- supabase/tests/delete_messages.sql
--
-- Regression test for migration 20261012000400_delete_messages.sql.
-- Run:  npx.cmd supabase db query --linked --file supabase/tests/delete_messages.sql
-- SUCCESS: ends with an error "ALL DELETE-MESSAGE CHECKS PASSED (rolled back)".
-- "TEST FAILED ..." means a check failed. Everything is rolled back either way.

begin;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  cab uuid := gen_random_uuid();
  m_new uuid := gen_random_uuid(); m_old uuid := gen_random_uuid(); m_b uuid := gen_random_uuid();
  m_rep uuid := gen_random_uuid();
  u uuid;
begin
  foreach u in array array[ua, ub, uc] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'delmsg_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  end loop;
  update public.profiles set onboarded_at = now() where id in (ua, ub, uc);

  insert into public.conversations (id, kind, status, created_by, user_low, user_high)
  values (cab, 'direct', 'accepted', ua, least(ua, ub), greatest(ua, ub));
  insert into public.conversation_members (conversation_id, user_id) values (cab, ua), (cab, ub);

  -- Inserted as the session owner (no JWT) so the sender/created_at come from us.
  insert into public.messages (id, conversation_id, sender_id, body) values
    (m_old, cab, ua, 'old message from A'),
    (m_b,   cab, ub, 'message from B'),
    (m_new, cab, ua, 'recent message from A'),
    (m_rep, cab, ua, 'reported message from A');
  -- B reported m_rep: the sender must not be able to wipe the evidence.
  insert into public.reports (reporter_id, target_type, target_id, target_user_id, conversation_id, category)
  values (ub, 'message', m_rep, ua, cab, 'other');
  update public.messages set created_at = now() - interval '25 hours' where id = m_old;
  update public.conversations set last_message_at = (select created_at from public.messages where id = m_new),
         last_message_preview = 'recent message from A', last_sender_id = ua where id = cab;

  perform set_config('dm.a', ua::text, true); perform set_config('dm.b', ub::text, true);
  perform set_config('dm.c', uc::text, true); perform set_config('dm.cab', cab::text, true);
  perform set_config('dm.new', m_new::text, true); perform set_config('dm.old', m_old::text, true);
  perform set_config('dm.mb', m_b::text, true); perform set_config('dm.rep', m_rep::text, true);
end $$;

-- ---- anon cannot call either function ----
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$
begin
  begin perform public.delete_message_for_everyone(current_setting('dm.new')::uuid);
    raise exception 'TEST FAILED: anon delete_message_for_everyone ran';
  exception when insufficient_privilege then null; end;
  begin perform public.hide_message(current_setting('dm.new')::uuid);
    raise exception 'TEST FAILED: anon hide_message ran';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- as A: delete for everyone rules ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('dm.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  -- not your message
  begin perform public.delete_message_for_everyone(current_setting('dm.mb')::uuid);
    raise exception 'TEST FAILED: deleted someone else''s message for everyone';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise exception 'TEST FAILED: expected not_allowed, got %', sqlerrm; end if;
  end;
  -- older than 24 h
  begin perform public.delete_message_for_everyone(current_setting('dm.old')::uuid);
    raise exception 'TEST FAILED: deleted a 25 h old message for everyone';
  exception when others then
    if sqlerrm <> 'delete_window_passed' then raise exception 'TEST FAILED: expected delete_window_passed, got %', sqlerrm; end if;
  end;
  -- reported message: evidence stays
  begin perform public.delete_message_for_everyone(current_setting('dm.rep')::uuid);
    raise exception 'TEST FAILED: deleted a reported message for everyone';
  exception when others then
    if sqlerrm <> 'under_review' then raise exception 'TEST FAILED: expected under_review, got %', sqlerrm; end if;
  end;
  -- recent own message: works
  perform public.delete_message_for_everyone(current_setting('dm.new')::uuid);
  -- idempotent
  perform public.delete_message_for_everyone(current_setting('dm.new')::uuid);
end $$;
reset role;

do $$
declare m public.messages;
begin
  select * into m from public.messages where id = current_setting('dm.new')::uuid;
  assert m.deleted_at is not null, 'TEST FAILED: deleted_at not set';
  assert m.body = '' and m.attachment_path is null, 'TEST FAILED: content not cleared';
  assert (select last_message_preview from public.conversations where id = current_setting('dm.cab')::uuid) = 'This message was deleted',
    'TEST FAILED: inbox preview still shows the deleted text';
  assert (select body from public.messages where id = current_setting('dm.rep')::uuid) = 'reported message from A',
    'TEST FAILED: reported message content was altered';
  assert (select body from public.messages where id = current_setting('dm.old')::uuid) = 'old message from A',
    'TEST FAILED: the 25 h old message was altered';
end $$;

-- ---- as B: cannot delete A's message for everyone; delete for me hides only for B ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('dm.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin perform public.delete_message_for_everyone(current_setting('dm.old')::uuid);
    raise exception 'TEST FAILED: B deleted A''s message for everyone';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise exception 'TEST FAILED: B expected not_allowed, got %', sqlerrm; end if;
  end;
  assert (select count(*) from public.messages where id = current_setting('dm.old')::uuid) = 1,
    'TEST FAILED: B should see the old message before hiding it';
  perform public.hide_message(current_setting('dm.old')::uuid);
  assert (select count(*) from public.messages where id = current_setting('dm.old')::uuid) = 0,
    'TEST FAILED: hidden message still visible to B';
  perform public.hide_message(current_setting('dm.old')::uuid);   -- idempotent
end $$;
reset role;

-- ---- as A: still sees the message B hid ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('dm.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from public.messages where id = current_setting('dm.old')::uuid) = 1,
    'TEST FAILED: B hiding a message must not hide it for A';
end $$;
reset role;

-- ---- as C (not in the conversation): cannot hide ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('dm.c'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin perform public.hide_message(current_setting('dm.old')::uuid);
    raise exception 'TEST FAILED: non-member hid a message';
  exception when others then
    if sqlerrm <> 'not_allowed' then raise exception 'TEST FAILED: C expected not_allowed, got %', sqlerrm; end if;
  end;
  -- and cannot touch the hide table directly
  begin perform count(*) from public.message_hides;
    raise exception 'TEST FAILED: authenticated can read message_hides directly';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin raise exception 'ALL DELETE-MESSAGE CHECKS PASSED (rolled back)'; end $$;

rollback;
