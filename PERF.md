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
