-- supabase/tests/smoke.sql — run in the SQL editor AFTER migrations + seed.sql.
-- Wrapped in begin; ... rollback; so nothing here persists.
-- User ids below are the seed.sql fixed ids:
--   Priya    = 00000000-0000-4000-8000-000000000001
--   Kavitha  = 00000000-0000-4000-8000-000000000002
--   Rohan    = 00000000-0000-4000-8000-000000000003
--   Anjali   = 00000000-0000-4000-8000-000000000004
--   Lakshmi  = 00000000-0000-4000-8000-000000000005
--   Kiran    = 00000000-0000-4000-8000-000000000030

begin;

-- 1. Nearby feed returns at least 8 posts around Mahadevapura.
do $$ begin
  assert (select count(*) from posts_near(12.9915, 77.6944, 10)) >= 8,
    'posts_near(12.9915,77.6944,10) returned fewer than 8 rows';
end $$;

-- 2. Username availability.
do $$ begin
  assert username_available('priya_hoodi') = false, 'priya_hoodi should already be taken';
  assert username_available('fresh_name_77') = true, 'fresh_name_77 should be available';
end $$;

-- 3. Username suggestions.
do $$ begin
  assert (select count(*) from suggest_usernames('hoodi', 5)) = 5,
    'suggest_usernames(''hoodi'', 5) should return exactly 5 names';
end $$;

-- 4. Self-vote is rejected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$ begin
  begin
    insert into post_votes(post_id, user_id)
    values ('00000000-0000-4000-9000-000000000101', '00000000-0000-4000-8000-000000000001');
    assert false, 'self-vote should have raised self_vote';
  exception when others then
    assert sqlerrm = 'self_vote', 'expected self_vote, got: ' || sqlerrm;
  end;
end $$;
reset role;

-- 5. Content filter holds an obvious scam comment for review.
-- moderation_queue's own SELECT policy (mq_admin) only lets admins read it,
-- so the exists() check below runs after `reset role` (back to this
-- session's superuser/owner context, which bypasses RLS) rather than as the
-- non-admin seed user who wrote the comment — otherwise the row would be
-- genuinely there but invisible to the check, a false failure.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
do $$
declare v_id uuid;
begin
  insert into comments(post_id, body)
  values ('00000000-0000-4000-9000-000000000102', 'Congrats, you have won a lottery! Contact me for details.')
  returning id into v_id;
  assert (select mod_status from comments where id = v_id) = 'pending',
    'comment with lottery scam text should be pending';
  perform set_config('pincode.test_comment_id', v_id::text, true);
end $$;
reset role;
do $$
declare v_id uuid := current_setting('pincode.test_comment_id')::uuid;
begin
  assert exists (select 1 from moderation_queue where target_type = 'comment' and target_id = v_id and status = 'open'),
    'a moderation_queue row should have been created';
end $$;

-- 6. A second message in a pending conversation is rejected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
do $$
declare v_conv uuid;
begin
  v_conv := start_conversation('00000000-0000-4000-8000-000000000005');
  insert into messages(conversation_id, body) values (v_conv, 'Hi, are you still offering house help?');
  begin
    insert into messages(conversation_id, body) values (v_conv, 'Just checking in again.');
    assert false, 'second message in a pending conversation should have raised request_pending';
  exception when others then
    assert sqlerrm = 'request_pending', 'expected request_pending, got: ' || sqlerrm;
  end;
end $$;
reset role;

-- 7. A banned user cannot insert a post (RLS, not just the trigger layer).
update profiles set banned_until = now() + interval '1 day' where id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
do $$ begin
  begin
    insert into posts(type, kind, tag, title, body, lat, lng, pincode, area, city)
    values ('ask', 'request', 'cook', 'Test post while banned', 'Should never be inserted.',
            12.99, 77.70, '560048', 'Hoodi', 'Bengaluru');
    assert false, 'banned user post insert should have failed RLS';
  exception when others then
    assert sqlerrm ilike '%row-level security%', 'expected an RLS violation, got: ' || sqlerrm;
  end;
end $$;
reset role;
update profiles set banned_until = null where id = '00000000-0000-4000-8000-000000000002';

-- 8. Community-creation eligibility.
update profiles set reputation = 150 where id = '00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := can_create_community();
  assert (r->>'allowed')::boolean = true, 'Priya should be eligible to create a community: ' || r::text;
end $$;
reset role;

update profiles set reputation = 0, created_at = now() - interval '1 day'
  where id = '00000000-0000-4000-8000-000000000030';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000030","role":"authenticated"}', true);
do $$
declare r jsonb;
begin
  r := can_create_community();
  assert (r->>'allowed')::boolean = false, 'a fresh, low-reputation user should not be eligible: ' || r::text;
end $$;
reset role;

-- 9. Search ranks the on-topic, nearby post first.
do $$
declare first_id uuid;
begin
  select id into first_id from search_posts('carpenter', 12.9915, 77.6944) limit 1;
  assert first_id = '00000000-0000-4000-9000-000000000103', 'expected seed-mdp-03 first, got: ' || first_id;
end $$;

-- 10. Search still finds an expired-but-relevant Ask.
do $$
declare first_id uuid;
begin
  select id into first_id from search_posts('plumber', 12.9260, 77.6762) limit 1;
  assert first_id = '00000000-0000-4000-9000-000000000105', 'expected seed-mdp-05 first, got: ' || first_id;
end $$;

rollback;
