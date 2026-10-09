-- =============================================================================
-- 0019_next_available_batch.sql
--
-- The availability pages need next-free-slot for many units at once. Calling
-- next_available() per unit was one RPC round-trip per unit. This batch
-- variant runs the same reservation-chain walk for all units in one call.
-- Semantics match next_available() exactly.
-- =============================================================================

create or replace function public.next_available_batch(
  p_unit_ids text[],
  p_from     timestamptz default now()
)
returns table(unit_id text, next_free timestamptz)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with recursive chain as (
    select r.unit_id, r.period
      from unit_reservations r
     where r.unit_id = any(p_unit_ids)
       and r.period @> p_from

    union all

    select r.unit_id, r.period
      from unit_reservations r
      join chain c on r.unit_id = c.unit_id
     where lower(r.period) <= upper(c.period)
       and upper(r.period) > upper(c.period)
  ),
  agg as (
    select u as unit_id,
           coalesce(max(upper(c.period)), p_from) as next_free
      from unnest(p_unit_ids) as u
      left join chain c on c.unit_id = u
     group by u
  )
  select * from agg;
$$;
