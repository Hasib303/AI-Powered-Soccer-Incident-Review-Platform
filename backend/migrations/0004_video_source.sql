-- Atletico Intelligence — flexible match video sources.
--
-- Pre-existing matches reference one of two pre-baked sample clips via
-- `sample_clip_id`. This migration extends the schema to support three
-- additional source kinds — uploaded MP4s in Supabase Storage, plus
-- RTMP and HLS live streams — without breaking the seed rows.

set search_path = public;

do $$ begin
    create type video_source_kind as enum ('sample', 'upload', 'rtmp', 'hls');
exception
    when duplicate_object then null;
end $$;

do $$ begin
    create type stream_status as enum (
        'idle',
        'connecting',
        'connected',
        'buffering',
        'reconnecting',
        'disconnected',
        'failed'
    );
exception
    when duplicate_object then null;
end $$;

alter table matches
    add column if not exists video_source_kind video_source_kind not null default 'sample',
    add column if not exists video_source_path text,
    add column if not exists video_stream_url  text,
    add column if not exists calibration       jsonb,
    add column if not exists stream_state      stream_status not null default 'idle',
    add column if not exists stream_state_at   timestamptz;

-- Backfill: rows that already have a sample_clip_id stay tagged as 'sample'.
update matches
set video_source_kind = 'sample'
where sample_clip_id is not null
  and video_source_kind is null;

create index if not exists matches_video_source_path_idx on matches (video_source_path);
create index if not exists matches_stream_state_idx on matches (stream_state);

-- Realtime publication: matches.stream_state changes need to push to the
-- console UI so the disconnect banner appears live.
do $$ begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'matches'
    ) then
        alter publication supabase_realtime add table matches;
    end if;
exception
    when undefined_object then null;
end $$;
