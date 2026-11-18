-- =============================================================================
-- 0043_remove_walk_in.sql
--
-- Fitur walk-in dihapus atas permintaan pemilik: semua pemesanan harus datang
-- dari pelanggan lewat /booking, supaya tidak ada jalur yang melewati
-- verifikasi pelanggan dan supaya laporan punya satu sumber.
--
-- Yang dihapus: RPC create_walk_in_booking() (migrasi 0039).
-- Yang DIPERTAHANKAN: nilai enum `booking_source` = 'WALK_IN' dan baris lama
-- yang memakainya — menghapus nilai enum akan merusak data historis dan
-- laporan periode lalu. Booking baru tidak akan pernah memakai nilai itu lagi
-- karena satu-satunya pembuatnya (RPC ini) sudah dihapus.
-- =============================================================================

drop function if exists public.create_walk_in_booking(
  text, text, text, text, timestamptz, integer, text, text, jsonb, uuid, text, text, text
);