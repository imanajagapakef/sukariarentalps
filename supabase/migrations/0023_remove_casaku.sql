-- =============================================================================
-- 0023_remove_casaku.sql
--
-- Casaku dihapus. Pelunasan sekarang murni manual: pelanggan menyetor QRIS
-- (QR tetap dibuat lokal dari QRIS_STATIC_STRING), kasir memverifikasi lalu
-- menekan "Konfirmasi" di /admin/bookings.
--
-- expire_bookings() sekarang ikut menandai payment PENDING milik booking yang
-- baru kedaluwarsa. Sebelumnya itu dilakukan webhook Casaku lewat
-- mapCasakuStatus('expired'). Tanpa itu payment menggantung PENDING selamanya
-- karena tidak ada jalur lain yang menuliskannya. Revenue tidak menghitung
-- PENDING, jadi tidak ada galat uang - hanya kolom yang jadi noise.
--
-- Tidak ada drop value untuk enum CASAKU_*. Host ini menolak dengan
-- "0A000: dropping an enum value is not implemented", jadi nilai
-- payment_method CASAKU_* dan payment_provider CASAKU masih ada di database.
-- Tidak ada baris yang memakainya (dicek 0 baris sebelum migrasi ini) dan
-- tidak ada kode yang lagi menuliskannya. Kalau host-nya diganti ke Postgres
-- murni, drop value bisa dijalankan terpisah; di host ini tidak bisa.
-- Nilai MIDTRANS_* juga dibiarkan: enum itu masih dipakai kode meski
-- webhook-nya sudah tidak ada.
-- =============================================================================

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
  ),
  expire_payments as (
    update payments p
       set status = 'EXPIRED'
      from doomed d
     where p.booking_id = d.booking_id
       and p.status = 'PENDING'
    returning 1
  )
  select count(*) into expired_count from doomed;

  return expired_count;
end;
$$;

revoke execute on function public.expire_bookings() from anon, authenticated, public;