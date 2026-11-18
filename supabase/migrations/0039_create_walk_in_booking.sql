-- =============================================================================
-- 0039_create_walk_in_booking.sql
--
-- Walk-in tidak boleh tiga langkah terpisah (create_booking → confirm_booking
-- → insert payments). Kalau langkah ketiga gagal, booking sudah CONFIRMED
-- tanpa catatan pembayaran. Fungsi ini melakukan ketiganya dalam satu
-- transaksi: ia memanggil create_booking() (yang sudah atomik), lalu
-- confirm_booking(), lalu insert payments — semua dalam satu transaksi
-- sehingga rollback bersih bila satu langkah gagal.
-- =============================================================================

create or replace function public.create_walk_in_booking(
  p_branch_id        text,
  p_unit_id          text,
  p_customer_name    text,
  p_customer_phone   text,
  p_start_at         timestamptz default null,
  p_duration_minutes integer default 60,
  p_customer_email   text default null,
  p_game_id          text default null,
  p_snacks           jsonb default '[]'::jsonb,
  p_created_by       uuid default null,
  p_notes            text default null,
  p_promotion_id     text default null,
  p_pay_method       text default null
)
returns table (
  booking_id text,
  booking_code text,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  total_amount integer,
  payment_deadline_at timestamptz,
  status booking_status,
  payment_status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking record;
  v_status booking_status;
begin
  if p_pay_method not in ('CASH', 'QRIS_MANUAL', 'TRANSFER_MANUAL') then
    raise exception 'metode pembayaran walk-in tidak dikenal: %', p_pay_method using errcode = '22023';
  end if;

  select * into v_booking from public.create_booking(
    p_branch_id, p_unit_id, p_customer_name, p_customer_phone, p_start_at,
    p_duration_minutes, p_customer_email, p_game_id, p_snacks, 'WALK_IN'::booking_source,
    p_created_by, p_notes, p_promotion_id
  );

  v_status := public.confirm_booking(v_booking.booking_id);

  -- Satu insert pembayaran di transaksi yang sama. Gagal di sini = rollback
  -- booking + konfirmasi + reservasi semuanya.
  insert into public.payments (booking_id, provider, method, status, gross_amount, paid_at)
  values (
    v_booking.booking_id,
    case when p_pay_method = 'CASH' then 'CASH'::payment_provider else 'MANUAL'::payment_provider end,
    p_pay_method::payment_method,
    'PAID'::payment_status,
    v_booking.total_amount,
    now()
  );

  return query
    select v_booking.booking_id, v_booking.booking_code, v_booking.scheduled_start_at,
           v_booking.scheduled_end_at, v_booking.total_amount, v_booking.payment_deadline_at,
           v_status, 'PAID'::text;
end;
$$;

revoke execute on function public.create_walk_in_booking(
  text, text, text, text, timestamptz, integer, text, text, jsonb, uuid, text, text, text
) from anon, authenticated, public;
grant execute on function public.create_walk_in_booking(
  text, text, text, text, timestamptz, integer, text, text, jsonb, uuid, text, text, text
) to service_role;
