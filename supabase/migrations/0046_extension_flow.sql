-- =============================================================================
-- 0046_extension_flow.sql
--
-- Alur perpanjangan (model A): kasir maupun pelanggan boleh menambah jam, dan
-- slot langsung dikunci kalau unit memang kosong. Sebelum ini tidak ada satu pun
-- jalur yang mengubah jam — halaman /extension hanya mengirim pesan WhatsApp,
-- sementara kasir tidak punya tombol untuk mengeksekusinya.
--
-- Kontrak:
--   request_extension(booking, menit)
--     - hanya untuk status CONFIRMED / CHECKED_IN / IN_USE
--     - menit kelipatan extension_interval_minutes dan >= minimum_extension_minutes
--     - total durasi tidak melebihi maximum_duration_minutes
--     - unit harus kosong dari akhir sesi sampai (akhir baru + waktu pembersihan)
--     - atomik: geser reservasi BOOKING + CLEANING, update booking, catat
--       booking_extensions (CONFIRMED) dan payments (PENDING).
--   cancel_extension(extension)
--     - hanya extension terakhir yang masih CONFIRMED
--     - mengembalikan jam, reservasi, dan status pembayaran.
--
-- Uang:
--   - Payment extension dibuat PENDING. Saat kasir menekan "Selesai (check-out)",
--     complete_booking() melunasinya — uang diterima di kasir pada saat itu.
--   - cancel_booking() ikut me-refund pembayaran extension, bukan hanya
--     pembayaran booking, supaya laporan tidak menghitung uang yang sudah kembali.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- request_extension
-- ---------------------------------------------------------------------------
create or replace function public.request_extension(
  p_booking_id   text,
  p_minutes      integer,
  p_method       payment_method default 'TRANSFER_MANUAL',
  p_requested_by uuid default null
)
returns table (
  extension_id    text,
  previous_end_at timestamptz,
  new_end_at      timestamptz,
  amount          integer,
  payment_id      text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking  bookings;
  v_unit     units;
  v_cfg      booking_config;
  v_boundary timestamptz;
  v_new_end  timestamptz;
  v_amount   integer;
  v_cleaning integer;
  v_interval integer;
  v_minimum  integer;
  v_ext      text;
  v_pay      text;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status not in ('CONFIRMED', 'CHECKED_IN', 'IN_USE') then
    raise exception 'booking berstatus % belum bisa diperpanjang', v_booking.status
      using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'durasi perpanjangan harus lebih dari 0 menit' using errcode = '22023';
  end if;

  select * into v_cfg from get_booking_config(v_booking.branch_id);
  v_interval := coalesce(v_cfg.extension_interval_minutes, 60);
  v_minimum  := coalesce(v_cfg.minimum_extension_minutes, 60);
  v_cleaning := coalesce(v_cfg.cleaning_duration_minutes, 0);

  if p_minutes < v_minimum then
    raise exception 'minimum perpanjangan % menit', v_minimum using errcode = '22023';
  end if;
  if p_minutes % v_interval <> 0 then
    raise exception 'perpanjangan harus kelipatan % menit', v_interval using errcode = '22023';
  end if;
  if v_booking.duration_minutes + p_minutes > coalesce(v_cfg.maximum_duration_minutes, 360) then
    raise exception 'total durasi melebihi batas % menit', v_cfg.maximum_duration_minutes
      using errcode = '22023';
  end if;

  select * into v_unit from units where unit_id = v_booking.unit_id;
  if v_unit.unit_id is null then
    raise exception 'unit booking tidak ditemukan' using errcode = '22023';
  end if;
  if v_unit.status in ('MAINTENANCE', 'OFFLINE') then
    raise exception 'unit sedang % — tidak bisa diperpanjang', lower(v_unit.status::text)
      using errcode = '22023';
  end if;

  v_new_end := v_booking.scheduled_end_at + make_interval(mins => p_minutes);
  v_boundary := latest_extendable(p_booking_id);

  -- NULL = tidak ada reservasi berikutnya. Kalau ada, sesi baru harus selesai
  -- DAN pembersihannya harus kelar sebelum reservasi berikutnya mulai.
  if v_boundary is not null
     and v_new_end + make_interval(mins => v_cleaning) > v_boundary then
    raise exception 'unit sudah dipesan mulai % — tidak ada ruang untuk % menit',
      to_char(v_boundary at time zone 'Asia/Jakarta', 'HH24:MI'), p_minutes
      using errcode = '22023';
  end if;

  v_amount := calculate_price(v_booking.branch_id, v_unit.facility_type_id, p_minutes);

  -- 1) Pindahkan jendela pembersihan lebih dulu. Kalau booking dipanjangkan
  --    dulu, blok baru akan bertabrakan dengan reservasi CLEANING yang lama
  --    (exclusion constraint langsung menolak).
  update unit_reservations
     set period = tstzrange(v_new_end, v_new_end + make_interval(mins => v_cleaning), '[)')
   where booking_id = p_booking_id
     and kind = 'CLEANING';

  -- 2) Panjangkan blok booking.
  update unit_reservations
     set period = tstzrange(lower(period), v_new_end, '[)')
   where booking_id = p_booking_id
     and kind = 'BOOKING';

  -- 3) Booking.
  update bookings
     set scheduled_end_at = v_new_end,
         duration_minutes = duration_minutes + p_minutes,
         total_amount     = total_amount + v_amount
   where booking_id = p_booking_id;

  -- 4) Catatan perpanjangan.
  insert into booking_extensions
    (booking_id, status, previous_end_at, requested_minutes, new_end_at, amount, requested_by)
  values
    (p_booking_id, 'CONFIRMED', v_booking.scheduled_end_at, p_minutes, v_new_end, v_amount, p_requested_by)
  returning booking_extensions.extension_id into v_ext;

  -- 5) Pembayaran. PENDING sampai kasir menerima uang (otomatis saat check-out).
  insert into payments (extension_id, provider, method, status, gross_amount)
  values (v_ext, 'MANUAL', p_method, 'PENDING', v_amount)
  returning payments.payment_id into v_pay;

  return query select v_ext, v_booking.scheduled_end_at, v_new_end, v_amount, v_pay;
end;
$$;

revoke execute on function public.request_extension(text, integer, payment_method, uuid)
  from anon, authenticated, public;
grant execute on function public.request_extension(text, integer, payment_method, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- cancel_extension
-- ---------------------------------------------------------------------------
create or replace function public.cancel_extension(
  p_extension_id text,
  p_reason       text default null
)
returns extension_status
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ext      booking_extensions;
  v_booking  bookings;
  v_cfg      booking_config;
  v_cleaning integer;
  v_latest   timestamptz;
begin
  select * into v_ext from booking_extensions where extension_id = p_extension_id for update;
  if v_ext.extension_id is null then
    raise exception 'extension % tidak ditemukan', p_extension_id using errcode = '22023';
  end if;
  if v_ext.status <> 'CONFIRMED' then
    raise exception 'extension berstatus % tidak bisa dibatalkan', v_ext.status
      using errcode = '22023';
  end if;

  select * into v_booking from bookings where booking_id = v_ext.booking_id for update;
  if v_booking.scheduled_end_at <> v_ext.new_end_at then
    raise exception 'batalkan perpanjangan terakhir lebih dulu' using errcode = '22023';
  end if;

  select * into v_cfg from get_booking_config(v_booking.branch_id);
  v_cleaning := coalesce(v_cfg.cleaning_duration_minutes, 0);

  -- Kecilkan blok booking dulu, baru pindahkan pembersihan: urutan sebaliknya
  -- membuat dua rentang itu bertabrakan sesaat dan ditolak constraint.
  update unit_reservations
     set period = tstzrange(lower(period), v_ext.previous_end_at, '[)')
   where booking_id = v_ext.booking_id
     and kind = 'BOOKING';

  update unit_reservations
     set period = tstzrange(
       v_ext.previous_end_at,
       v_ext.previous_end_at + make_interval(mins => v_cleaning),
       '[)'
     )
   where booking_id = v_ext.booking_id
     and kind = 'CLEANING';

  update bookings
     set scheduled_end_at = v_ext.previous_end_at,
         duration_minutes = greatest(0, duration_minutes - v_ext.requested_minutes),
         total_amount     = greatest(0, total_amount - v_ext.amount)
   where booking_id = v_ext.booking_id;

  update booking_extensions
     set status = 'CANCELLED',
         rejected_reason = coalesce(p_reason, rejected_reason)
   where extension_id = p_extension_id;

  -- Uang yang belum diterima dibatalkan; yang sudah masuk dikembalikan.
  update payments
     set status = case when status = 'PAID' then 'REFUNDED'::payment_status
                       else 'FAILED'::payment_status end,
         refunded_at = case when status = 'PAID' then now() else refunded_at end
   where extension_id = p_extension_id
     and status in ('PENDING', 'PAID', 'PARTIALLY_REFUNDED');

  return 'CANCELLED';
end;
$$;

revoke execute on function public.cancel_extension(text, text)
  from anon, authenticated, public;
grant execute on function public.cancel_extension(text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- complete_booking: lunasi pembayaran extension saat check-out
-- ---------------------------------------------------------------------------
-- Salinan 0007 + satu blok: tambahan jam yang belum dibayar dianggap diterima
-- kasir pada saat check-out. Tanpa ini, pembayaran extension menggantung
-- PENDING selamanya dan laporan tidak pernah melihat uangnya.
create or replace function public.complete_booking(p_booking_id text)
returns booking_status
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking bookings;
begin
  select * into v_booking from bookings where booking_id = p_booking_id for update;
  if v_booking.booking_id is null then
    raise exception 'booking % tidak ditemukan', p_booking_id using errcode = '22023';
  end if;
  if v_booking.status <> 'IN_USE' then
    raise exception 'booking % tidak bisa diselesaikan dari status %', p_booking_id, v_booking.status using errcode = '22023';
  end if;

  update bookings
     set status = 'COMPLETED',
         actual_end_at = now()
   where booking_id = p_booking_id;

  -- Uang tambahan jam diterima di kasir saat check-out.
  update payments
     set status = 'PAID',
         paid_at = coalesce(paid_at, now())
   where extension_id in (
           select extension_id from booking_extensions where booking_id = p_booking_id
         )
     and status = 'PENDING';

  update units set status = 'IN_ORDER', condition = 'NEEDS_CLEANING' where unit_id = v_booking.unit_id;
  insert into unit_status_history (unit_id, from_status, to_status, reason, booking_id)
  values (v_booking.unit_id, 'IN_USE', 'IN_ORDER', 'check-out', p_booking_id);

  update customers
     set total_booking = total_booking + 1,
         total_spending = total_spending + v_booking.total_amount,
         last_booking_at = now(),
         first_booking_at = coalesce(first_booking_at, now())
   where customer_id = v_booking.customer_id;

  return 'COMPLETED';
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_booking: refund juga pembayaran extension
-- ---------------------------------------------------------------------------
-- Salinan 0038 + satu blok: pembayaran extension tidak punya booking_id
-- (payments_owner_xor), jadi blok refund lama melewatkannya.
create or replace function public.cancel_booking(
  p_booking_id text,
  p_reason text default null,
  p_enforce_window boolean default false
)
returns booking_status
language plpgsql
security definer
set search_path = public, extensions
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

  update payments
     set status = 'REFUNDED', refunded_at = now()
   where booking_id = p_booking_id
     and status in ('PAID', 'PARTIALLY_REFUNDED');

  -- Perpanjangan yang sudah dibayar ikut dikembalikan; yang masih PENDING
  -- dibatalkan (tidak ada uang yang berpindah).
  update payments
     set status = 'REFUNDED', refunded_at = now()
   where extension_id in (
           select extension_id from booking_extensions where booking_id = p_booking_id
         )
     and status in ('PAID', 'PARTIALLY_REFUNDED');

  update payments
     set status = 'FAILED'
   where extension_id in (
           select extension_id from booking_extensions where booking_id = p_booking_id
         )
     and status = 'PENDING';

  update booking_extensions
     set status = 'CANCELLED'
   where booking_id = p_booking_id
     and status = 'CONFIRMED';

  return 'CANCELLED';
end;
$$;

revoke execute on function public.cancel_booking(text, text, boolean) from anon, authenticated, public;
grant execute on function public.cancel_booking(text, text, boolean) to service_role;