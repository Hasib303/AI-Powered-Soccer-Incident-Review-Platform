-- Add audit_events to the realtime publication so newly written audit
-- rows can stream to admin dashboards (future). Optional but cheap.

do $$ begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and tablename = 'audit_events'
    ) then
        alter publication supabase_realtime add table audit_events;
    end if;
exception
    when undefined_object then null;
end $$;
