-- Release the unit when a booking ends without being served.
--
-- Found while screenshotting /tempat-main after the radius fix: four units were
-- stuck in BOOKED while their bookings were EXPIRED or CANCELLED. The customer
-- facing pages render that as "DIPESAN", so the lounge looks booked out.
--
-- Two independent causes, both terminal-status transitions that forget the unit:
--
--   cancel_booking()  only resets the unit `if v_booking.status = 'CONFIRMED'`,
--                     so cancelling a WAITING_PAYMENT booking — the common case,
--                     since that is the state a lapsed or abandoned booking sits
--                     in — leaves the unit BOOKED forever.
--   expire_bookings() never updates units at all, so every expired booking
--                     strands its unit.
--
-- Fix: handle it from the bookings.status transition, the same shape as the
-- snack-stock reversal added in 0010/0011, so every current and future path is
-- covered at once and each booking releases exactly once (terminal statuses are
-- one-way).
--
-- Only CANCELLED / EXPIRED / NO_SHOW are handled. COMPLETED is deliberately
-- excluded: complete_booking() moves the unit to IN_ORDER / NEEDS_CLEANING and
-- mark_unit_ready() is what returns it to AVAILABLE, so the cleaning step in the
-- staff workflow is preserved.
--
-- This replaces the trigger and function from 0010/0011, which now handles two
-- concerns, so both are renamed to say so.

drop trigger if exists bookings_restore_stock on public.bookings;
drop function if exists public.restore_snack_stock_on_end();

create or replace function public.handle_booking_ended()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_released text;
begin
  -- Return reserved snack stock: the customer never received it.
  insert into inventory_movements (snack_id, movement_type, qty_delta, reason, booking_id, actor_id)
  select bi.snack_id,
         'IN',
         bi.quantity,
         'booking ' || new.booking_code || ' ' || new.status::text,
         new.booking_id,
         new.created_by
    from booking_items bi
   where bi.booking_id = new.booking_id
     and bi.item_type = 'SNACK'
     and bi.snack_id is not null;

  -- Hand the console back. Guarded so it only ever moves BOOKED, never stomps a
  -- unit a staff member has already put into maintenance or offline.
  -- RETURNING only yields a row when a row was really updated, so the history
  -- entry below cannot claim a release that did not happen.
  update units
     set status = 'AVAILABLE'
   where unit_id = new.unit_id
     and status = 'BOOKED'
  returning unit_id into v_released;

  if v_released is not null then
    insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id, actor_id)
    values (v_released, 'BOOKED', 'AVAILABLE',
            'booking ' || new.booking_code || ' ' || new.status::text,
            new.booking_id, new.created_by);
  end if;

  return new;
end;
$$;

create trigger bookings_on_ended
  after update of status on public.bookings
  for each row
  when (new.status in ('CANCELLED', 'EXPIRED', 'NO_SHOW')
        and old.status not in ('CANCELLED', 'EXPIRED', 'NO_SHOW'))
  execute function public.handle_booking_ended();

-- Repair units stranded before this migration.
--
-- No time condition here, deliberately: these bookings reached a terminal status
-- before the trigger existed, so the release was missed entirely. A CANCELLED
-- or NO_SHOW booking frees the console the moment it is cancelled, not when the
-- original slot would have ended, so gating on scheduled_end_at < now() would
-- strand exactly the units whose window has not elapsed yet.
update units u
   set status = 'AVAILABLE'
  from bookings b
 where b.unit_id = u.unit_id
   and u.status = 'BOOKED'
   and b.status in ('CANCELLED', 'EXPIRED', 'NO_SHOW');

insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
select u.unit_id, 'BOOKED', 'AVAILABLE', 'repaired: booking ended unserved', b.booking_id
  from units u
  join bookings b on b.unit_id = u.unit_id
 where u.status = 'AVAILABLE'
   and b.status in ('CANCELLED', 'EXPIRED', 'NO_SHOW')
   and not exists (
     select 1 from unit_status_history h
      where h.unit_id = u.unit_id and h.booking_id = b.booking_id and h.to_status = 'AVAILABLE'
   );
