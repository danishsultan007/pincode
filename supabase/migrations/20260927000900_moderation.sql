set search_path = public, extensions;
create type public.report_target as enum ('post','comment','user','message','community');
create type public.report_category as enum ('impersonation','illegal','scam','harassment','spam','other');

create table public.filter_terms (
  id bigint generated always as identity primary key,
  pattern text not null,                     -- Postgres ARE regex, matched case-insensitively (~*)
  category text not null check (category in ('slur','abuse','scam','spam','url','phone')),
  action text not null check (action in ('flag','block')),
  scopes text[] not null default '{post,comment,message,profile,community}',
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type public.report_target not null,
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  category public.report_category not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references public.profiles(id) on delete set null,
  unique (reporter_id, target_type, target_id)
);
create table public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target not null,
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  source text not null check (source in ('filter','reports','admin')),
  reasons text[] not null default '{}',
  excerpt text,
  report_count int not null default 0,
  status text not null default 'open' check (status in ('open','resolved')),
  resolution text check (resolution in ('restored','removed','dismissed')),
  strike_id uuid,
  created_at timestamptz not null default now(),
  resolved_at timestamptz, resolved_by uuid references public.profiles(id) on delete set null
);
create unique index moderation_queue_open_uniq on public.moderation_queue (target_type, target_id) where status = 'open';
create index moderation_queue_status_idx on public.moderation_queue (status, created_at desc);
create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  issued_by uuid references public.profiles(id) on delete set null,
  queue_id uuid references public.moderation_queue(id) on delete set null,
  reason text not null,
  category public.report_category not null,
  severe boolean not null default false,
  action text not null check (action in ('warning','final_warning','suspension_7d','permanent_ban')),
  created_at timestamptz not null default now()
);
create table public.moderation_actions (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text, target_id uuid, target_user_id uuid, note text,
  created_at timestamptz not null default now()
);
alter table public.filter_terms enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_queue enable row level security;
alter table public.strikes enable row level security;
alter table public.moderation_actions enable row level security;

insert into public.filter_terms(pattern, category, action, scopes, note) values
 ('(\+?91[\s-]?)?[6-9][0-9]{4}[\s-]?[0-9]{5}', 'phone', 'flag', '{post,comment,message}', 'Indian mobile number; flag only on velocity/new-request rules'),
 ('(https?://|www\.)\S+|\m[a-z0-9-]+\.(com|in|net|org|info|xyz|top|link|ly|io|app|site|online|click)\M', 'url', 'flag', '{post,comment,message,community}', 'Links: flagged for new/low-rep accounts and message requests'),
 ('\m(otp|kyc|cvv|upi pin)\M', 'scam', 'flag', '{post,comment,message}', 'Credential phishing'),
 ('\m(lottery|jackpot|you have won|prize money|lucky draw winner)\M', 'scam', 'flag', '{post,comment,message}', null),
 ('\m(registration|processing|security) (fee|deposit)\M', 'scam', 'flag', '{post,comment,message}', 'Job scam pattern'),
 ('\m(work from home|part[ -]?time job)\M.*\m(earn|income|per day|daily)\M', 'scam', 'flag', '{post,comment,message}', null),
 ('\mguaranteed (returns|profit|income)\M|\m(crypto|bitcoin|forex|trading) (tips|signals)\M', 'scam', 'flag', '{post,comment,message}', null),
 ('t\.me/|telegram\.me/', 'scam', 'flag', '{post,comment,message}', null),
 ('(.)\1{9,}', 'spam', 'flag', '{post,comment,message}', '10+ repeated characters'),
 ('\m(buy now|limited offer|click here|dm for price|100% free)\M', 'spam', 'flag', '{post,comment,message}', null),
 ('\mf+u+c+k+(ing|er|ed)?\M|\mmotherf\w*|\mbitch(es)?\M|\mbastard\M|\masshole\M', 'abuse', 'flag', '{post,comment,message,profile,community}', 'English profanity: hold for review'),
 ('\m(madarchod|behenchod|bhenchod|bhosdi\w*|chutiya|randi|gaandu)\M', 'abuse', 'block', '{post,comment,message,profile,community}', 'Hindi abuse'),
 ('\mn[i1]gg(er|a)s?\M|\mfaggots?\M|\mchamar\M|\mbhangi\M', 'slur', 'block', '{post,comment,message,profile,community}', 'Slurs incl. caste slurs; extend via admin Filters screen');

create or replace function public._has_pattern(p_text text, p_category text) returns boolean language sql stable
security definer set search_path = public, extensions as $$
  select exists (select 1 from filter_terms where active and category = p_category and p_text ~* pattern) $$;

-- scope: 'post' | 'comment' | 'message' | 'message_request' | 'profile' | 'community'
create or replace function public.moderate_text(p_text text, p_scope text, p_author uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare t record; reasons text[] := '{}'; v_block boolean := false; v_flag boolean := false;
        v_age interval; v_rep int; v_recent int; v_scope text := case when p_scope = 'message_request' then 'message' else p_scope end;
begin
  if coalesce(p_text,'') = '' then return jsonb_build_object('action','allow','reasons','[]'::jsonb); end if;
  select now() - created_at, reputation into v_age, v_rep from profiles where id = p_author;
  for t in select * from filter_terms where active and v_scope = any(scopes) loop
    if p_text ~* t.pattern then
      if t.category = 'url' then
        if p_scope = 'message_request' or v_age < interval '7 days' or coalesce(v_rep,0) < 20 then
          v_flag := true; reasons := array_append(reasons, 'link_from_new_account'); end if;
      elsif t.category = 'phone' then
        if p_scope = 'message' then continue; end if;
        if p_scope = 'message_request' then v_flag := true; reasons := array_append(reasons, 'phone_in_request'); continue; end if;
        select (select count(*) from posts where author_id = p_author and has_phone_text and created_at > now() - interval '24 hours')
             + (select count(*) from comments where author_id = p_author and has_phone_text and created_at > now() - interval '24 hours')
          into v_recent;
        if v_recent >= 3 then v_flag := true; reasons := array_append(reasons, 'phone_spam'); end if;
      elsif t.action = 'block' then v_block := true; reasons := array_append(reasons, t.category);
      else v_flag := true; reasons := array_append(reasons, t.category); end if;
    end if;
  end loop;
  return jsonb_build_object('action', case when v_block then 'block' when v_flag then 'flag' else 'allow' end,
                            'reasons', to_jsonb(reasons));
end $$;

-- ---------- t20 content-filter BEFORE triggers ----------

create or replace function public.posts_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare txt text; r jsonb;
begin
  txt := coalesce(new.title,'') || E'\n' || coalesce(new.body,'');
  new.has_phone_text := public._has_pattern(txt, 'phone');
  new.has_link := public._has_pattern(txt, 'url');
  if auth.uid() is null then return new; end if;
  r := public.moderate_text(txt, 'post', new.author_id);
  if r->>'action' = 'block' then raise exception 'content_blocked'; end if;
  if r->>'action' = 'flag' then
    new.mod_status := 'pending';
    new.mod_reason := 'auto: ' || array_to_string(array(select jsonb_array_elements_text(r->'reasons')), ',');
  end if;
  return new;
end $$;
create trigger t20_posts_filter before insert or update of title, body on public.posts
  for each row execute function public.posts_filter();

create or replace function public.comments_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  new.has_phone_text := public._has_pattern(new.body, 'phone');
  new.has_link := public._has_pattern(new.body, 'url');
  if auth.uid() is null then return new; end if;
  if tg_op = 'UPDATE' and new.body = '[deleted]' then return new; end if;
  r := public.moderate_text(new.body, 'comment', new.author_id);
  if r->>'action' = 'block' then raise exception 'content_blocked'; end if;
  if r->>'action' = 'flag' then
    new.mod_status := 'pending';
    new.mod_reason := 'auto: ' || array_to_string(array(select jsonb_array_elements_text(r->'reasons')), ',');
  end if;
  return new;
end $$;
create trigger t20_comments_filter before insert or update of body on public.comments
  for each row execute function public.comments_filter();

create or replace function public.messages_filter() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare r jsonb; v_scope text; v_status conversation_status;
begin
  new.has_phone_text := public._has_pattern(new.body, 'phone');
  new.has_link := public._has_pattern(new.body, 'url');
  if new.is_system or auth.uid() is null then return new; end if;
  select status into v_status from conversations where id = new.conversation_id;
  v_scope := case when v_status = 'pending' then 'message_request' else 'message' end;
  r := public.moderate_text(new.body, v_scope, new.sender_id);
  if r->>'action' = 'block' then raise exception 'content_blocked'; end if;
  if r->>'action' = 'flag' then
    new.mod_status := 'pending';
    new.mod_reason := 'auto: ' || array_to_string(array(select jsonb_array_elements_text(r->'reasons')), ',');
  end if;
  return new;
end $$;
create trigger t20_messages_filter before insert on public.messages
  for each row execute function public.messages_filter();

-- ---------- t70 enqueue AFTER triggers ----------

create or replace function public._notify_admins() returns void language plpgsql
security definer set search_path = public, extensions as $$
begin
  insert into notifications(user_id, kind, title, body, data)
  select p.id, 'mod_queue', 'New item in the moderation queue', '', jsonb_build_object('url','/admin')
  from profiles p
  where p.role = 'admin'
    and not exists (select 1 from notifications n where n.user_id = p.id and n.kind = 'mod_queue'
                    and n.created_at > now() - interval '10 minutes');
end $$;

create or replace function public.enqueue_if_pending() returns trigger language plpgsql
security definer set search_path = public, extensions as $$
declare v_type text := tg_argv[0]; v_author uuid; v_excerpt text; v_source text; v_url text; v_reasons text[];
begin
  if new.mod_status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.mod_status = 'pending' then return new; end if;
  v_author := nullif(to_jsonb(new)->>'author_id','')::uuid;
  if v_author is null then v_author := nullif(to_jsonb(new)->>'sender_id','')::uuid; end if;
  v_excerpt := left(coalesce(to_jsonb(new)->>'title','') || ' ' || coalesce(to_jsonb(new)->>'body',''), 280);
  v_source := case when new.mod_reason like 'auto:%' then 'filter' else 'reports' end;
  v_reasons := case when new.mod_reason like 'auto:%' then string_to_array(substring(new.mod_reason from 7), ',')
                     else '{}'::text[] end;
  v_url := case v_type
    when 'post' then '/post/' || new.id
    when 'comment' then '/post/' || (to_jsonb(new)->>'post_id') || '?comment=' || new.id
    when 'message' then '/chat/' || (to_jsonb(new)->>'conversation_id')
    else null end;
  insert into moderation_queue(target_type, target_id, target_user_id, source, reasons, excerpt)
  values (v_type::report_target, new.id, v_author, v_source, v_reasons, v_excerpt)
  on conflict (target_type, target_id) where status = 'open' do update
    set reasons = moderation_queue.reasons || excluded.reasons;
  perform public.notify(v_author, 'content_held', null,
    'Your ' || v_type || ' is being reviewed',
    'It is hidden while the pincode Team takes a look, usually within a day.',
    case when v_type = 'post' then new.id when v_type = 'comment' then (to_jsonb(new)->>'post_id')::uuid else null end,
    case when v_type = 'comment' then new.id else null end,
    null,
    case when v_type = 'message' then (to_jsonb(new)->>'conversation_id')::uuid else null end,
    v_url);
  perform public._notify_admins();
  return new;
end $$;
create trigger t70_posts_enqueue after insert or update of mod_status on public.posts
  for each row execute function public.enqueue_if_pending('post');
create trigger t70_comments_enqueue after insert or update of mod_status on public.comments
  for each row execute function public.enqueue_if_pending('comment');
create trigger t70_messages_enqueue after insert or update of mod_status on public.messages
  for each row execute function public.enqueue_if_pending('message');

-- ---------- RPCs ----------

create or replace function public.submit_report(p_target_type public.report_target, p_target_id uuid,
  p_category public.report_category, p_details text default null, p_conversation_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); v_user uuid; v_id uuid; v_distinct int; n int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select count(*) into n from reports where reporter_id = uid and created_at > now() - interval '24 hours';
  if n >= 20 then raise exception 'rate_limited_reports'; end if;
  v_user := case p_target_type
    when 'post'      then (select author_id from posts where id = p_target_id)
    when 'comment'   then (select author_id from comments where id = p_target_id)
    when 'message'   then (select sender_id from messages m where m.id = p_target_id and public.is_conversation_member(m.conversation_id))
    when 'user'      then (select id from profiles where id = p_target_id)
    when 'community' then (select owner_id from communities where id = p_target_id) end;
  if v_user is null and p_target_type <> 'community' then raise exception 'not_found'; end if;
  if v_user = uid then raise exception 'cannot_report_self'; end if;
  if p_target_type = 'message' then p_conversation_id := (select conversation_id from messages where id = p_target_id); end if;
  insert into reports(reporter_id, target_type, target_id, target_user_id, conversation_id, category, details)
  values (uid, p_target_type, p_target_id, v_user, p_conversation_id, p_category, left(p_details, 1000))
  on conflict (reporter_id, target_type, target_id) do nothing returning id into v_id;
  if v_id is null then raise exception 'already_reported'; end if;
  insert into moderation_queue(target_type, target_id, target_user_id, source, reasons, excerpt, report_count)
  values (p_target_type, p_target_id, v_user, 'reports', array[p_category::text], public._excerpt(p_target_type, p_target_id), 1)
  on conflict (target_type, target_id) where status = 'open' do update
    set report_count = moderation_queue.report_count + 1,
        reasons = case when p_category::text = any(moderation_queue.reasons) then moderation_queue.reasons
                       else moderation_queue.reasons || p_category::text end;
  if p_target_type in ('post','comment','message') then
    select count(distinct reporter_id) into v_distinct from reports
     where target_type = p_target_type and target_id = p_target_id and status = 'open';
    if v_distinct >= 3 or (p_category = 'illegal' and v_distinct >= 2) then
      perform public._set_mod_status(p_target_type, p_target_id, 'pending', 'reports');
    end if;
    if p_target_type = 'post' then update posts set report_count = report_count + 1 where id = p_target_id; end if;
  end if;
  perform public._notify_admins();
  return v_id;
end $$;

create or replace function public._excerpt(p_type public.report_target, p_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case p_type
    when 'post' then (select left(coalesce(title,'') || ' ' || coalesce(body,''), 280) from posts where id = p_id)
    when 'comment' then (select left(body, 280) from comments where id = p_id)
    when 'message' then (select left(body, 280) from messages where id = p_id)
    when 'user' then (select left(coalesce(username::text,''), 280) from profiles where id = p_id)
    when 'community' then (select left(name, 280) from communities where id = p_id)
    else null end $$;

create or replace function public._set_mod_status(p_type public.report_target, p_id uuid, p_status public.mod_status,
  p_reason text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_type = 'post' then
    update posts set mod_status = p_status, mod_reason = p_reason where id = p_id;
  elsif p_type = 'comment' then
    update comments set mod_status = p_status, mod_reason = p_reason where id = p_id;
  elsif p_type = 'message' then
    update messages set mod_status = p_status, mod_reason = p_reason where id = p_id;
  elsif p_type = 'community' then
    update communities set is_removed = (p_status = 'removed') where id = p_id;
  end if;
  -- 'user' does nothing
end $$;

create or replace function public.admin_resolve_item(p_item uuid, p_decision text, p_strike boolean default false,
  p_reason text default null, p_category public.report_category default 'other', p_severe boolean default false)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare q moderation_queue; v_was_hidden boolean; v_strike_id uuid; v_resolution text; rr record;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into q from moderation_queue where id = p_item and status = 'open' for update;
  if not found then raise exception 'already_resolved'; end if;
  if p_decision = 'restore' or p_decision = 'dismiss' then
    v_was_hidden := (
      (q.target_type = 'post' and exists(select 1 from posts where id = q.target_id and mod_status in ('pending','removed')))
      or (q.target_type = 'comment' and exists(select 1 from comments where id = q.target_id and mod_status in ('pending','removed')))
      or (q.target_type = 'message' and exists(select 1 from messages where id = q.target_id and mod_status in ('pending','removed')))
    );
    if p_decision = 'restore' then
      perform public._set_mod_status(q.target_type, q.target_id, 'visible', null);
    end if;
    update reports set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
      where target_type = q.target_type and target_id = q.target_id and status = 'open';
    if p_decision = 'restore' and v_was_hidden then
      perform public.notify(q.target_user_id, 'content_restored', null, 'Your content was restored',
        'A pincode Team review found it did not break our guidelines.', null, null, null, null, null);
    end if;
    v_resolution := case when p_decision = 'restore' then 'restored' else 'dismissed' end;
  elsif p_decision = 'remove' then
    perform public._set_mod_status(q.target_type, q.target_id, 'removed', p_reason);
    perform public.award_rep(q.target_user_id, auth.uid(), 'moderation_penalty', q.target_id, -10);
    update reports set status = 'actioned', resolved_at = now(), resolved_by = auth.uid()
      where target_type = q.target_type and target_id = q.target_id and status = 'open';
    perform public.notify(q.target_user_id, 'content_removed', null, 'Content removed', coalesce(p_reason,''),
      null, null, null, null, null);
    for rr in select reporter_id from reports
      where target_type = q.target_type and target_id = q.target_id and status = 'actioned' and resolved_by = auth.uid()
    loop
      perform public.notify(rr.reporter_id, 'report_update', null, 'Thanks for your report',
        'We removed content that broke our guidelines.', null, null, null, null, null);
    end loop;
    v_resolution := 'removed';
  else
    raise exception 'bad_decision';
  end if;
  if p_strike and q.target_user_id is not null then
    v_strike_id := public.admin_issue_strike(q.target_user_id, coalesce(p_reason,'Community guidelines violation'),
                                             p_category, p_severe, p_item);
  end if;
  update moderation_queue set status = 'resolved', resolution = v_resolution, strike_id = v_strike_id,
    resolved_at = now(), resolved_by = auth.uid() where id = p_item;
  insert into moderation_actions(admin_id, action, target_type, target_id, target_user_id, note)
  values (auth.uid(), 'resolve_' || v_resolution, q.target_type::text, q.target_id, q.target_user_id, p_reason);
end $$;

create or replace function public.admin_issue_strike(p_user uuid, p_reason text, p_category public.report_category,
  p_severe boolean default false, p_queue uuid default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare n int; v_action text; v_strike_id uuid; v_msg text; v_conv uuid; v_until timestamptz;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select count(*) into n from strikes where user_id = p_user and created_at > now() - interval '365 days';
  n := n + 1;
  v_action := case when p_severe then 'permanent_ban'
                   when n = 1 then 'warning' when n = 2 then 'final_warning'
                   when n = 3 then 'suspension_7d' else 'permanent_ban' end;
  insert into strikes(user_id, issued_by, queue_id, reason, category, severe, action)
  values (p_user, auth.uid(), p_queue, p_reason, p_category, p_severe, v_action) returning id into v_strike_id;
  update profiles set strike_count = strike_count + 1 where id = p_user;
  if v_action = 'suspension_7d' then
    update profiles set banned_until = greatest(coalesce(banned_until, now()), now()) + interval '7 days'
      where id = p_user returning banned_until into v_until;
  elsif v_action = 'permanent_ban' then
    update profiles set ban_permanent = true where id = p_user;
  end if;
  v_conv := public._system_conversation(p_user);
  v_msg := case v_action
    when 'warning' then format('Warning from pincode Team (%s): %s. This is your first strike. Please follow the community guidelines. Repeated violations lead to a suspension.', p_category::text, p_reason)
    when 'final_warning' then format('Final warning from pincode Team (%s): %s. This is your second strike in 12 months. One more and your account will be suspended for 7 days.', p_category::text, p_reason)
    when 'suspension_7d' then format('Your account is suspended until %s (%s): %s. You can still read, but you cannot post, comment, react, vote or message. Another violation leads to a permanent ban.',
           to_char(v_until at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || ' IST', p_category::text, p_reason)
    else format('Your account has been permanently banned (%s): %s.', p_category::text, p_reason)
  end;
  perform public._send_system_message(p_user, v_msg);
  perform public.notify(p_user, case when v_action in ('warning','final_warning') then 'warning' else 'suspension' end,
    null, case when v_action in ('warning','final_warning') then 'You have a new warning' else 'Your account was suspended' end,
    v_msg, null, null, null, v_conv, '/chat/' || v_conv);
  insert into moderation_actions(admin_id, action, target_type, target_id, target_user_id, note)
  values (auth.uid(), 'strike_' || v_action, 'user', p_user, p_user, p_reason);
  return v_strike_id;
end $$;

create or replace function public.admin_lift_ban(p_user uuid, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_conv uuid;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update profiles set banned_until = null, ban_permanent = false where id = p_user;
  v_conv := public._system_conversation(p_user);
  perform public._send_system_message(p_user, coalesce(p_note, 'Your suspension has been lifted. Welcome back.'));
  perform public.notify(p_user, 'ban_lifted', null, 'Your account is active again', coalesce(p_note,''),
    null, null, null, v_conv, '/chat/' || v_conv);
  insert into moderation_actions(admin_id, action, target_type, target_id, target_user_id, note)
  values (auth.uid(), 'lift_ban', 'user', p_user, p_user, p_note);
end $$;

create or replace function public.admin_remove_content(p_type public.report_target, p_id uuid, p_reason text,
  p_strike boolean default false, p_category public.report_category default 'other', p_severe boolean default false)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid; v_item uuid;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  v_user := case p_type
    when 'post' then (select author_id from posts where id = p_id)
    when 'comment' then (select author_id from comments where id = p_id)
    when 'message' then (select sender_id from messages where id = p_id)
    when 'user' then p_id
    when 'community' then (select owner_id from communities where id = p_id) end;
  insert into moderation_queue(target_type, target_id, target_user_id, source, reasons, excerpt)
  values (p_type, p_id, v_user, 'admin', array[p_category::text], public._excerpt(p_type, p_id))
  on conflict (target_type, target_id) where status = 'open' do update
    set reasons = case when p_category::text = any(moderation_queue.reasons) then moderation_queue.reasons
                       else moderation_queue.reasons || p_category::text end
  returning id into v_item;
  perform public.admin_resolve_item(v_item, 'remove', p_strike, p_reason, p_category, p_severe);
end $$;

create or replace function public.admin_test_filter(p_text text, p_scope text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return public.moderate_text(p_text, p_scope, auth.uid());
end $$;
