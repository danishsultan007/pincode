set search_path = public, extensions;

-- ---------- Sign in with username, email or phone ----------
-- Username, email and phone are all unique per profile (§2.1/§2.2), so any
-- one of them should be usable to sign in — but Supabase Auth's
-- signInWithPassword only accepts an email. This resolves a username or
-- E.164 phone to the account's email first; the client still calls
-- signInWithPassword itself, so a wrong password still gets Supabase's own
-- generic "invalid login credentials" error and this never exposes whether
-- an identifier exists on its own.
create or replace function public.email_for_login(p_identifier text) returns text
language plpgsql stable security definer set search_path = public, extensions as $$
declare v_email text; v_id uuid;
begin
  if coalesce(p_identifier, '') = '' then return null; end if;

  -- Already an email: pass through as-is (still case-folded via private_profiles.email being citext).
  if p_identifier ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return lower(p_identifier);
  end if;

  -- E.164 Indian phone (client normalizes before calling this).
  if p_identifier ~ '^\+91[6-9][0-9]{9}$' then
    select id into v_id from private_profiles where phone_e164 = p_identifier;
  else
    -- Otherwise a username.
    select id into v_id from profiles where username = p_identifier::citext;
  end if;

  if v_id is null then return null; end if;
  select email into v_email from private_profiles where id = v_id;
  return v_email;
end $$;
-- No explicit grant needed: like email_available/username_available above,
-- a newly created function is EXECUTE-able by PUBLIC (anon + authenticated)
-- by default, which is what a pre-auth sign-in lookup needs.
