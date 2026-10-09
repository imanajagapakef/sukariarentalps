-- Narrow the stock-reversal guard so it fires only when a booking ENTERS a
-- terminal state, not when one terminal state is rewritten to another.
--
-- 0010 guarded with `old.status is distinct from new.status`, which still fires
-- on EXPIRED -> CANCELLED: both values differ and CANCELLED is in the list, so
-- the snack stock came back a second time (regression test asserts a booking
-- that walks CANCELLED -> EXPIRED -> CANCELLED only restores once).
--
-- Nothing in the RPC state machine performs that transition today
-- (cancel_booking only accepts DRAFT/WAITING_PAYMENT/CONFIRMED), so this was
-- latent rather than live. It is fixed because the trigger fires off a raw
-- UPDATE on bookings.status, which an admin query or a future migration can do
-- directly.

drop trigger if exists bookings_restore_stock on public.bookings;

create trigger bookings_restore_stock
  after update of status on public.bookings
  for each row
  when (new.status in ('CANCELLED', 'EXPIRED', 'NO_SHOW')
        and old.status not in ('CANCELLED', 'EXPIRED', 'NO_SHOW'))
  execute function public.restore_snack_stock_on_end();
