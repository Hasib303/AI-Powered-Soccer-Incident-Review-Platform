# Backend SQL Migrations

This directory holds the Postgres migrations for the Atletico Intelligence
Supabase backend. They run in numeric order:

| File | Purpose |
| --- | --- |
| `0001_init.sql` | Schema: `team_accounts`, `users_profile`, `leagues`, `teams`, `matches`, `match_assignments`, `incidents`, `audit_events`. Realtime publication on `incidents`. |
| `0002_rls.sql` | Row-Level Security policies. Helper functions `current_team_account()`, `current_role_name()`, `is_official()`, `is_admin()`, `is_viewer()`, `user_assigned_to_match()`. |
| `0003_storage.sql` | Storage object policies bound to the team-prefixed path convention. |
| `0004_video_source.sql` | BRD round 2: adds `video_source_kind` enum (sample/upload/rtmp/hls), `video_source_path`, `video_stream_url`, `calibration jsonb`, `stream_state` enum to `matches`. Extends realtime publication to include `matches` so the live stream banner sees state transitions. |
| `0005_audit_publish.sql` | Adds `audit_events` to the realtime publication for future admin dashboards. |
| `seed.sql` | Demo data — one team account (`Riverside FC`), one league, three teams, two matches, one pre-resolved incident. |

## Apply to a Supabase Cloud project

```bash
# 1. Install the Supabase CLI if you don't have it
brew install supabase/tap/supabase

# 2. From the repo root
supabase link --project-ref <your-project-ref>

# 3. Apply schema + RLS + storage policies
supabase db push --include-all

# 4. Create the two demo auth users via the dashboard:
#       official@demo.atletico.app  /  AtleticoOfficial!2026
#       viewer@demo.atletico.app    /  AtleticoViewer!2026
#    Copy their auth user ids.

# 5. Apply the seed with those user ids substituted
PSQL_URL='postgres://...'  # connection string from Supabase dashboard
psql "$PSQL_URL" \
  -v "app.demo_official_user_id=<OFFICIAL_AUTH_USER_ID>" \
  -v "app.demo_viewer_user_id=<VIEWER_AUTH_USER_ID>" \
  -f migrations/seed.sql
```

## Apply to a local Supabase (Docker)

```bash
supabase init        # if you haven't yet
supabase start       # boots Postgres + Auth + Storage on localhost
supabase db reset    # applies every file in migrations/ in numeric order
```

## Path conventions

Storage objects are written with the prefix
`team_<team_account_id>/match_<match_id>/incident_<incident_id>/...` so the
RLS helper `storage_path_team_account()` can derive the tenant from the
object name and apply the same authorization model used on database rows.
