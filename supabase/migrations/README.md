# Migrations

File di folder ini **diterapkan berurutan secara manual**: `0001` → `0037`, lalu
`../seed.sql`. Nama file sengaja memakai nomor urut (bukan timestamp Supabase CLI),
karena proyek ini menerapkan migrasi lewat MCP/psql, bukan `supabase db push`.

## Aturan

1. **Jangan mengubah migrasi yang sudah diterapkan.** Perbaikan = file bernomor baru.
2. **Fungsi baru wajib di-`GRANT` eksplisit.** Migrasi `0035` memasang default
   privileges yang menutup `EXECUTE` untuk `public/anon/authenticated`, jadi fungsi
   yang harus dipanggil klien perlu `GRANT EXECUTE ... TO anon, authenticated;` dan
   `TO service_role` bila dipanggil lewat service role.
3. `0036` mengunci fungsi internal (trigger/helper) dan mem-pin `search_path`.
4. `0037` memakai `gen_random_bytes` untuk kode booking/tiket dan menambahkan unique
   index satu pembayaran hidup per booking.

## Catatan riwayat

Tabel `supabase_migrations.schema_migrations` di proyek saat ini mencatat sebagian
migrasi dengan timestamp (hasil `apply_migration`), sementara `0025`–`0033` pernah
diterapkan langsung sehingga tidak muncul di riwayat. **Skema database adalah sumber
kebenaran**; riwayat itu hanya metadata. Karena itu tabel riwayat sengaja tidak diubah.

Untuk proyek Supabase **baru**, cukup jalankan semua file di folder ini berurutan lalu
`seed.sql`. Hasil akhirnya sama dengan database yang sekarang.