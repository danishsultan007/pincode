# supabase (pincode)

SQL-only backend: no Edge Functions, no CLI required. Everything here runs through
the Supabase Dashboard's SQL editor, or the Supabase CLI if you prefer it.

## Order to run

Run the files in `migrations/` in filename order — the timestamp prefix is the
order, and later migrations rely on functions and tables defined earlier:

1. `20260927000100_extensions_helpers.sql`
2. `20260927000200_profiles.sql`
3. `20260927000300_posts_comments.sql`
4. `20260927000400_reputation_badges.sql`
5. `20260927000500_notifications_push.sql`
6. `20260927000600_messaging.sql`
7. `20260927000700_communities.sql`
8. `20260927000800_feed_search.sql`
9. `20260927000900_moderation.sql`
10. `20260927001000_storage_realtime.sql`
11. `20260927001100_rls_grants.sql`
12. `20260927001200_p9_fixes.sql` — polish-phase fixes: a regex-validation guard on
    `filter_terms.pattern` (so a malformed admin-added pattern can't break every
    post/comment/message insert) and `search_path` on three helper functions that
    were missing it.

Then, optionally:

- `seed.sql` — demo data (profiles, posts, communities, etc.) for local development
  and the acceptance checks in `MOBILE-PLAN.md` §9. Safe to skip in production.
- `tests/smoke.sql` — runs inside a transaction and rolls back at the end; asserts
  RLS and trigger behavior. Safe to run against a project that already has data.

### Option A — Dashboard SQL editor

Open the project's SQL editor and paste/run each file in `migrations/`, in order,
top to bottom. Then run `seed.sql` if you want demo data. `tests/smoke.sql` can be
run the same way any time after the migrations (it rolls back, so it never leaves
data behind).

### Option B — Supabase CLI

```bash
supabase link --project-ref <your-project-ref>
supabase db push          # applies everything in migrations/, in order
psql "$DATABASE_URL" -f supabase/seed.sql          # optional demo data
psql "$DATABASE_URL" -f supabase/tests/smoke.sql   # optional smoke test
```

## After running the migrations

Make yourself an admin (§6 in `MOBILE-PLAN.md`):

```sql
update profiles set role = 'admin' where username = '<your username>';
```

See `../SETUP.md` for the full one-time setup (Auth providers, Storage bucket,
environment variables for the app).
