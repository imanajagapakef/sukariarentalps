# Suka Ria Rental PS - Master Dataset v0.1

Status: DRAFT / INTERNAL

Dataset ini dibuat dari data yang diberikan dalam percakapan + data provisional untuk kebutuhan development.

## Status data
- SOURCE = berasal dari materi/data yang diberikan.
- DRAFT = nilai sementara untuk development/testing.
- RESEARCH_REQUIRED = perlu riset game sebelum ditampilkan sebagai katalog publik.
- VERIFY = perlu verifikasi judul/platform/data.

## Ringkasan
- Cabang: 2
- Unit draft: 23
- Game master: 58
- Game availability records: 77
- Snack draft: 12

## File
- `seed.sql` = seed draft untuk schema database yang akan difinalkan.
- `json/` = master data JSON.
- `csv/` = master data CSV.
- `README.md` = catatan dataset.

## Catatan penting
1. Jumlah unit dan harga tambahan yang belum dikonfirmasi owner sengaja diberi status `DRAFT`.
2. Harga yang berasal dari poster disimpan dengan tanggal sumber 2025, bukan dianggap sebagai harga aktif saat ini.
3. Detail game seperti genre, player count, multiplayer, developer, publisher, dan release date belum diisi penuh. Itu masuk fase Game Research.
4. Beberapa judul dari poster yang tidak terbaca jelas tidak dipaksakan menjadi nama resmi.
5. `seed.sql` belum boleh dianggap migration production. Schema final perlu dikunci dulu.

## Next step teknis
1. Finalisasi schema PostgreSQL.
2. Buat migration.
3. Sesuaikan `seed.sql` dengan migration final.
4. Import JSON/CSV sebagai master-data source.
5. Jalankan seed di Supabase development.
6. Setelah owner mengonfirmasi data, ubah record `DRAFT` menjadi data resmi.
