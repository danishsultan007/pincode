-- Retention clean-up now also covers photos on messages a moderator removed.
-- The clean-up job (Edge Function, runs daily) deletes the files through the
-- Storage API; this only widens which files it is told about.

set search_path = public, extensions;

create or replace function public._expired_chat_attachments(p_days int default 90, p_orphan_hours int default 24)
returns setof text
language sql stable security definer set search_path = public, extensions, storage as $$
  select o.name
    from storage.objects o
   where o.bucket_id = 'chat-attachments'
     and (o.created_at < now() - make_interval(days => p_days)
          or (o.created_at < now() - make_interval(hours => p_orphan_hours)
              and not exists (select 1 from public.messages m where m.attachment_path = o.name))
          or exists (select 1 from public.messages m
                      where m.attachment_path = o.name and m.mod_status = 'removed')) $$;

revoke execute on function public._expired_chat_attachments(int, int) from public, anon, authenticated;
grant execute on function public._expired_chat_attachments(int, int) to service_role;
