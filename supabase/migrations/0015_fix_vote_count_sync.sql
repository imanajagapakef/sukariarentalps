-- Make the vote-count sync actually work.
--
-- game_votes_sync_count (AFTER INSERT OR DELETE ON game_votes) has fired all
-- along, but sync_game_request_votes() was not SECURITY DEFINER, so it ran as
-- the invoking role. The public vote form inserts game_votes as `anon`, and
-- game_requests only has INSERT and SELECT policies — no UPDATE. The trigger's
-- UPDATE therefore matched zero visible rows and was silently discarded.
--
-- Verified before the fix: 1 row in game_votes, vote_count still 0.
--
-- apply_inventory_movement and set_updated_at are also not SECURITY DEFINER, and
-- that is correct: both are only ever reached from inside SECURITY DEFINER
-- functions (create_booking / handle_booking_ended), so they already run as the
-- owner. Only sync_game_request_votes is reachable directly by an untrusted
-- role, so only it needs changing.
--
-- search_path is already pinned in the function, which is what makes SECURITY
-- DEFINER safe here.

create or replace function public.sync_game_request_votes()
returns trigger
language plpgsql
security definer
set search_path to public, extensions
as $$
begin
  update game_requests
     set vote_count = (
       select count(*) from game_votes v
        where v.request_id = coalesce(new.request_id, old.request_id)
     )
   where request_id = coalesce(new.request_id, old.request_id);
  return null;
end;
$$;

-- Backfill counts for votes recorded while the trigger was a no-op.
update game_requests r
   set vote_count = (
     select count(*) from game_votes v where v.request_id = r.request_id
   )
 where r.vote_count <> (
     select count(*) from game_votes v where v.request_id = r.request_id
   );
