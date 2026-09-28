set search_path = public, extensions;
grant usage on schema public to anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;

-- ---------- profiles ----------
create policy profiles_read on profiles for select using (true);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid() and not is_banned()) with check (id = auth.uid());
grant select on profiles to anon, authenticated;
grant update (display_name, bio, avatar_url, interests, home_pincode, home_area, home_city) on profiles to authenticated;

-- ---------- private_profiles ----------
create policy private_read on private_profiles for select to authenticated using (id = auth.uid() or is_admin());
create policy private_update on private_profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant select on private_profiles to authenticated;
grant update (notification_prefs) on private_profiles to authenticated;

-- ---------- blocks ----------
create policy blocks_own_read on blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_own_ins on blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy blocks_own_del on blocks for delete to authenticated using (blocker_id = auth.uid());
grant select, insert, delete on blocks to authenticated;

-- ---------- posts ----------
create policy posts_read on posts for select using (
  (mod_status = 'visible' and not community_removed) or author_id = auth.uid() or is_admin()
  or (community_id is not null and is_community_mod(community_id)));
create policy posts_insert on posts for insert to authenticated with check (author_id = auth.uid() and can_participate());
create policy posts_update on posts for update to authenticated
  using (author_id = auth.uid() and can_participate()) with check (author_id = auth.uid());
create policy posts_delete on posts for delete to authenticated using (author_id = auth.uid() or is_admin());
grant select (id, author_id, community_id, type, kind, tag, title, body, has_phone, lat, lng, location,
  loc_precision, pincode, area, city, starts_at, ends_at, expires_at, status, mod_status, mod_reason,
  community_removed, upvote_count, comment_count, answer_count, first_answer_at, solved_comment_id, solved_at,
  still_on_count, resolved_count, last_confirmed_at, report_count, reaction_counts, has_link, has_phone_text,
  search_tsv, created_at, updated_at) on posts to anon, authenticated;
grant insert (type, kind, tag, title, body, phone_e164, lat, lng, pincode, area, city, starts_at, ends_at, community_id)
  on posts to authenticated;
grant update (title, body, tag, status) on posts to authenticated;
grant delete on posts to authenticated;

-- ---------- comments ----------
create policy comments_read on comments for select using (
  exists (select 1 from posts p where p.id = comments.post_id)
  and (mod_status = 'visible' or author_id = auth.uid() or is_admin()
       or is_community_mod((select community_id from posts where id = comments.post_id))));
create policy comments_insert on comments for insert to authenticated with check (author_id = auth.uid() and can_participate());
create policy comments_update on comments for update to authenticated
  using (author_id = auth.uid() and deleted_at is null and can_participate()) with check (author_id = auth.uid());
grant select on comments to anon, authenticated;
grant insert (post_id, parent_id, body) on comments to authenticated;
grant update (body) on comments to authenticated;

-- ---------- votes / reactions / confirmations (same pattern) ----------
create policy pv_read on post_votes for select to authenticated using (user_id = auth.uid());
create policy pv_ins  on post_votes for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy pv_del  on post_votes for delete to authenticated using (user_id = auth.uid());
-- post_reactions
create policy pr_read on post_reactions for select to authenticated using (user_id = auth.uid());
create policy pr_ins  on post_reactions for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy pr_del  on post_reactions for delete to authenticated using (user_id = auth.uid());
-- comment_votes
create policy cv_read on comment_votes for select to authenticated using (user_id = auth.uid());
create policy cv_ins  on comment_votes for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy cv_del  on comment_votes for delete to authenticated using (user_id = auth.uid());
-- comment_reactions
create policy cr_read on comment_reactions for select to authenticated using (user_id = auth.uid());
create policy cr_ins  on comment_reactions for insert to authenticated with check (user_id = auth.uid() and can_participate());
create policy cr_del  on comment_reactions for delete to authenticated using (user_id = auth.uid());
create policy ac_read on alert_confirmations for select to authenticated using (user_id = auth.uid());
create policy ac_ins  on alert_confirmations for insert to authenticated with check (user_id = auth.uid() and can_participate());
grant select, insert, delete on post_votes, post_reactions, comment_votes, comment_reactions to authenticated;
grant select, insert on alert_confirmations to authenticated;

-- ---------- reputation / badges ----------
create policy rep_read on reputation_events for select to authenticated using (user_id = auth.uid() or is_admin());
create policy badges_read on badges for select using (true);
create policy user_badges_read on user_badges for select using (true);
grant select on reputation_events to authenticated;
grant select on badges, user_badges to anon, authenticated;

-- ---------- notifications / push ----------
create policy notif_read on notifications for select to authenticated using (user_id = auth.uid());
create policy notif_upd  on notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_del  on notifications for delete to authenticated using (user_id = auth.uid());
grant select, delete on notifications to authenticated;
grant update (read_at) on notifications to authenticated;
create policy push_own on push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, delete on push_tokens to authenticated;

-- ---------- messaging ----------
create policy conv_read on conversations for select to authenticated using (is_conversation_member(id));
create policy cm_read on conversation_members for select to authenticated using (is_conversation_member(conversation_id));
create policy cm_upd on conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy msg_read on messages for select to authenticated using (
  (is_conversation_member(conversation_id) and (mod_status = 'visible' or sender_id = auth.uid()))
  or (is_admin() and (exists (select 1 from reports r where (r.target_type = 'message' and r.target_id = messages.id)
                                or r.conversation_id = messages.conversation_id)
                      or exists (select 1 from moderation_queue q where q.target_type = 'message' and q.target_id = messages.id))));
create policy msg_ins on messages for insert to authenticated with check (
  sender_id = auth.uid() and not is_system and can_participate() and is_conversation_member(conversation_id));
grant select on conversations to authenticated;
grant select on conversation_members to authenticated;
grant update (muted, hidden) on conversation_members to authenticated;
grant select on messages to authenticated;
grant insert (conversation_id, body) on messages to authenticated;

-- ---------- communities ----------
create policy comm_read on communities for select using (not is_removed or is_admin());
create policy cmem_read on community_members for select using (true);
create policy cmem_join on community_members for insert to authenticated with check (
  user_id = auth.uid() and role = 'member' and can_participate()
  and not exists (select 1 from community_bans b where b.community_id = community_members.community_id and b.user_id = auth.uid())
  and exists (select 1 from communities c where c.id = community_members.community_id and not c.is_removed));
create policy cmem_leave on community_members for delete to authenticated using (user_id = auth.uid());
create policy cmem_notify on community_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cban_read on community_bans for select to authenticated
  using (user_id = auth.uid() or is_community_mod(community_id));
grant select on communities, community_members to anon, authenticated;
grant insert (community_id, user_id), delete on community_members to authenticated;  -- user_id is pinned to auth.uid() by cmem_join; role is not granted, so it stays the default 'member'
grant update (notify_posts) on community_members to authenticated;
grant select on community_bans to authenticated;

-- ---------- moderation ----------
create policy ft_admin on filter_terms for all to authenticated using (is_admin()) with check (is_admin());
create policy reports_read on reports for select to authenticated using (reporter_id = auth.uid() or is_admin());
create policy mq_admin on moderation_queue for select to authenticated using (is_admin());
create policy strikes_read on strikes for select to authenticated using (user_id = auth.uid() or is_admin());
create policy ma_admin on moderation_actions for select to authenticated using (is_admin());
grant select, insert, update, delete on filter_terms to authenticated;
grant select on reports, moderation_queue, strikes, moderation_actions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- views ----------
grant select on post_cards, comment_cards, community_cards to anon, authenticated;

-- ---------- internal functions: not callable from the API ----------
revoke execute on function public._set_solved(uuid,uuid), public.award_rep(uuid,uuid,text,uuid,int),
  public.revoke_rep(text,uuid,uuid), public.award_badge(uuid,text),
  public.notify(uuid,notification_kind,uuid,text,text,uuid,uuid,uuid,uuid,text),
  public.send_push(uuid,text,text,jsonb), public._system_conversation(uuid), public._send_system_message(uuid,text),
  public.moderate_text(text,text,uuid), public._has_pattern(text,text), public._excerpt(report_target,uuid),
  public._set_mod_status(report_target,uuid,mod_status,text), public._notify_admins(),
  public.handle_new_user(), public.handle_user_email_change()
  from public, anon, authenticated;
