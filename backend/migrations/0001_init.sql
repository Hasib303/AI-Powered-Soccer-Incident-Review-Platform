-- Atletico Intelligence — initial schema.
--
-- Multi-tenant by team_account_id. Every row in every domain table is
-- scoped to exactly one team account; RLS in 0002_rls.sql enforces that.

set search_path = public;

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tenancy + identity
-- ---------------------------------------------------------------------------

create table if not exists team_accounts (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    created_at  timestamptz not null default now()
);

do $$ begin
    create type user_role as enum ('admin', 'official', 'viewer');
exception
    when duplicate_object then null;
end $$;

create table if not exists users_profile (
    id              uuid primary key references auth.users (id) on delete cascade,
    team_account_id uuid not null references team_accounts (id) on delete cascade,
    role            user_role not null,
    display_name    text,
    avatar_url      text,
    created_at      timestamptz not null default now()
);

create index if not exists users_profile_team_idx on users_profile (team_account_id);

-- ---------------------------------------------------------------------------
-- League / match domain
-- ---------------------------------------------------------------------------

create table if not exists leagues (
    id              uuid primary key default gen_random_uuid(),
    team_account_id uuid not null references team_accounts (id) on delete cascade,
    name            text not null,
    season          text,
    created_at      timestamptz not null default now()
);

create index if not exists leagues_team_idx on leagues (team_account_id);

create table if not exists teams (
    id              uuid primary key default gen_random_uuid(),
    league_id       uuid not null references leagues (id) on delete cascade,
    team_account_id uuid not null references team_accounts (id) on delete cascade,
    name            text not null,
    crest_url       text,
    created_at      timestamptz not null default now()
);

create index if not exists teams_league_idx on teams (league_id);
create index if not exists teams_team_account_idx on teams (team_account_id);

do $$ begin
    create type match_status as enum ('scheduled', 'live', 'completed');
exception
    when duplicate_object then null;
end $$;

create table if not exists matches (
    id               uuid primary key default gen_random_uuid(),
    league_id        uuid not null references leagues (id) on delete cascade,
    team_account_id  uuid not null references team_accounts (id) on delete cascade,
    home_team_id     uuid not null references teams (id),
    away_team_id     uuid not null references teams (id),
    kickoff_at       timestamptz not null,
    venue            text,
    status           match_status not null default 'scheduled',
    video_source_url text,
    sample_clip_id   text,
    created_at       timestamptz not null default now()
);

create index if not exists matches_league_idx on matches (league_id);
create index if not exists matches_kickoff_idx on matches (kickoff_at);
create index if not exists matches_team_account_idx on matches (team_account_id);

create table if not exists match_assignments (
    id              uuid primary key default gen_random_uuid(),
    match_id        uuid not null references matches (id) on delete cascade,
    user_id         uuid not null references users_profile (id) on delete cascade,
    role_on_match   text not null default 'video_ref',
    created_at      timestamptz not null default now(),
    unique (match_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Incident core
-- ---------------------------------------------------------------------------

do $$ begin
    create type incident_type as enum ('offside', 'goal_line');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type incident_status as enum (
        'capturing',
        'processing',
        'ready',
        'failed',
        'human_review_required'
    );
exception
    when duplicate_object then null;
end $$;

create table if not exists incidents (
    id                  uuid primary key default gen_random_uuid(),
    match_id            uuid not null references matches (id) on delete cascade,
    team_account_id     uuid not null references team_accounts (id) on delete cascade,
    type                incident_type not null,
    status              incident_status not null default 'capturing',
    verdict             text,
    confidence          numeric(4, 3),
    match_clock         text,
    source_timecode_ms  integer,
    locked_frame_ms     integer,
    clip_path           text,
    snapshot_path       text,
    ai_payload          jsonb,
    referee_note        text check (referee_note is null or char_length(referee_note) <= 300),
    created_by          uuid references users_profile (id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    deleted_clip_at     timestamptz
);

create index if not exists incidents_match_idx on incidents (match_id);
create index if not exists incidents_team_account_idx on incidents (team_account_id);
create index if not exists incidents_status_idx on incidents (status);
create index if not exists incidents_created_at_idx on incidents (created_at desc);

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists incidents_set_updated_at on incidents;
create trigger incidents_set_updated_at
    before update on incidents
    for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create table if not exists audit_events (
    id              uuid primary key default gen_random_uuid(),
    team_account_id uuid not null references team_accounts (id) on delete cascade,
    actor_id        uuid references users_profile (id),
    action          text not null,
    target_type     text,
    target_id       uuid,
    payload         jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists audit_events_team_account_idx on audit_events (team_account_id);
create index if not exists audit_events_created_at_idx on audit_events (created_at desc);

-- Realtime publication so the frontend can subscribe to incident transitions.
do $$ begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'incidents'
    ) then
        alter publication supabase_realtime add table incidents;
    end if;
exception
    when undefined_object then null;
end $$;
