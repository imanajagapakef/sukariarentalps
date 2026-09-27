-- =============================================================================
-- 0006_fix_next_available.sql
--
-- Bug: next_available() only inspected the single reservation covering p_from,
-- so it returned the END OF THE CURRENT BOOKING even when that moment was
-- already taken by the next booking. A unit with BK 10:00-12:00 followed by
-- BK 12:00-14:00 + cleaning 14:00-14:10 reported "free at 12:00" while it was
-- in fact next free at 14:10.
--
-- Fix: walk the contiguous reservation chain forward from p_from. Adjacency
-- counts, because [10:00,12:00) and [12:00,14:00) must be treated as a
-- continuous busy block. The strict upper-bound increase guarantees the
-- recursion terminates.
-- =============================================================================

create or replace function public.next_available(
  p_unit_id text,
  p_from    timestamptz default now()
)
returns timestamptz
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with recursive chain as (
    select r.period
      from unit_reservations r
     where r.unit_id = p_unit_id
       and r.period @> p_from

    union all

    select r.period
      from unit_reservations r
      join chain c on true
     where r.unit_id = p_unit_id
       and lower(r.period) <= upper(c.period)
       and upper(r.period) > upper(c.period)
  )
  select coalesce(max(upper(period)), p_from)
    from chain;
$$;