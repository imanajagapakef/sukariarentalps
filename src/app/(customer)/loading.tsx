/**
 * Customer segment fallback.
 *
 * Most public pages are ISR (revalidate 20–300s), so the shell usually arrives
 * already rendered and this never shows. It matters for the dynamic funnel routes
 * (`/booking`, `/payment/[code]`, `/tiket/[code]`) where a server round trip is
 * unavoidable — a light placeholder keeps that wait from being a blank frame.
 *
 * Deliberately minimal: the full-page boot animation in `app/loading.tsx` is the
 * brand moment for a cold load, and it is too heavy to replay on every navigation.
 */
export default function CustomerLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <span className="sr-only">Memuat halaman…</span>
      <div className="h-40 w-full animate-pulse rounded-3xl border border-border bg-card" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
