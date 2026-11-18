# Suka Ria Rental PS

Aplikasi penyewaan PlayStation untuk Klub Sukaria (Tanjungpinang, Kepulauan Riau).
Satu basis kode melayani tiga permukaan:

- **Pelanggan** — katalog game, ketersediaan unit live, booking online, perpanjangan sesi, pembayaran QRIS, tiket, turnamen, feedback.
- **Kasir / staf** — dashboard admin: booking, walk-in, unit, harga, snack, promo, laporan, audit log.
- **Sistem** — Supabase (Postgres + Auth + Storage + Realtime), antrean notifikasi WhatsApp, RUM web vitals.

## Stack

| Lapisan | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router, React Server Components) |
| UI | React 19, Tailwind CSS v4 |
| Bahasa | TypeScript (strict) |
| Data | Supabase (PostgreSQL, Auth, Storage, Realtime) |
| Validasi | Zod |
| Ekspor | ExcelJS, generator CSV internal |
| Test | Vitest (unit + integrasi) |

## Prasyarat

- Node.js 22 atau lebih baru
- npm
- Sebuah proyek Supabase

## Setup lokal

```bash
npm ci
# 1) isi environment
cp .env.example .env.local     # lalu lengkapi nilainya
# 2) terapkan skema ke database, berurutan 0001 → 0047
#    (Supabase CLI, MCP server, atau psql) lalu seed:
#      supabase/migrations/*.sql   (urut)
#      supabase/seed.sql
# 3) buat akun owner pertama
node --env-file=.env.local scripts/bootstrap-owner.mjs
# 4) jalankan
npm run dev
```

Skrip bantu untuk skema:

```bash
node scripts/run-migrations.mjs supabase/migrations/0042_*.sql             # validasi (rollback)
node scripts/run-migrations.mjs --apply supabase/migrations/0042_*.sql     # terapkan
```

Buka <http://localhost:3000>. Dashboard admin di `/admin`, login di `/login`.

## Environment

Semua variabel dijelaskan di [`.env.example`](./.env.example). Yang **wajib**:

| Variabel | Keterangan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (aman di browser, dilindungi RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only.** Melewati RLS; jangan pernah bocor ke browser |
| `NEXT_PUBLIC_SITE_URL` | URL publik; untuk share preview & tautan QR absolut |
| `QRIS_STATIC_STRING` | Payload QRIS statis yang diubah jadi nominal dinamis |

Opsional: `WA_API_KEY` + `WA_PROVIDER` (notifikasi WhatsApp), `ADMIN_BOOTSTRAP_*` (skrip bootstrap owner), `TEST_DATABASE_URL` (test integrasi).

Environment divalidasi saat dipakai (`src/lib/env.ts`); nilai yang salah memberi pesan yang menyebut nama variabelnya, bukan error library.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan |
| `npm run build` | Build produksi |
| `npm start` | Jalankan hasil build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Vitest (satu kali) |
| `npm run test:watch` | Vitest watch |

## Testing

`tests/` berisi unit test murni dan integration test yang menembak database/Supabase sungguhan.
Integration test **di-skip otomatis** kecuali kredensialnya tersedia:

- `.env.test` → `TEST_DATABASE_URL` (untuk suite availability/booking via `pg`)
- `.env.test` → `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY` (untuk suite admin via harness)

`tests/setup.ts` **hanya** memuat `.env.test` — tidak pernah `.env.local`. File `.env.local`
biasanya menunjuk project produksi, dan test yang menulis ke sana mengubah data pelanggan
sungguhan.

> **Penting:** pakai project Supabase **terpisah** untuk test. `.env.test` pada repo ini
> masih menunjuk project yang sama dengan aplikasi, jadi `npm test` menulis ke database
> yang sama. Setelah test, bersihkan sisa fixture:
>
> ```bash
> node scripts/cleanup-test-data.mjs            # laporan
> node scripts/cleanup-test-data.mjs --apply    # hapus
> ```
>
> Skrip itu hanya menghapus customer fixture yang **tidak punya booking**; data yang
> punya booking tidak disentuh.

CI (`.github/workflows/ci.yml`) menjalankan `lint` + `typecheck`, lalu `build` + Lighthouse,
dan job `test` yang menjalankan suite penuh di Supabase lokal. Job test memakai secrets
`SB_TEST_ANON_KEY` / `SB_TEST_SERVICE_ROLE_KEY` / `SB_TEST_PROJECT_REF` — isi dengan
kredensial project uji, bukan produksi.

## Migrasi database

SQL tinggal di [`supabase/migrations/`](./supabase/migrations) dan **harus diterapkan berurutan** `0001` → `0047`. Beberapa catatan:

- `0035` mencabut `EXECUTE` dari fungsi `SECURITY DEFINER` internal dan memasang default-privileges yang menutup fungsi baru secara default. **Fungsi baru yang harus bisa dipanggil klien wajib di-`GRANT` eksplisit** (lihat pola di `0035`).
- `0037` mengganti generator kode booking/tiket dengan `gen_random_bytes` (acak kriptografis) dan menegakkan satu pembayaran hidup per booking.
- `0038`–`0042` menambahkan aturan uang & anti-abuse: refund atomik saat pembatalan
  (`cancel_booking` + `payments.refunded_at`), walk-in satu transaksi
  (`create_walk_in_booking` — lalu dihapus lagi di `0043`), rate limiter & lockout di
  Postgres, normalisasi nomor telepon, dan grant publik untuk `slot_availability`.
- `0043` menghapus fitur walk-in (fungsi `create_walk_in_booking`).
- `0044` menyiapkan Realtime admin: policy SELECT bukti bayar untuk staf,
  `bookings`/`payment_proofs` masuk publication, dan `REPLICA IDENTITY FULL`.
- `0045` menambahkan rentang blok pada `slot_availability` (`busy_from`, `busy_until`,
  `busy_kind`) supaya pemilih jam bisa menulis "18.00–20.00 dipesan · kosong 20.30"
  alih-alih "selesai 20.00" di setiap kotak, dan memperbaiki state `IN_USE` yang dulu
  tidak pernah muncul. `latest_extendable` sekarang mengembalikan **NULL** bila tidak
  ada reservasi berikutnya (unit bebas), bukan jam selesai booking itu sendiri.
- `0046` menambahkan alur perpanjangan: `request_extension()` menggeser reservasi
  `BOOKING` + `CLEANING`, memperbarui booking, mencatat `booking_extensions`
  (`CONFIRMED`), lalu membuat pembayaran `PENDING` dengan `extension_id`.
  `cancel_extension()` membalik semuanya. `complete_booking()` melunasi pembayaran
  perpanjangan saat check-out, dan `cancel_booking()` ikut me-refund-nya — tanpa itu
  uang tambahan jam tidak pernah masuk laporan atau malah hilang saat batal.
- `0047` menambahkan `payment_proofs.extension_id`: bukti bayar untuk satu
  perpanjangan (QRIS), terpisah dari bukti pembayaran booking. `booking_id` tetap
  diisi supaya bukti tampil di baris booking yang sama pada layar kasir.
- **PL/pgSQL gotcha yang pernah menggigit:** `RETURN QUERY` menambah baris ke hasil tapi
  **tidak menghentikan fungsi**. Setiap cabang `RETURN` perlu diikuti `RETURN;`,
  kalau tidak pemanggil membaca baris kedua yang salah.
- `supabase/seed.sql` berisi katalog awal (cabang, unit, harga, game, snack). Aman dijalankan berulang (`ON CONFLICT`).

## Struktur

```
src/
  app/
    (customer)/      halaman publik: booking, tiket, pembayaran, turnamen, dll.
    admin/           dashboard staf (dilindungi layout + getStaffUser)
    api/             route handler: booking, pembayaran, tiket, admin, vitals
  components/        UI (sebagian besar RSC)
    booking/         langkah-langkah form booking + grid slot (lazy)
  lib/               akses data, validasi, helper (env, rate-limit, csv/xlsx, ...)
  services/          pembungkus RPC/Supabase (booking, payment, tournament, user)
  middleware.ts      login wall + refresh sesi untuk /admin dan /api/admin
supabase/            migrations + seed
tests/               Vitest
scripts/             utilitas sekali-jalan (bootstrap owner, migrasi, generator metadata)
```

## Deploy

1. Deploy ke Vercel (atau Node.js apa pun).
2. **Set region fungsi ke `sin1` (Singapore)**. `vercel.json` di repo sudah menyetelnya; samakan juga di Vercel Dashboard → Settings → Functions → Region. Project Supabase ada di `ap-southeast-1` (Singapore), sedangkan default Vercel adalah `iad1` (Washington, D.C.) — selisih itu membuat setiap query DB menyeberang benua dan halaman admin terasa berdetik-detik.
3. Set environment yang sama seperti `.env.local` di dashboard hosting.
4. Build produksi **gagal cepat** jika `NEXT_PUBLIC_SUPABASE_URL` kosong/tidak valid (`next.config.ts`) — ini disengaja.
5. `images.remotePatterns` dan CSP diturunkan dari host Supabase secara otomatis, jadi berpindah proyek cukup dengan mengganti env.

## Keamanan

- **Fitur walk-in dihapus.** Semua pemesanan masuk lewat `/booking`; tidak ada jalur
  kasir yang melewati verifikasi pelanggan. RPC `create_walk_in_booking` di-drop
  (migrasi 0043); nilai enum `WALK_IN` dipertahankan untuk data historis.
- `/admin` dan `/api/admin/*` dijaga middleware (login wall) dan setiap handler memanggil `getStaffUser()` sebagai lapisan kedua.
- Service-role client ditandai `server-only`; tidak pernah masuk bundel browser.
- **Pembayaran menyatu di halaman tiket** (`/tiket/[code]`): panel memilih QRIS atau
  transfer bank, menampilkan QR atau nomor rekening, dan menerima bukti bayar di
  tempat yang sama. `/payment/[code]` dan `/payment/[code]/qris` hanya redirect.
  Konfirmasi tetap manual oleh kasir — layar tidak pernah mengaku lunas sendiri.
- **Perpanjangan jam** dijaga dua lapis: pelanggan harus memegang cookie akses tiket,
  staf harus lolos scope cabang. Keduanya memanggil RPC yang sama, dan RPC menolak
  bila unit sudah dipesan lagi (termasuk waktu pembersihan). Pelanggan memilih
  **QRIS** (bayar sekarang, boleh tanpa ke kasir) atau **tunai di kasir**; QRIS
  menerima bukti bayar per-perpanjangan dan kasir memverifikasinya, sedangkan tunai
  dilunasi saat check-out.
- **Akses tiket** butuh verifikasi 4 digit terakhir nomor telepon. Cookie httpOnly-nya
  bertanda tangan HMAC, **berkedaluwarsa di server** (bukan hanya `maxAge` browser),
  dan memuat daftar hingga 10 kode — membuka tiket kedua tidak menimpa yang pertama.
- **Halaman & API yang menyentuh data pelanggan atau uang** semuanya berada di balik
  gate yang sama: `/tiket/[code]`, `/payment/[code]`, `/payment/[code]/qris`,
  `/extension`, `POST /api/payments`, `POST /api/payments/[code]/proof`, dan
  `POST /api/bookings/[code]/cancel`. Kode saja tidak cukup.
- **Rate limit** untuk rute sensitif memakai counter di Postgres (`rate_limit_hit`,
  migrasi 0040) sehingga konsisten lintas instance serverless Vercel; kind
  non-sensitif masih memakai `Map` in-memory. Verifikasi last-4 juga dikunci
  **5 kali salah → 15 menit per kode** (`booking_access_record`), jadi brute-force
  4 digit terakhir tidak bisa diperpanjang dengan ganti IP.
- **Write path publik lewat API route**, bukan langsung ke Supabase: vote & request
  game melewati `POST /api/game-requests` dengan rate limit dan identitas voter dari
  cookie server-side. Policy `INSERT` untuk anon di `game_requests`/`game_votes`
  sudah dicabut (RLS menolak insert anon).
- **Nomor telepon dinormalisasi ke format `62…`** sebelum disimpan dan dicocokkan,
  sehingga `0812…`, `+62812…`, dan `62812…` menunjuk ke satu pelanggan yang sama.
  Nama pelanggan tidak lagi ditimpa diam-diam oleh booking berikutnya — perubahannya
  dicatat di `audit_logs`.
- **Pembatalan booking berbayar** bersifat atomik: `cancel_booking()` melepas slot
  **dan** menandai payment `PAID → REFUNDED` dalam satu transaksi, jadi laporan
  tidak lagi menghitung uang yang sudah dikembalikan sebagai pendapatan. Batal
  mandiri hanya sampai **6 jam** sebelum sesi dimulai; setelah itu diarahkan ke kasir
  (`/api/admin/refunds`).
- **Error 5xx tidak membocorkan pesan internal.** Respons publik hanya berisi pesan
  generik + `correlationId`; detailnya hanya di log server.
- Fungsi `SECURITY DEFINER` yang menyentuh uang/batal hanya bisa dipanggil
  `service_role`; RPC yang memang untuk publik di-`GRANT` eksplisit (pola di
  migrasi `0035` dan `0042`).
