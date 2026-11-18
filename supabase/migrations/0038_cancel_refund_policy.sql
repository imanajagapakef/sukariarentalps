-- =============================================================================
-- 0038_cancel_refund_policy.sql
--
-- Pembatalan booking berbayar kini punya aturan uang: batal melepas slot DAN
-- mengembalikan payment PAID dalam transaksi yang sama. Jalur pelanggan hanya
-- boleh batal jika masih H-6 jam sebelum sesi dimulai (p_enforce_window=true,
-- default false untuk jalur admin/kasir).
-- =============================================================================

alter table public.payments
  add column if not exists refunded_at timestamptz;

-- Changing the signature creates an overload, so drop the old function first.
drop function if exists public.cancel_booking(text, text);

create or replace function public.cancel_booking(
  p_booking_id text,
  p_reason text default null,
  p_enforce_window boolean default false
)
returns booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status not in ('DRAFT', 'WAITING_PAYMENT', 'CONFIRMED') then
    raise exception 'booking % tidak bisa dibatalkan dari status %', p_booking_id, v_booking.status using errcode = '22023';
  end if;

  -- Jalur pelanggan: tolak bila sudah kurang dari 6 jam ke sesi.
  if p_enforce_window and v_booking.scheduled_start_at - now() < interval '6 hours' then
    raise exception 'pembatalan mandiri ditutup: sesi dimulai kurang dari 6 jam lagi. Hubungi kasir untuk refund lewat /api/admin/refunds' using errcode = '22023';
  end if;

  update bookings
     set status = 'CANCELLED', cancelled_reason = p_reason
   where booking_id = p_booking_id;

  delete from unit_reservations where booking_id = p_booking_id;

  if v_booking.status = 'CONFIRMED' then
    update units set status = 'AVAILABLE' where unit_id = v_booking.unit_id and status = 'BOOKED';
    insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
    values (v_booking.unit_id, 'BOOKED', 'AVAILABLE', 'booking dibatalkan', p_booking_id);
  end if;

  -- Refund atomik: uang yang sudah masuk tidak boleh tetap berstatus PAID
  -- pada booking yang batal (laporan menghitung PAID sebagai pendapatan).
  update payments
     set status = 'REFUNDED', refunded_at = now()
   where booking_id = p_booking_id
     and status in ('PAID', 'PARTIALLY_REFUNDED');

  return 'CANCELLED';
end;
$$;

revoke execute on function public.cancel_booking(text, text, boolean) from anon, authenticated, public;
grant execute on function public.cancel_booking(text, text, boolean) to service_role;
