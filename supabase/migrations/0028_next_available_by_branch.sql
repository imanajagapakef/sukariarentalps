-- =============================================================================
-- 0028_next_available_by_branch.sql
--
-- The availability pages render next-free for units they have *just* fetched, so
-- the RPC could only run after the catalogue query returned: two network waves,
-- and every public page paid the second one (~50 ms plus the occasional edge
-- outlier measured at 1.7 s).
--
-- This variant resolves the busy units inside Postgres instead of taking them
-- from the caller, so a page can fire it in the same Promise.all as everything
-- else. Semantics are still next_available_batch's, because it *is* that
-- function — only the unit list moved from the client to a subquery.
--
-- Pass NULL for the whole book, a branch id to scope it.
-- =============================================================================

create or replace function public.next_available_by_branch(
  p_branch_id text default null,
  p_from       timestamptz default now()
)
returns table(unit_id text, next_free timestamptz)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select b.unit_id, b.next_free
    from public.next_available_batch(
           coalesce(
             (select array_agg(u.unit_id)
                from public.units u
               where u.status <> 'AVAILABLE'
                 and (p_branch_id is null or u.branch_id = p_branch_id)),
             '{}'::text[]
           ),
           p_from
         ) as b;
$$;