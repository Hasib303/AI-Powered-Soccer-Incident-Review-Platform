-- Seed data for the demo.
--
-- Idempotent: re-running this script reuses existing rows by deterministic UUIDs.
-- Run AFTER the migrations and AFTER you've created the demo auth users in
-- the Supabase dashboard or via the Admin API. This script does NOT create
-- auth.users rows because that requires the service-role API.
--
-- Demo users (create these in Supabase Auth first):
--   official@demo.atletico.app   password: AtleticoOfficial!2026
--   viewer@demo.atletico.app     password: AtleticoViewer!2026
--
-- Replace the @user_official_id / @user_viewer_id values below with the
-- actual auth.users.id of those two accounts.

set search_path = public;

-- Make sure the storage buckets exist.
insert into storage.buckets (id, name, public)
values ('clips', 'clips', false), ('snapshots', 'snapshots', false)
on conflict (id) do nothing;

-- Tenant.
insert into team_accounts (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Riverside FC')
on conflict (id) do update set name = excluded.name;

-- Map demo auth users into the team. UPDATE the auth user ids below before
-- running this in the cloud; the values here are placeholders that the
-- seeding script will substitute.
do $$
declare
    v_team_id constant uuid := '00000000-0000-0000-0000-000000000001';
    v_official_id uuid := nullif(current_setting('app.demo_official_user_id', true), '')::uuid;
    v_viewer_id   uuid := nullif(current_setting('app.demo_viewer_user_id', true), '')::uuid;
begin
    if v_official_id is not null then
        insert into users_profile (id, team_account_id, role, display_name)
        values (v_official_id, v_team_id, 'official', 'Sam Rivera')
        on conflict (id) do update
            set role = excluded.role,
                team_account_id = excluded.team_account_id,
                display_name = excluded.display_name;
    end if;

    if v_viewer_id is not null then
        insert into users_profile (id, team_account_id, role, display_name)
        values (v_viewer_id, v_team_id, 'viewer', 'Coach Harbor')
        on conflict (id) do update
            set role = excluded.role,
                team_account_id = excluded.team_account_id,
                display_name = excluded.display_name;
    end if;
end $$;

-- League and teams.
insert into leagues (id, team_account_id, name, season)
values (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'Metro Amateur League',
    '2025-26'
)
on conflict (id) do update set name = excluded.name, season = excluded.season;

insert into teams (id, league_id, team_account_id, name)
values
    ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000001', 'Riverside FC'),
    ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000001', 'North End'),
    ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000001', 'Harbor SC')
on conflict (id) do update set name = excluded.name;

-- One scheduled live match for today, plus a completed one for the viewer demo.
insert into matches (id, league_id, team_account_id, home_team_id, away_team_id,
                     kickoff_at, venue, status, sample_clip_id)
values
    ('00000000-0000-0000-0000-000000000030',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000020',
     '00000000-0000-0000-0000-000000000021',
     now() - interval '5 minutes',
     'Riverside Stadium', 'live', 'clip_offside_01'),
    ('00000000-0000-0000-0000-000000000031',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000022',
     '00000000-0000-0000-0000-000000000020',
     now() - interval '7 days',
     'Harbor Point Pitch', 'completed', 'clip_goal_01')
on conflict (id) do update
    set kickoff_at = excluded.kickoff_at,
        status = excluded.status,
        sample_clip_id = excluded.sample_clip_id,
        venue = excluded.venue;

-- Assignments for the demo official.
do $$
declare
    v_official_id uuid := nullif(current_setting('app.demo_official_user_id', true), '')::uuid;
begin
    if v_official_id is not null then
        insert into match_assignments (match_id, user_id, role_on_match)
        values
            ('00000000-0000-0000-0000-000000000030', v_official_id, 'video_ref'),
            ('00000000-0000-0000-0000-000000000031', v_official_id, 'video_ref')
        on conflict (match_id, user_id) do update
            set role_on_match = excluded.role_on_match;
    end if;
end $$;

-- One pre-resolved completed incident on the historical match so the viewer
-- has something to read on first sign-in. Officials will create the live
-- ones via the console flow.
insert into incidents (id, match_id, team_account_id, type, status, verdict, confidence,
                       match_clock, source_timecode_ms, locked_frame_ms, ai_payload)
values (
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000031',
    '00000000-0000-0000-0000-000000000001',
    'goal_line',
    'ready',
    'goal',
    0.84,
    '70:14',
    14_500,
    14_580,
    jsonb_build_object(
        'type', 'goal_line',
        'verdict', 'goal',
        'confidence', 0.84,
        'goal_line_x', 105.0,
        'crossing_frame_ms', 14580,
        'ball_trajectory', jsonb_build_array(
            jsonb_build_object('x', 104.4, 'y', 33.5),
            jsonb_build_object('x', 104.7, 'y', 33.7),
            jsonb_build_object('x', 105.0, 'y', 33.9),
            jsonb_build_object('x', 105.3, 'y', 34.1)
        ),
        'rationale', jsonb_build_array(
            'Goal line at pitch x=105.00 m.',
            'Ball fully crossed the goal line at frame 14.58s (max overshoot 0.34 m).',
            'Confidence 0.84 (margin 0.34 m, detection 0.92, calibration 0.85).'
        )
    )
)
on conflict (id) do update
    set verdict = excluded.verdict,
        confidence = excluded.confidence,
        ai_payload = excluded.ai_payload,
        status = excluded.status;
