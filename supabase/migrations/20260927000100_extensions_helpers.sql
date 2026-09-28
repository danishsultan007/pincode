set search_path = public, extensions;
create extension if not exists postgis  with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists pg_net   with schema extensions;   -- functions live in schema "net"

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- Start of "today" in India, used for daily reputation caps.
create or replace function public.ist_day_start() returns timestamptz language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata' $$;

-- '+91XXXXXXXXXX' or null. Accepts '98450 12345', '+91-9845012345', '09845012345', '919845012345'.
create or replace function public.normalize_phone_in(p text) returns text
language plpgsql immutable set search_path = public, extensions as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if length(d) = 12 and left(d,2) = '91' then d := right(d,10);
  elsif length(d) = 11 and left(d,1) = '0' then d := right(d,10); end if;
  if d ~ '^[6-9][0-9]{9}$' then return '+91' || d; end if;
  return null;
end $$;

-- 'carpenter hoodi' -> 'carpent:* & hoodi:*' (english stemming + prefix). Null for empty input.
create or replace function public.to_prefix_tsquery(p_q text) returns tsquery
language sql immutable set search_path = public, extensions as $$
  select case when w = '' then null else to_tsquery('english', w) end
  from (select coalesce(string_agg(t || ':*', ' & '), '') w
        from unnest(regexp_split_to_array(lower(trim(regexp_replace(coalesce(p_q,''), '[^[:alnum:][:space:]]', ' ', 'g'))), '\s+')) t
        where t <> '') s $$;
