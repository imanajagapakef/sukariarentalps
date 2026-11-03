/**
 * Shared admin loading placeholders.
 *
 * Rendered by `loading.tsx` files, which Next mounts *inside* `admin/layout.tsx`'s
 * `<main>` slot — so the sidebar, topbar and identity block stay on screen while a
 * route resolves. Before this existed the only fallback was the full-page boot
 * animation in `app/loading.tsx`, which unmounted the whole shell on every click
 * and was the main reason navigation read as "jumpy" rather than seamless.
 *
 * Shapes mirror the loaded pages (hero → KPI strip → body) so nothing jumps when
 * the real content arrives. Purely decorative: `aria-busy` plus an `sr-only` label
 * announces the wait without exposing any of these boxes to the accessibility tree.
 */

import { cn } from "@/lib/utils";

function Hero() {
  return <div className="h-36 animate-pulse rounded-2xl border border-border bg-card" />;
}

function Kpi({ n, wide = false }: { n: number; wide?: boolean }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", wide ? "lg:grid-cols-6" : "lg:grid-cols-4")}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}

/** Generic page: hero + KPI strip + a stack of list rows. */
export function AdminPageSkeleton({ kpi = 4, rows = 6, wideKpi = false }: { kpi?: number; rows?: number; wideKpi?: boolean }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Memuat halaman…</span>
      <Hero />
      <Kpi n={kpi} wide={wideKpi} />
      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-container" />
        ))}
      </div>
    </div>
  );
}

/** Table page (bookings, audit log, …): hero + KPI + filter bar + table. */
export function AdminTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Memuat tabel…</span>
      <Hero />
      <Kpi n={6} wide />
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="h-12 w-full animate-pulse rounded-lg bg-surface-container" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-12 animate-pulse bg-surface-container" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="h-14 animate-pulse border-t border-border" />
        ))}
      </div>
    </div>
  );
}

/** Card-grid page (units, …): hero + KPI + a grid of cards. */
export function AdminGridSkeleton({ cards = 9 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Memuat…</span>
      <Hero />
      <Kpi n={4} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
