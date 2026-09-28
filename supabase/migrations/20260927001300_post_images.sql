set search_path = public, extensions;

-- ---------- Post images/GIFs ----------
-- One optional image (or animated GIF, stored the same way — the bucket's
-- allowed_mime_types below includes image/gif) per post. Kept to a single
-- image for v1, matching the plan's minimalist scope; a post_images join
-- table for multiple images is a natural v2 extension if needed.

alter table public.posts add column if not exists image_url text
  check (image_url is null or char_length(image_url) <= 2048);

-- post_cards is `security_invoker`, so the caller's own SELECT grant on
-- posts.image_url (below) is what actually lets this column through, not
-- this view definition by itself. create or replace view can only append a
-- column at the end without dropping the view — inserting it in the middle
-- of the original column list isn't possible without a drop, which isn't
-- worth the churn for one column.
create or replace view public.post_cards with (security_invoker = true) as
select p.id, p.author_id, p.community_id, p.type, p.kind, p.tag, p.title, p.body, p.has_phone,
       p.lat, p.lng, p.loc_precision, p.pincode, p.area, p.city, p.starts_at, p.ends_at, p.expires_at,
       p.status, p.mod_status, p.community_removed, p.upvote_count, p.comment_count, p.answer_count,
       p.first_answer_at, p.solved_comment_id, p.solved_at, p.still_on_count, p.resolved_count,
       p.last_confirmed_at, p.reaction_counts, p.created_at, p.updated_at,
       (p.expires_at < now()) as is_expired,
       a.username::text as author_username, a.display_name as author_display_name,
       a.avatar_url as author_avatar_url, a.reputation as author_reputation,
       c.slug::text as community_slug, c.name as community_name,
       exists (select 1 from public.post_votes v where v.post_id = p.id and v.user_id = auth.uid()) as my_vote,
       array(select r.reaction from public.post_reactions r where r.post_id = p.id and r.user_id = auth.uid()) as my_reactions,
       (select ac.kind from public.alert_confirmations ac where ac.post_id = p.id and ac.user_id = auth.uid()) as my_confirmation,
       p.image_url
from public.posts p
join public.profiles a on a.id = p.author_id
left join public.communities c on c.id = p.community_id;

-- Supplementary grants (posts' original select/insert/update grants live in
-- 20260927001100_rls_grants.sql and are left untouched; a GRANT only adds
-- privilege, so issuing another one here for just this column is safe and
-- doesn't need to repeat the full column list).
grant select (image_url) on posts to anon, authenticated;
grant insert (image_url) on posts to authenticated;
grant update (image_url) on posts to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do nothing;
create policy "post-images public read" on storage.objects for select using (bucket_id = 'post-images');
create policy "post-images owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post-images owner update" on storage.objects for update to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "post-images owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
