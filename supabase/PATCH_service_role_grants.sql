set search_path = public, extensions;

-- The Edge Functions (delete-account, login-with-identifier) use the service
-- role, which bypasses RLS but still needs table privileges. This project's
-- tables didn't get them automatically (delete-account failed with
-- "permission denied for table messages"), so grant them explicitly.
-- service_role is a server-only key and is never shipped in the app.
grant usage on schema public to service_role;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
