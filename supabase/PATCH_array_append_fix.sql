-- Patch: fixes the 'malformed array literal' bug in three functions
-- (text[] || 'string literal' is ambiguous in Postgres; array_append
-- is unambiguous). Safe to run standalone — each is create-or-replace,
-- so this just redefines them in place with no other side effects.

create or replace function public.suggest_usernames(p_hint text default null, p_count int default 6)
returns setof text language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  adjs  text[] := array['sunny','leafy','quiet','friendly','breezy','early','lakeside','cozy','bright','kind',
                        'nimble','misty','humble','jolly','swift','calm','cheery','curious','chill','rainy'];
  nouns text[] := array['neem','banyan','gulmohar','mango','jasmine','chai','dosa','idli','coffee','auto','metro',
                        'lane','nukkad','chowk','terrace','koel','myna','parrot','kolam','jamun','tulsi','bakery',
                        'mali','cycle','peepal'];
  hint text := left(lower(regexp_replace(coalesce(p_hint,''), '[^A-Za-z]', '', 'g')), 10);
  cand text; found text[] := '{}'; i int := 0; want int := least(greatest(coalesce(p_count,6),1),10);
begin
  while coalesce(array_length(found,1),0) < want and i < 80 loop
    i := i + 1;
    if length(hint) >= 3 and i % 2 = 0 then
      cand := hint || '_' || nouns[1 + floor(random()*array_length(nouns,1))::int] || (10 + floor(random()*90))::int;
    else
      cand := adjs[1 + floor(random()*array_length(adjs,1))::int] || '_'
           || nouns[1 + floor(random()*array_length(nouns,1))::int] || (10 + floor(random()*90))::int;
    end if;
    cand := left(cand, 20);
    if public.username_available(cand) and not (cand = any(found)) then found := array_append(found, cand); end if;
  end loop;
  return query select unnest(found);
end $$;

create or replace function public.can_create_community() returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare uid uuid := auth.uid(); p profiles; v_age int; v_owned int; v_strike boolean; reasons text[] := '{}';
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into p from profiles where id = uid;
  v_age := extract(day from now() - p.created_at)::int;
  select count(*) into v_owned from communities where owner_id = uid and not is_removed;
  select exists(select 1 from strikes where user_id = uid and created_at > now() - interval '90 days') into v_strike;
  if p.onboarded_at is null or p.ban_permanent or (p.banned_until is not null and p.banned_until > now()) then
    reasons := array_append(reasons, 'account_status');
  end if;
  if coalesce(p.reputation,0) < 100 then reasons := array_append(reasons, 'reputation'); end if;
  if v_age < 30 then reasons := array_append(reasons, 'account_age'); end if;
  if v_strike then reasons := array_append(reasons, 'recent_strike'); end if;
  if v_owned >= 3 then reasons := array_append(reasons, 'owned_limit'); end if;
  return jsonb_build_object('allowed', cardinality(reasons) = 0, 'reasons', to_jsonb(reasons),
    'reputation', coalesce(p.reputation,0), 'required_reputation', 100,
    'account_age_days', v_age, 'required_age_days', 30,
    'owned', v_owned, 'max_owned', 3);
end $$;

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

