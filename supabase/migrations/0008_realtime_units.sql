-- Realtime for live unit status on /tempat-main.
-- postgres_changes streams rows the client can already read (units has the
-- "public read" SELECT policy for anon/authenticated), so no new grants here.
alter publication supabase_realtime add table units;
