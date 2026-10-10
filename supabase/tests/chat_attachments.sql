-- supabase/tests/chat_attachments.sql
--
-- Regression test for migration 20261012000100_chat_attachments.sql.
--
-- HOW TO RUN (after the migration is applied to the target project):
--   npx.cmd supabase db query --linked --file supabase/tests/chat_attachments.sql
--
-- SUCCESS SIGNAL: the run ends with an error whose message starts with
--   "ALL CHAT-ATTACHMENT CHECKS PASSED (rolled back)"
-- (deliberate: it aborts the transaction so nothing persists). A message starting
-- with "TEST FAILED" means a check failed (also rolled back).
--
-- Fixtures: three throwaway onboarded users (A, B, C), an ACCEPTED A-B conversation
-- and a PENDING A-C conversation, and fake storage.objects rows. Never run this
-- against a database you care about without the rollback intact.

begin;

do $$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  cab uuid := gen_random_uuid(); cac uuid := gen_random_uuid();
  u uuid;
begin
  foreach u in array array[ua, ub, uc] loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'chatatt_' || replace(u::text, '-', '') || '@test.pincode.invalid', '', now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  end loop;
  update public.profiles set onboarded_at = now() where id in (ua, ub, uc);

  insert into public.conversations (id, kind, status, created_by, user_low, user_high)
  values (cab, 'direct', 'accepted', ua, least(ua, ub), greatest(ua, ub)),
         (cac, 'direct', 'pending',  ua, least(ua, uc), greatest(ua, uc));
  insert into public.conversation_members (conversation_id, user_id)
  values (cab, ua), (cab, ub), (cac, ua), (cac, uc);

  -- Pretend A already uploaded three files (storage normally does this).
  insert into storage.objects (bucket_id, name, owner_id, metadata) values
    ('chat-attachments', cab || '/' || ua || '/okfile01.jpg',  ua::text, '{"size":1000,"mimetype":"image/jpeg"}'),
    ('chat-attachments', cac || '/' || ua || '/pendfile1.jpg', ua::text, '{"size":1000,"mimetype":"image/jpeg"}'),
    ('chat-attachments', cab || '/' || ua || '/bigfile01.jpg', ua::text, '{"size":9999999,"mimetype":"image/jpeg"}');

  perform set_config('ca.a', ua::text, true);  perform set_config('ca.b', ub::text, true);
  perform set_config('ca.c', uc::text, true);  perform set_config('ca.cab', cab::text, true);
  perform set_config('ca.cac', cac::text, true);
end $$;

-- ---- as A: gate, valid send, rule violations ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ca.a'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare cab text := current_setting('ca.cab'); cac text := current_setting('ca.cac'); ua text := current_setting('ca.a');
        m public.messages;
begin
  assert public.can_attach(cab), 'TEST FAILED: A should be allowed to attach in the accepted A-B conversation';
  assert not public.can_attach(cac), 'TEST FAILED: attaching in a pending conversation must be refused';
  assert not public.can_attach('not-a-uuid'), 'TEST FAILED: malformed conversation id must be refused';

  -- 1. photo-only message works; preview says Photo; mime copied from the object
  insert into public.messages (conversation_id, body, attachment_path, attachment_width, attachment_height)
  values (cab::uuid, '', cab || '/' || ua || '/okfile01.jpg', 800, 600) returning * into m;
  assert m.attachment_mime = 'image/jpeg', 'TEST FAILED: mime should be copied from the stored object';
  assert m.sender_id = ua::uuid, 'TEST FAILED: sender must be forced to the caller';

  -- 2. no text and no photo
  begin
    insert into public.messages (conversation_id, body) values (cab::uuid, '   ');
    raise exception 'TEST FAILED: empty message accepted';
  exception when check_violation then null; end;

  -- 3. photo in a pending request
  begin
    insert into public.messages (conversation_id, body, attachment_path)
    values (cac::uuid, '', cac || '/' || ua || '/pendfile1.jpg');
    raise exception 'TEST FAILED: photo accepted in a pending request';
  exception when others then
    if sqlerrm <> 'attachments_need_accept' then raise exception 'TEST FAILED: pending expected attachments_need_accept, got %', sqlerrm; end if;
  end;

  -- 4. path reuse
  begin
    insert into public.messages (conversation_id, body, attachment_path)
    values (cab::uuid, '', cab || '/' || ua || '/okfile01.jpg');
    raise exception 'TEST FAILED: attachment path reused';
  exception when unique_violation then null; end;

  -- 5. over the size limit
  begin
    insert into public.messages (conversation_id, body, attachment_path)
    values (cab::uuid, '', cab || '/' || ua || '/bigfile01.jpg');
    raise exception 'TEST FAILED: oversized object accepted';
  exception when others then
    if sqlerrm <> 'attachment_too_large' then raise exception 'TEST FAILED: expected attachment_too_large, got %', sqlerrm; end if;
  end;

  -- 6. path that does not exist / wrong shape
  begin
    insert into public.messages (conversation_id, body, attachment_path)
    values (cab::uuid, '', cab || '/' || ua || '/missing01.jpg');
    raise exception 'TEST FAILED: nonexistent object accepted';
  exception when others then
    if sqlerrm <> 'bad_attachment' then raise exception 'TEST FAILED: missing object expected bad_attachment, got %', sqlerrm; end if;
  end;
  begin
    insert into public.messages (conversation_id, body, attachment_path)
    values (cab::uuid, '', '../etc/passwd');
    raise exception 'TEST FAILED: malformed path accepted';
  exception when others then
    if sqlerrm <> 'bad_attachment' then raise exception 'TEST FAILED: malformed path expected bad_attachment, got %', sqlerrm; end if;
  end;
end $$;
reset role;

do $$
begin
  assert (select last_message_preview from public.conversations where id = current_setting('ca.cab')::uuid) = 'Photo',
    'TEST FAILED: conversation preview should read Photo';
end $$;

-- ---- as B (member): another person's path is rejected; B can read the photo ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ca.b'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare cab text := current_setting('ca.cab'); ua text := current_setting('ca.a');
begin
  begin
    insert into public.messages (conversation_id, body, attachment_path)
    values (cab::uuid, '', cab || '/' || ua || '/okfile01.jpg');
    raise exception 'TEST FAILED: B sent a message using A''s upload';
  exception when unique_violation then null;
           when others then
             if sqlerrm <> 'bad_attachment' then raise exception 'TEST FAILED: B reusing A path expected bad_attachment, got %', sqlerrm; end if;
  end;
  assert (select count(*) from storage.objects where bucket_id = 'chat-attachments'
          and name = cab || '/' || ua || '/okfile01.jpg') = 1,
    'TEST FAILED: B (member) should be able to read the photo A sent';
end $$;
reset role;

-- ---- as C (not in the A-B conversation): cannot read it ----
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ca.c'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from storage.objects where bucket_id = 'chat-attachments'
          and name like current_setting('ca.cab') || '/%') = 0,
    'TEST FAILED: C (non-member) can read a private chat photo';
  assert not public.can_attach(current_setting('ca.cab')), 'TEST FAILED: non-member allowed to attach';
end $$;
reset role;

-- ---- block rule: once B blocks A, A may not attach ----
insert into public.blocks (blocker_id, blocked_id) values (current_setting('ca.b')::uuid, current_setting('ca.a')::uuid);
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('ca.a'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  assert not public.can_attach(current_setting('ca.cab')), 'TEST FAILED: attach allowed despite a block';
end $$;
reset role;

-- ---- service-only helpers are closed to normal roles ----
set local role authenticated;
do $$
begin
  begin
    perform public._chat_attachment_paths_for_user(current_setting('ca.a')::uuid);
    raise exception 'TEST FAILED: authenticated could call _chat_attachment_paths_for_user';
  exception when insufficient_privilege then null; end;
  begin
    perform public._expired_chat_attachments(90, 24);
    raise exception 'TEST FAILED: authenticated could call _expired_chat_attachments';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$
begin
  assert (select count(*) from public._chat_attachment_paths_for_user(current_setting('ca.a')::uuid)) >= 3,
    'TEST FAILED: service helper should list A''s files';
end $$;

do $$
begin
  raise exception 'ALL CHAT-ATTACHMENT CHECKS PASSED (rolled back)';
end $$;

rollback;
