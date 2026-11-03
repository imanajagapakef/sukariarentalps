# PERF

## Baseline (2026-10-08, prod build, desktop, trace)

| Route | LCP | INP | CLS | Catatan |
|---|---|---|---|---|
| / | 1764 ms | – | 0.00 | render delay 1727 ms |
| /games | 132 ms | 39 ms | 0.00 | ok |
| /tempat-main | 163 ms | – | 0.00 | ok |
| /booking | 152 ms | – | 0.00 | ok |
| /cabang/BR-B5 | 1611 ms | – | 0.00 | LCP image load delay 1460 ms (CSS background-image hero) |

Lighthouse (desktop): skor categories 100 kecuali a11y 96 di /.

## Perubahan

- React `cache()` pada `getBranches`, `getGameBySlug`, staff profile fetch (authz), dedupe `booking_items` di reports-query (3 fetch → 1 per request).
- `catalog.ts` pindah ke client cookieless (`lib/supabase/public.ts`) + fetch `revalidate: 300` → /games, /snacks, /promo, /cabang, /cek-booking jadi static ISR.
- `next.config.ts`: `images.remotePatterns` (Supabase), `optimizePackageImports` (radix-ui, lucide-react).
- `Cover` pakai next/image (fill+sizes), hero `/cabang/[branch_id]` dari CSS background → `<Image priority>`.
- N+1 RPC `next_available` diganti RPC batch `next_available_batch` (migrasi 0019) di /, /tempat-main, /cabang/[branch_id] via `getNextFreeMap`.
- `occupancyReport`: unit_status_history dibatasi 90-hari lookback; admin/users `listUsers` perPage 1000.
- Admin live-refresh 10s → 60s; image uploader downscale ke WebP maks 1600px.
- `web-vitals` RUM di root layout (console.debug).

## Hasil (2026-10-08, post-change, trace)

| Route | LCP sebelum | LCP sesudah |
|---|---|---|
| / | 1764 ms | 411 ms |
| /cabang/BR-B5 | 1611 ms | 484 ms |
| /games | 132 ms | 132 ms (tetap; static shell kini) |
| /tempat-main | 163 ms | – |
| /booking | 152 ms | – |

## Ditunda

- /booking: full catalog masih di-serialize ke client (BookingForm); potong per-step butuh refactor besar.
- globals.css duplikasi token :root/.dark.
- QR toDataURL per request (minor).
- shadcn dipindah ke devDeps dibatalkan: globals.css meng-import `shadcn/tailwind.css`.

## Tahap 2 (2026-10-09)

- RUM: tabel `web_vitals` (migrasi 0020) + `POST /api/vitals`; `web-vitals.tsx` kirim via `sendBeacon`. Verified 202.
- Reports: `paymentsForBookings` cache per-request — revenueReport + financialJournal sekarang 1 query payments (dulu 2 shape berbeda).
- /booking HTML 130 KB → 100 KB: props BookingForm dipangkas ke field yang dirender saja (FormBranch/FormUnit/FormGame/FormSnack).
- CI: `lighthouserc.json` (budget LCP ≤2500ms, CLS ≤0.1, TBT ≤300ms, perf ≥0.9) + `.github/workflows/ci.yml`.
- globals.css: blok `.dark` (dead, palet identik dengan :root, tak pernah diterapkan) dihapus.

## Budget

- JS initial < 200 KB gzip, LCP ≤ 2500 ms, INP ≤ 200 ms, CLS ≤ 0.1, TBT ≤ 300 ms. Di-guard oleh `lighthouserc.json` (synthetic CI) + tabel `web_vitals` (field RUM).

## Tahap 3 (2026-11-03) — navigasi admin & seamless

Feedback: pindah menu admin terasa lemot & "belum seamless" (dirasakan di produksi).
Diagnosis: bukan sinyal, tapi arsitektur — middleware memanggil `auth.getUser()`
(jaringan) tiap navigasi `/admin`; tiap halaman memanggil `getStaffUser()` lagi; semua
halaman admin `force-dynamic`; dan **`app/loading.tsx` (boot animation full-page) jadi
fallback default untuk semua route admin**, sehingga shell sidebar/topbar hilang dulu
sebelum konten muncul.

Perubahan:

- `src/components/admin/page-skeleton.tsx` (baru) + `app/admin/loading.tsx`,
  `app/admin/bookings/loading.tsx`, `app/admin/units/loading.tsx`: skeleton dirender
  **di dalam** `admin/layout.tsx`, jadi shell tetap terpasang dan hanya area konten
  yang pulse. `app/admin/reports/loading.tsx` sudah ada sebelumnya.
- `app/(customer)/loading.tsx` (baru): placeholder ringan untuk route dinamis funnel
  (`/booking`, `/payment/[code]`, `/tiket/[code]`). Halaman ISR tetap tidak memicunya.
- `next.config.ts`: `experimental.staleTimes = { dynamic: 30, static: 180 }`. Next 15
  menurunkan Router Cache dynamic ke 0; 30s mengembalikan "bolak-balik menu instan".
  `LiveRefresh` (60s) memakai `router.refresh()` yang menembus cache ini, jadi antrean
  bayar/status unit tetap segar. Turunkan `dynamic` bila kasir melihat angka basi.
- `components/admin/admin-nav.tsx`: grup nav (Master Data, Laporan & Tim) bisa
  **collapse**, default terlipat, status disimpan di `localStorage`. Grup yang memuat
  halaman aktif otomatis terbuka supaya baris aktif tidak tersembunyi.

Auth round-trip — **sudah dipangkas**. Proyek memakai JWT asimetris (ES256, terverifikasi
lewat `/auth/v1/.well-known/jwks.json`), jadi `getClaims()` memverifikasi tanda tangan
secara lokal (JWKS ter-cache) alih-alih memanggil Auth server tiap request. `getUser`
diganti `getClaims` di `src/middleware.ts` dan `src/lib/authz.ts`; middleware tetap
me-refresh sesi yang mau kedaluwarsa. Kalau proyek kembali ke secret simetris, `getClaims`
otomatis fallback ke panggilan server yang sama seperti `getUser` (tidak lebih buruk).

Catatan: `force-dynamic` pada halaman admin praktis inheren — `getStaffUser()` membaca
`cookies()`, yang sudah memaksa route dinamis, jadi caching server tidak menolong;
Router Cache klien (staleTimes) yang relevan.

Verifikasi: `npm run lint` + `npm run typecheck` + `npm run build` hijau; smoke test
middleware tanpa sesi (`/admin` 307, `/api/admin/*` 401) + 21 test harness auth admin lulus
(jalur ber-sesi).

Perbaikan bug: animasi hero home (`hero-gaming-animation.tsx`) menjadi `absolute` mulai
`md` padahal kolom teks baru dikunci ke kiri mulai `xl`, sehingga tumpang tindih di tablet.
Breakpoint animasi disamakan ke `xl`. Diverifikasi di browser (CDP): tablet 834px animasi
`relative` di bawah teks (overlap false), desktop 1440px animasi `absolute` di kanan tanpa
tumbukan, mobile tetap in-flow.

Optimasi query `/admin/bookings`:
- `listBookingsPage` me-resolve pencarian (`resolveSearch`) sekali, bukan dua kali
  (count + window) — hemat satu query `customers` tiap pencarian.
- Halaman menjalankan `listBookingsPage` dan empat `countByStatus` dalam satu gelombang
  (`Promise.all`), bukan dua gelombang berurutan.

Verifikasi: 31 test (`bookings-query` + `admin-routes-regression`) lulus.

### Diagnosa lanjutan (2026-11-03) — Chrome DevTools, login owner, LiveRefresh dijeda

Ukuran per halaman admin (fetch HTML terautentikasi, `no-store`):

| Halaman | TTFB | Total konten |
|---|---|---|
| /admin | ~29 ms | 3.0 s |
| /admin/bookings | ~20 ms | 4.5 s |
| /admin/units | ~24 ms | 1.7 s |
| /admin/customers | ~31 ms | 0.8 s |
| /admin/snacks | ~21 ms | 1.6 s |
| /admin/turnamen | ~18 ms | 5.3 s |

**TTFB ~20–30 ms** → server + middleware cepat (optimasi `getClaims` berhasil; auth bukan
bottleneck lagi). Sisa waktu ada di **isi halaman = query data**.

Latency mentah REST Supabase dari mesin ini: min 426 ms / median 1189 ms / max 1366 ms.
Kontrol ke `1.1.1.1` juga 0.26–2.5 s (TLS 1–2 s) → **jaringan mesin ini sendiri lambat/jitter**,
bukan Supabase spesifik. Header `CF-Ray: …-SIN` → project di edge Singapura.

Kesimpulan: sisa "lelet" = jumlah round-trip DB × latency jaringan. Solusi terbesar:
**deploy aplikasi satu region dengan Supabase** (Vercel `sin1`). Di Vercel region
Singapura latency per-query turun ke orde milidetik dan halaman-halaman ini jadi cepat.

Perubahan kode: `getAdminTournaments` menjalankan dua sweep (expire registrations + purge
turnamen lama) secara paralel, bukan berurutan — hemat satu round-trip per buka halaman
turnamen.

`listBookingsPage` (`src/lib/bookings-query.ts`) dan `listUnitsPage` (`src/lib/units-query.ts`)
kini mengambil `total` dari query window (`count: "exact"`) yang sama dengan barisnya,
bukan query count terpisah lebih dulu — satu round-trip lebih sedikit per buka halaman.
Stale `?page=` (PostgREST 416 / `PGRST103`) tetap di-clamp ke halaman terakhir dengan satu
baca tambahan, hanya pada kasus langka itu. Verifikasi: 33 test (`bookings-query` +
`units-query`) lulus, termasuk test clamp.

`/admin/reports`: tiap section (Revenue, Occupancy, Game & Request, Tamu) dibungkus
`<Suspense>` sendiri, jadi shell + Section 1 tampil begitu query window selesai dan section
berat menyusul streaming — bukan menahan seluruh halaman di skeleton sampai query terberat
selesai. `paymentsForBookings`/`itemsForBookings` sudah `cache()` per-request sehingga
revenue + journal tidak menduplikasi query payments/items.

**Region (konfirmasi 2026-11-03):** IP server Postgres `2406:da18:…` = AWS
`ap-southeast-1` (Singapura). Vercel menempatkan fungsi baru di `iad1` (Washington, D.C.)
secara default, jadi aplikasi dan DB terpisah satu benua — inilah penyebab utama latensi
per-query di produksi. Perbaikan: `vercel.json` → `regions: ["sin1"]` (dan samakan di
Dashboard → Settings → Functions → Region).
