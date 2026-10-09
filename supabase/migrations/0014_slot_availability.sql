-- Slot grid for the booking form, with the state vocabulary the Stitch design uses.
--
-- Why a new function: the design's slot picker shows *why* a slot is unavailable
-- and *when* it frees up — "Sedang Main / Selesai 18.30", "Lagi Disiapkan /
-- Siap 18.45", "AVAILABLE / Gas langsung". The current form offers a raw <select>
-- of 48 bare HH:MM strings with no availability information at all, which was the
-- single most useful thing missing from the booking page.
--
-- The overlap logic cannot live in the client: 0004_harden.sql put
-- unit_reservations behind a "service only" RLS policy, so the browser cannot read
-- it, and the constraint that actually protects a slot is the
-- unit_reservations_no_overlap exclusion constraint. Deriving state from the same
-- rows the constraint guards keeps the picker and the constraint in agreement.
--
-- get_available_units(branch, start, end) answers "is this one window free for any
-- unit". This answers the different question "which of today's slots can I see
-- booked, cleaning, mid-session or free", per unit.

create or replace function public.slot_availability(
  p_branch_id        text,
  p_unit_id          text,
  p_date             date,
  p_duration_minutes integer default 60
)
returns table (
  slot_start timestamptz,
  slot_end   timestamptz,
  state      text,
  ready_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_cfg        booking_config;
  v_interval   integer;
  v_minutes    integer;
  v_max        integer;
  v_status     unit_status;
  v_now        timestamptz := now();
  v_start      timestamptz;
  v_end        timestamptz;
  v_open       timestamptz;
  v_close      timestamptz;
  v_m          integer;
  v_booked     boolean;
  v_cleaning   boolean;
  v_busy_end   timestamptz;
begin
  select * into v_cfg from get_booking_config(p_branch_id);
  v_interval := coalesce(v_cfg.booking_interval_minutes, 30);
  v_minutes  := coalesce(p_duration_minutes, 60);
  v_max      := coalesce(v_cfg.maximum_duration_minutes, 360);

  if v_minutes < coalesce(v_cfg.minimum_duration_minutes, 60) or v_minutes > v_max then
    raise exception 'durasi harus antara % dan % menit',
      coalesce(v_cfg.minimum_duration_minutes, 60), v_max using errcode = '22023';
  end if;
  if v_minutes % v_interval <> 0 then
    raise exception 'durasi harus kelipatan % menit', v_interval using errcode = '22023';
  end if;

  select u.status into v_status from units u where u.unit_id = p_unit_id;
  if v_status is null then
    raise exception 'unit % tidak ditemukan', p_unit_id using errcode = '22023';
  end if;

  -- Operate on the requested day in the lounge's own timezone, so a 09:00 slot
  -- is 09:00 WIB regardless of the caller's session timezone.
  v_open  := (p_date::timestamp) at time zone 'Asia/Jakarta';
  v_close := v_open + make_interval(hours => 24);

  return query
  with slots as (
    select v_open + make_interval(mins => m) as s
    from generate_series(0, (1440 / v_interval) * v_interval - v_interval, v_interval) as m
  ),
  judged as (
    select
      sl.s as slot_start,
      sl.s + make_interval(mins => v_minutes) as slot_end,
      exists (
        select 1 from unit_reservations r
         where r.unit_id = p_unit_id
           and r.kind = 'BOOKING'
           and r.period && tstzrange(sl.s, sl.s + make_interval(mins => v_minutes), '[)')
      ) as booked,
      exists (
        select 1 from unit_reservations r
         where r.unit_id = p_unit_id
           and r.kind = 'CLEANING'
           and r.period && tstzrange(sl.s, sl.s + make_interval(mins => v_minutes), '[)')
      ) as cleaning,
      (
        select max(upper(r.period)) from unit_reservations r
         where r.unit_id = p_unit_id
           and r.period && tstzrange(sl.s, sl.s + make_interval(mins => v_minutes), '[)')
      ) as busy_until
    from slots sl
  )
  select
    j.slot_start,
    j.slot_end,
    case
      when v_status in ('MAINTENANCE', 'OFFLINE') then 'OUT_OF_SERVICE'
      when j.slot_start < v_now                        then 'PAST'
      when j.booked and j.slot_start <= v_now          then 'IN_USE'
      when j.booked                                     then 'BOOKED'
      when j.cleaning                                   then 'CLEANING'
      else 'AVAILABLE'
    end as state,
    case
      when j.booked or j.cleaning then j.busy_until
      else null
    end as ready_at
  from judged j
  order by j.slot_start;
end;
$$;
