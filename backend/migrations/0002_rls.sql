-- Row-Level Security policies. Authorization runs in the database, not in
-- application code. Every team-scoped table filters by current_team_account().

set search_path = public;

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they bypass RLS while reading their
-- own context tables; safe because they only read the calling user's row).
-- ---------------------------------------------------------------------------

create or replace function current_team_account() returns uuid
language sql stable security definer set search_path = public as $$
    select team_account_id from users_profile where id = auth.uid()
$$;

create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
    select role from users_profile where id = auth.uid()
$$;

create or replace function is_official() returns boolean
language sql stable as $$
    select coalesce(current_role_name() in ('admin', 'official'), false)
$$;

create or replace function is_admin() returns boolean
language sql stable as $$
    select coalesce(current_role_name() = 'admin', false)
$$;

create or replace function is_viewer() returns boolean
language sql stable as $$
    select coalesce(current_role_name() = 'viewer', false)
$$;

create or replace function user_assigned_to_match(_match_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
    select exists (
        select 1
        from match_assignments
        where match_id = _match_id and user_id = auth.uid()
    )
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table.
-- ---------------------------------------------------------------------------

alter table team_accounts     enable row level security;
alter table users_profile     enable row level security;
alter table leagues           enable row level security;
alter table teams             enable row level security;
alter table matches           enable row level security;
alter table match_assignments enable row level security;
alter table incidents         enable row level security;
alter table audit_events      enable row level security;

-- ---------------------------------------------------------------------------
-- team_accounts
-- ---------------------------------------------------------------------------

drop policy if exists team_accounts_self_select on team_accounts;
create policy team_accounts_self_select on team_accounts
    for select using (id = current_team_account());

drop policy if exists team_accounts_admin_update on team_accounts;
create policy team_accounts_admin_update on team_accounts
    for update using (id = current_team_account() and is_admin())
    with check (id = current_team_account());

-- ---------------------------------------------------------------------------
-- users_profile
-- ---------------------------------------------------------------------------

drop policy if exists users_profile_self_select on users_profile;
create policy users_profile_self_select on users_profile
    for select using (team_account_id = current_team_account());

drop policy if exists users_profile_self_update on users_profile;
create policy users_profile_self_update on users_profile
    for update using (id = auth.uid())
    with check (id = auth.uid() and team_account_id = current_team_account());

drop policy if exists users_profile_admin_insert on users_profile;
create policy users_profile_admin_insert on users_profile
    for insert with check (team_account_id = current_team_account() and is_admin());

drop policy if exists users_profile_admin_delete on users_profile;
create policy users_profile_admin_delete on users_profile
    for delete using (team_account_id = current_team_account() and is_admin());

-- ---------------------------------------------------------------------------
-- leagues / teams / matches / match_assignments — same pattern: team-scoped
-- read for everyone, write only for admin or official.
-- ---------------------------------------------------------------------------

drop policy if exists leagues_select on leagues;
create policy leagues_select on leagues
    for select using (team_account_id = current_team_account());

drop policy if exists leagues_official_write on leagues;
create policy leagues_official_write on leagues
    for all using (team_account_id = current_team_account() and is_official())
    with check (team_account_id = current_team_account() and is_official());

drop policy if exists teams_select on teams;
create policy teams_select on teams
    for select using (team_account_id = current_team_account());

drop policy if exists teams_official_write on teams;
create policy teams_official_write on teams
    for all using (team_account_id = current_team_account() and is_official())
    with check (team_account_id = current_team_account() and is_official());

drop policy if exists matches_select on matches;
create policy matches_select on matches
    for select using (team_account_id = current_team_account());

drop policy if exists matches_official_write on matches;
create policy matches_official_write on matches
    for all using (team_account_id = current_team_account() and is_official())
    with check (team_account_id = current_team_account() and is_official());

drop policy if exists match_assignments_select on match_assignments;
create policy match_assignments_select on match_assignments
    for select using (
        exists (
            select 1 from matches m
            where m.id = match_assignments.match_id
              and m.team_account_id = current_team_account()
        )
    );

drop policy if exists match_assignments_admin_write on match_assignments;
create policy match_assignments_admin_write on match_assignments
    for all using (
        is_admin()
        and exists (
            select 1 from matches m
            where m.id = match_assignments.match_id
              and m.team_account_id = current_team_account()
        )
    )
    with check (
        is_admin()
        and exists (
            select 1 from matches m
            where m.id = match_assignments.match_id
              and m.team_account_id = current_team_account()
        )
    );

-- ---------------------------------------------------------------------------
-- incidents — the most security-sensitive table.
-- ---------------------------------------------------------------------------

-- Officials and admins see every incident in their account.
-- Viewers see only ready incidents whose clip has not been deleted.
drop policy if exists incidents_official_select on incidents;
create policy incidents_official_select on incidents
    for select using (
        team_account_id = current_team_account()
        and (
            is_official()
            or (is_viewer() and status = 'ready' and deleted_clip_at is null)
        )
    );

-- Officials may create incidents only on matches they're assigned to.
drop policy if exists incidents_official_insert on incidents;
create policy incidents_official_insert on incidents
    for insert with check (
        team_account_id = current_team_account()
        and is_official()
        and user_assigned_to_match(match_id)
        and (created_by is null or created_by = auth.uid())
    );

-- Officials may update incidents on assigned matches. Admins always.
drop policy if exists incidents_official_update on incidents;
create policy incidents_official_update on incidents
    for update using (
        team_account_id = current_team_account()
        and (is_admin() or (is_official() and user_assigned_to_match(match_id)))
    )
    with check (
        team_account_id = current_team_account()
        and (is_admin() or (is_official() and user_assigned_to_match(match_id)))
    );

drop policy if exists incidents_official_delete on incidents;
create policy incidents_official_delete on incidents
    for delete using (
        team_account_id = current_team_account()
        and (is_admin() or (is_official() and user_assigned_to_match(match_id)))
    );

-- ---------------------------------------------------------------------------
-- audit_events
-- ---------------------------------------------------------------------------

drop policy if exists audit_events_select on audit_events;
create policy audit_events_select on audit_events
    for select using (team_account_id = current_team_account() and is_admin());

drop policy if exists audit_events_insert on audit_events;
create policy audit_events_insert on audit_events
    for insert with check (
        team_account_id = current_team_account()
        and (actor_id is null or actor_id = auth.uid())
    );
