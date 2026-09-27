-- =============================================================================
-- 0003_availability.sql
-- Klub Sukaria — availability engine
-- The core of the system: atomic slot locking + pricing + extension limits.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_cron with schema extensions;

-- ---------------------------------------------------------------------------
-- unit_reservations
-- Every slice of time a unit is not freely bookable lives here: a booking,
-- the cleaning buffer after it, or an admin block (maintenance).
--
-- The EXCLUDE constraint is the race-condition fix. Two concurrent bookings
-- for the same unit and overlapping window physically cannot both commit —
-- one gets a serialization/exclusion error. Frontend is never the guard.
--
-- ponytail: rows are deleted when a WAITING_PAYMENT booking expires, so the
-- exclusion constraint needs no status filtering. "Expire" is a deletion,
-- which is exactly the semantic we want.
-- ---------------------------------------------------------------------------
create type reservation_kind as enum ('BOOKING', 'CLEANING', 'BLOCK');

create table unit_reservations (
  reservation_id  bigserial primary key,
  unit_id         text not null references units (unit_id) on delete cascade,
  booking_id      text references bookings (booking_id) on delete cascade,
  kind            reservation_kind not null,
  period          tstzrange not null,
  created_at      timestamptz not null default now(),

  constraint unit_reservations_period_valid check (not isempty(period)),
  constraint unit_reservations_no_overlap
    exclude using gist (unit_id with =, period with &&)
);

create index unit_reservations_unit_idx on unit_reservations (unit_id, period);
create index unit_reservations_booking_idx on unit_reservations (booking_id);

-- ---------------------------------------------------------------------------
-- booking_config resolver: branch override wins, else global default
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_config(p_branch_id text)
returns booking_config
language sql
stable
as $$
  select *
    from booking_config
   where branch_id = p_branch_id
      or branch_id is null
   order by branch_id nulls last
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- get_available_units(branch, start, end)
-- Returns units with no reservation overlapping [start, end).
-- ---------------------------------------------------------------------------
create or replace function public.get_available_units(
  p_branch_id text,
  p_start     timestamptz,
  p_end       timestamptz
)
returns table (
  unit_id          text,
  unit_name        text,
  facility_type_id text,
  status           unit_status
)
language sql
stable
security invoker
as $$
  select u.unit_id, u.name, u.facility_type_id, u.status
    from units u
   where u.branch_id = p_branch_id
     and u.status not in ('MAINTENANCE', 'OFFLINE')
     and not exists (
       select 1
         from unit_reservations r
        where r.unit_id = u.unit_id
          and r.period && tstzrange(p_start, p_end, '[)')
     )
   order by u.unit_id;
$$;

-- ---------------------------------------------------------------------------
-- next_available(unit)
-- When is this unit next free? Returns the end of the reservation chain that
-- covers now(), i.e. the earliest start of a bookable window.
-- ---------------------------------------------------------------------------
create or replace function public.next_available(
  p_unit_id text,
  p_from    timestamptz default now()
)
returns timestamptz
language sql
stable
security invoker
as $$
  with overlapping as (
    select r.period
      from unit_reservations r
     where r.unit_id = p_unit_id
       and r.period @> p_from
  )
  select coalesce(max(upper(period)), p_from)
    from overlapping;
$$;

-- ---------------------------------------------------------------------------
-- latest_extendable(booking)
-- How far can this booking be extended before it hits the next reservation
-- (a following booking, or the cleaning buffer)? Returns null if the unit
-- itself is blocked or the booking is not active.
-- ---------------------------------------------------------------------------
create or replace function public.latest_extendable(p_booking_id text)
returns timestamptz
language sql
stable
security invoker
as $$
  with b as (
    select booking_id, unit_id, scheduled_end_at, status
      from bookings
     where booking_id = p_booking_id
  ),
  blocking as (
    select min(lower(r.period)) as boundary
      from b
      join unit_reservations r
        on r.unit_id = b.unit_id
       and r.booking_id is distinct from b.booking_id
       and lower(r.period) >= b.scheduled_end_at
  )
  select case
           when (select status from b) in ('CONFIRMED', 'CHECKED_IN', 'IN_USE')
             then coalesce((select boundary from blocking), b.scheduled_end_at)
           else null
         end
    from b;
$$;

-- ---------------------------------------------------------------------------
-- calculate_price(facility, branch, duration)
-- Longest matching package wins, else the hourly rate times duration.
-- ---------------------------------------------------------------------------
create or replace function public.calculate_price(
  p_branch_id      text,
  p_facility_type_id text,
  p_duration_minutes integer
)
returns integer
language sql
stable
security invoker
as $$
  with packages as (
    select price
      from pricing_rules
     where branch_id = p_branch_id
       and facility_type_id = p_facility_type_id
       and pricing_type = 'PACKAGE'
       and duration_minutes <= p_duration_minutes
       and active
     order by duration_minutes desc
     limit 1
  ),
  hourly as (
    select price
      from pricing_rules
     where branch_id = p_branch_id
       and facility_type_id = p_facility_type_id
       and pricing_type = 'HOURLY'
       and active
     order by duration_minutes asc
     limit 1
  ),
  remainder as (
    select p_duration_minutes
           - coalesce((select duration_minutes
                         from pricing_rules
                        where branch_id = p_branch_id
                          and facility_type_id = p_facility_type_id
                          and pricing_type = 'PACKAGE'
                          and duration_minutes <= p_duration_minutes
                          and active
                        order by duration_minutes desc
                        limit 1), 0) as minutes
  )
  select coalesce((select price from packages), 0)
       + coalesce((select price from hourly), 0)
         * ceil((select minutes from remainder)::numeric / 60)::int;
$$;

-- ---------------------------------------------------------------------------
-- expire_bookings()
-- Cron target. WAITING_PAYMENT past deadline -> EXPIRED and reservations
-- released so the slot becomes bookable again.
-- ---------------------------------------------------------------------------
create or replace function public.expire_bookings()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  expired_count integer := 0;
begin
  with doomed as (
    update bookings
       set status = 'EXPIRED'
     where status = 'WAITING_PAYMENT'
       and payment_deadline_at is not null
       and payment_deadline_at < now()
    returning booking_id
  ),
  release as (
    delete from unit_reservations r
     using doomed d
     where r.booking_id = d.booking_id
    returning 1
  )
  select count(*) into expired_count from doomed;

  return expired_count;
end;
$$;

-- only the scheduler / service layer may run it
revoke execute on function public.expire_bookings() from anon, authenticated, public;

-- pg_cron: run every minute
select cron.schedule(
  'expire-bookings',
  '* * * * *',
  $$select public.expire_bookings()$$
);