/**
 * Skeleton for /admin/reports — the design's "Skeleton Loading" QA state.
 *
 * The page runs four dependent queries (bookings, payments, line items, status
 * history) so the wait is long enough to be worth a real placeholder rather than
 * a blank screen. Shapes mirror the loaded layout so nothing jumps on arrival.
 */
export default function ReportsLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Memuat laporan…</span>

      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-container" />
      <div className="mt-3 h-4 w-72 animate-pulse rounded bg-surface-container" />

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 w-28 animate-pulse rounded-lg bg-surface-container" />
        ))}
        <div className="h-12 w-24 animate-pulse rounded-lg bg-surface-container" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>

      <div className="mt-8 h-6 w-56 animate-pulse rounded bg-surface-container" />
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="h-56 animate-pulse rounded-xl border border-border lg:col-span-2" />
        <div className="h-56 animate-pulse rounded-xl border border-border" />
      </div>
    </div>
  );
}