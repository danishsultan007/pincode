set search_path = public, extensions;

-- ---------- Close the email leak ----------
-- email_for_login() returned the real email for any username/phone to ANY
-- caller, signed in or not. Sign-in by username/phone now goes through the
-- login-with-identifier Edge Function, which does the lookup with the service
-- role and returns only a session.
--
-- RUN THIS ONLY AFTER the login-with-identifier function is deployed and the
-- updated app is live; otherwise username/phone sign-in stops working
-- (email sign-in is unaffected). Revoke first so a partial run still closes
-- the hole.
revoke execute on function public.email_for_login(text) from public, anon, authenticated;
drop function if exists public.email_for_login(text);

-- Account deletion now goes through the delete-account Edge Function (which
-- also clears storage); stop clients from calling the bare RPC, which would
-- leave uploaded files behind.
revoke execute on function public.delete_my_account() from public, anon, authenticated;
