-- =============================================================================
-- 0027_booking_ready_status.sql
--
-- Tambah status booking READY ("Siap") sehingga aksi "Unit Siap" di admin
-- bookings tidak hanya mengembalikan unit ke AVAILABLE, tetapi juga menyelesaikan
-- booking itu sendiri. Tanpa ini booking tetap COMPLETED permanen dan tombol
-- "Unit Siap" muncul kembali setiap kali halaman direfresh.
--
-- Urutan di enum PostgreSQL menempatkan READY setelah COMPLETED: alurnya adalah
-- COMPLETED --(mark_unit_ready)--> READY, lalu READY dianggap terminal untuk
-- tampilan laporan dan tidak punya aksi lanjutan di kolom Aksi.
-- =============================================================================

-- "if not exists" so a re-run is harmless: this repo applies migrations by hand and
-- the CLI history (supabase_migrations.schema_migrations) is not in sync with these files.
alter type public.booking_status add value if not exists 'READY' after 'COMPLETED';
