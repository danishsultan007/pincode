-- supabase/tests/read_receipts.sql
--
-- Regression test for migration 20261012000800_read_receipts.sql.
-- Run:  npx.cmd supabase db query --linked --file supabase/tests/read_receipts.sql
-- SUCCESS: ends with an error "ALL RECEIPT CHECKS PASSED (rolled back)".
-- "TEST FAILED ..." means a check failed. Everything is rolled back either way.

begin;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  cab uuid := gen_random_uuid(); cp uuid := gen_random_uuid();
  u uuid;
begin
  foreach u in array array[ua, ub, uc] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'rcpt_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  end loop;
  update public.profiles set onboarded_at = now(), display_name = 'T', username = 't' || substr(id::text, 1, 8)
    where id in (ua, ub, uc);

  insert into public.conversations (id, kind, status, created_by, user_low, user_high) values
    (cab, 'direct', 'accepted', ua, least(ua, ub), greatest(ua, ub)),
    (cp,  'direct', 'pending',  uc, least(uc, ub), greatest(uc, ub));
  insert into public.conversation_members (conversation_id, user_id) values
    (cab, ua), (cab, ub), (cp, uc), (cp, ub);

  -- A -> B (an hour ago), and a request message C -> B in the pending chat
  insert into public.messages (conversation_id, sender_id, body, created_at)
    values (cab, ua, 'first from A', now() - interval '2 hours');
  insert into public.messages (conversation_id, sender_id, body, created_at)
    values (cp, uc, 'request from C', now() - interval '1 hour');

  perform set_config('rc.a', ua::text, true); perform set_config('rc.b', ub::text, true);
  perform set_config('rc.c', uc::text, true); perform set_config('rc.cab', cab::text, true);
  perform set_config('rc.cp', cp::text, true);
end $$;

-- ---- nobody has delivered/read anything yet ----
do $$ begin
  assert (select count(*) from public.conversation_receipts where conversation_id = current_setting('rc.cab')::uuid) = 0,
    'TEST FAILED: receipts exist before anyone synced';
end $$;

-- ---- anon cannot run the functions ----
select set_config('request.jwt.claims', '{}', true);
set local role anon;
do $$ begin
  begin perform public.mark_chats_delivered();
    raise exception 'TEST FAILED: anon ran mark_chats_delivered';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- B's app syncs: delivered (not read) ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r public.conversation_receipts; t1 timestamptz;
begin
  perform public.mark_chats_delivered();
  select * into r from public.conversation_receipts where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid;
  assert r.delivered_at is not null and r.read_at is null, 'TEST FAILED: expected delivered but not read';
  assert r.delivered_at = (select last_message_at from public.conversations where id = current_setting('rc.cab')::uuid),
    'TEST FAILED: delivered_at should equal the newest message time';
  t1 := r.delivered_at;
  perform public.mark_chats_delivered();   -- idempotent
  assert (select delivered_at from public.conversation_receipts where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid) = t1,
    'TEST FAILED: repeat sync changed the value';
  -- the pending request chat gets no receipt
  assert not exists (select 1 from public.conversation_receipts where conversation_id = current_setting('rc.cp')::uuid),
    'TEST FAILED: a pending request got a receipt';
  -- B sees only their own membership row
  assert (select count(*) from public.conversation_members where conversation_id = current_setting('rc.cab')::uuid) = 1,
    'TEST FAILED: B can read the other member''s row';
  -- receipts cannot be written directly
  begin
    update public.conversation_receipts set read_at = now() where conversation_id = current_setting('rc.cab')::uuid;
    raise exception 'TEST FAILED: receipts were updatable';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.conversation_receipts (conversation_id, user_id, read_at)
      values (current_setting('rc.cab')::uuid, current_setting('rc.a')::uuid, now());
    raise exception 'TEST FAILED: receipts were insertable';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ---- A sees B's receipt, and still sees only their own membership row ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  assert (select delivered_at from public.conversation_receipts
           where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid) is not null,
    'TEST FAILED: A cannot see B''s receipt';
  assert (select count(*) from public.conversation_members where conversation_id = current_setting('rc.cab')::uuid) = 1,
    'TEST FAILED: A can read the other member''s row';
end $$;
reset role;

-- ---- C (not in the chat) sees nothing ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.c'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.conversation_receipts where conversation_id = current_setting('rc.cab')::uuid) = 0,
    'TEST FAILED: a non-member can read receipts';
end $$;
reset role;

-- ---- B opens the chat: read ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.mark_conversation_read(current_setting('rc.cab')::uuid);
  assert (select read_at from public.conversation_receipts
           where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid)
       = (select last_message_at from public.conversations where id = current_setting('rc.cab')::uuid),
    'TEST FAILED: read_at not set by mark_conversation_read';
  -- a pending chat: reading it never creates a receipt
  perform public.mark_conversation_read(current_setting('rc.cp')::uuid);
  assert not exists (select 1 from public.conversation_receipts where conversation_id = current_setting('rc.cp')::uuid),
    'TEST FAILED: reading a pending request created a receipt';
end $$;
reset role;

-- ---- B replied after A's message: A's message must still become read when B opens the chat ----
select set_config('request.jwt.claims', '{}', true);
insert into public.messages (conversation_id, sender_id, body, created_at)
  values (current_setting('rc.cab')::uuid, current_setting('rc.a')::uuid, 'A before B replies', now() - interval '90 minutes');
insert into public.messages (conversation_id, sender_id, body, created_at)
  values (current_setting('rc.cab')::uuid, current_setting('rc.b')::uuid, 'B replies quickly', now() - interval '80 minutes');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.mark_conversation_read(current_setting('rc.cab')::uuid);
  assert (select read_at from public.conversation_receipts
           where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid)
       >= (select created_at from public.messages where body = 'A before B replies'),
    'TEST FAILED: A''s message was skipped because B replied after it';
end $$;
reset role;

-- ---- B turns read receipts off: a newer message becomes delivered but NOT read ----
select set_config('request.jwt.claims', '{}', true);   -- act as the table owner, not as B
update public.private_profiles set read_receipts = false where id = current_setting('rc.b')::uuid;
insert into public.messages (conversation_id, sender_id, body, created_at)
  values (current_setting('rc.cab')::uuid, current_setting('rc.a')::uuid, 'second from A', now() - interval '1 hour');
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare r public.conversation_receipts; newest timestamptz;
begin
  select last_message_at into newest from public.conversations where id = current_setting('rc.cab')::uuid;
  perform public.mark_conversation_read(current_setting('rc.cab')::uuid);
  select * into r from public.conversation_receipts where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid;
  assert r.delivered_at = newest, 'TEST FAILED: delivered_at should still move with receipts off';
  assert r.read_at < newest, 'TEST FAILED: read_at moved although read receipts are off';
end $$;
reset role;

-- ---- a user can change only their own switch ----
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  update public.private_profiles set read_receipts = true where id = current_setting('rc.b')::uuid;
  update public.private_profiles set read_receipts = false where id = current_setting('rc.a')::uuid;
  assert (select read_receipts from public.private_profiles where id = current_setting('rc.b')::uuid) = true,
    'TEST FAILED: could not change own read_receipts';
end $$;
reset role;

-- ---- blocked: no new delivery marks ----
select set_config('request.jwt.claims', '{}', true);
insert into public.messages (conversation_id, sender_id, body, created_at)
  values (current_setting('rc.cab')::uuid, current_setting('rc.a')::uuid, 'third from A', now() - interval '30 minutes');
select set_config('request.jwt.claims', '{}', true);
insert into public.blocks (blocker_id, blocked_id) values (current_setting('rc.b')::uuid, current_setting('rc.a')::uuid);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('rc.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare before_ts timestamptz;
begin
  select delivered_at into before_ts from public.conversation_receipts
   where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid;
  perform public.mark_chats_delivered();
  assert (select delivered_at from public.conversation_receipts
           where conversation_id = current_setting('rc.cab')::uuid and user_id = current_setting('rc.b')::uuid) = before_ts,
    'TEST FAILED: delivery was marked across a block';
end $$;
reset role;
delete from public.blocks;

do $$ begin raise exception 'ALL RECEIPT CHECKS PASSED (rolled back)'; end $$;

rollback;
