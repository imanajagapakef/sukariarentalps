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
# 2) terapkan skema ke database, berurutan 0001 → 0037
#    (Supabase CLI, MCP server, atau psql) lalu seed:
#      supabase/migrations/*.sql   (urut)
#      supabase/seed.sql
# 3) buat akun owner pertama
node --env-file=.env.local scripts/bootstrap-owner.mjs
# 4) jalankan
npm run dev
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
- `.env.local` → `ADMIN_BOOTSTRAP_EMAIL` + `ADMIN_BOOTSTRAP_PASSWORD` (untuk suite admin via harness)

CI (`.github/workflows/ci.yml`) menjalankan `lint` + `typecheck`, lalu `build` + Lighthouse. Test integrasi dijalankan lokal.

## Migrasi database

SQL tinggal di [`supabase/migrations/`](./supabase/migrations) dan **harus diterapkan berurutan** `0001` → `0037`. Beberapa catatan:

- `0035` mencabut `EXECUTE` dari fungsi `SECURITY DEFINER` internal dan memasang default-privileges yang menutup fungsi baru secara default. **Fungsi baru yang harus bisa dipanggil klien wajib di-`GRANT` eksplisit** (lihat pola di `0035`).
- `0037` mengganti generator kode booking/tiket dengan `gen_random_bytes` (acak kriptografis) dan menegakkan satu pembayaran hidup per booking.
- `supabase/seed.sql` berisi katalog awal (cabang, unit, harga, game, snack). Aman dijalankan berulang (`ON CONFLICT`).

## Struktur

```
src/
  app/
    (customer)/      halaman publik: booking, tiket, pembayaran, turnamen, dll.
    admin/           dashboard staf (dilindungi layout + getStaffUser)
    api/             route handler: booking, pembayaran, tiket, admin, vitals
  components/        UI (sebagian besar RSC)
  lib/               akses data, validasi, helper (env, rate-limit, csv/xlsx, ...)
  services/          pembungkus RPC/Supabase (booking, payment, tournament, user)
  middleware.ts      login wall + refresh sesi untuk /admin dan /api/admin
supabase/            migrations + seed
tests/               Vitest
scripts/             utilitas sekali-jalan (bootstrap owner, generator metadata)
```

## Deploy

1. Deploy ke Vercel (atau Node.js apa pun).
2. Set environment yang sama seperti `.env.local` di dashboard hosting.
3. Build produksi **gagal cepat** jika `NEXT_PUBLIC_SUPABASE_URL` kosong/tidak valid (`next.config.ts`) — ini disengaja.
4. `images.remotePatterns` dan CSP diturunkan dari host Supabase secara otomatis, jadi berpindah proyek cukup dengan mengganti env.

## Keamanan

- `/admin` dan `/api/admin/*` dijaga middleware (login wall) dan setiap handler memanggil `getStaffUser()` sebagai lapisan kedua.
- Service-role client ditandai `server-only`; tidak pernah masuk bundel browser.
- Tiket booking & turnamen butuh verifikasi 4 digit terakhir nomor telepon sebelum menampilkan data pribadi (cookie HMAC httpOnly).
- Endpoint publik dibatasi rate limit per IP (in-memory — lihat catatan di `src/lib/rate-limit.ts`).
