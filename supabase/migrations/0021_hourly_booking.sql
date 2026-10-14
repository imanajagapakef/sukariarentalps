-- =============================================================================
-- 0021_hourly_booking.sql
--
-- Durasi sewa jadi kelipatan 1 jam; opsi 30 menit dihapus.
--
-- booking_interval_minutes_doinya dua hal sekaligus: step durasi booking dan
-- granularitas jam mulai pada slot grid. Mengubahnya ke 60 membuat keduanya
-- konsisten per jam — grid slot turun dari 48 (tiap 30 menit) jadi 24.
--
-- Tidak ada perubahan pricing: pricing_rules hanya punya tier HOURLY 60 dan
-- PACKAGE 120/180/240/360, jadi durasi 30/90/150 menit yang sebelumnya
-- diprorate dari tarif hourly tidak pernah punya baris harga sendiri.
--
-- Booking lama yang berdurasi non-kelipatan-60 tetap utuh dan tetap tampil
-- apa adanya lewat format durasi.
-- =============================================================================

-- Tanpa WHERE: ikut mencakup baris default global (branch_id is null) supaya
-- cabang baru mewarisi aturan yang sama.
update booking_config set booking_interval_minutes  = 60;
update booking_config set extension_interval_minutes = 60;
update booking_config set minimum_extension_minutes  = 60;