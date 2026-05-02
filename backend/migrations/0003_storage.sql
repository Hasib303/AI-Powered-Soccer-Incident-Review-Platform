-- Storage bucket policies. Buckets are created via the Supabase dashboard
-- or via supabase-py / supabase CLI; these policies bind object access to
-- the calling user's team_account_id by path prefix.
--
-- Path convention: ``team_<team_account_id>/match_<match_id>/incident_<id>/clip.mp4``
-- The first path segment is the team_account_id used as the tenancy gate.

-- Buckets are expected to exist already (run once after creating the project):
--   insert into storage.buckets (id, name, public) values ('clips', 'clips', false)
--     on conflict (id) do nothing;
--   insert into storage.buckets (id, name, public) values ('snapshots', 'snapshots', false)
--     on conflict (id) do nothing;
-- The seed script in migrations/seed.sql does this for you.

-- Helper: extract the team_account_id from the leading "team_<uuid>" path segment.
create or replace function storage_path_team_account(_object_name text) returns uuid
language sql stable as $$
    select case
        when split_part(_object_name, '/', 1) like 'team_%'
            then nullif(replace(split_part(_object_name, '/', 1), 'team_', ''), '')::uuid
        else null
    end
$$;

-- Read clips/snapshots in your own team's path. Officials see all; viewers
-- get the same path-prefix gate but the row visibility for incidents already
-- limits which clip URLs they can request signed URLs for.
drop policy if exists clips_team_read on storage.objects;
create policy clips_team_read on storage.objects
    for select using (
        bucket_id in ('clips', 'snapshots')
        and storage_path_team_account(name) = current_team_account()
    );

-- Only officials/admins write clip + snapshot objects, and only into their team prefix.
drop policy if exists clips_official_write on storage.objects;
create policy clips_official_write on storage.objects
    for insert with check (
        bucket_id in ('clips', 'snapshots')
        and storage_path_team_account(name) = current_team_account()
        and is_official()
    );

drop policy if exists clips_official_update on storage.objects;
create policy clips_official_update on storage.objects
    for update using (
        bucket_id in ('clips', 'snapshots')
        and storage_path_team_account(name) = current_team_account()
        and is_official()
    )
    with check (
        bucket_id in ('clips', 'snapshots')
        and storage_path_team_account(name) = current_team_account()
        and is_official()
    );

drop policy if exists clips_official_delete on storage.objects;
create policy clips_official_delete on storage.objects
    for delete using (
        bucket_id in ('clips', 'snapshots')
        and storage_path_team_account(name) = current_team_account()
        and is_official()
    );
