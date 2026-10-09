"use client";

import { useEffect } from "react";

/**
 * Error boundary for /admin/reports — the design's "Error State" QA state.
 *
 * A report that half-renders is worse than one that admits failure, and the report
 * reads five tables: if any of them fails the totals below it are meaningless. So this
 * replaces the whole page rather than letting a partial figure pass as real.
 */
export default function ReportsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("/admin/reports failed to render", error);
  }, [error]);

  return (
    <div className="mt-6 rounded-xl border border-danger/40 bg-danger/5 p-6">
      <h1 className="font-display text-xl uppercase text-danger">Laporan gagal dimuat</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Data laporan tidak bisa dibaca lengkap, jadi angkanya tidak ditampilkan — ditampilkan
        sebagian akan terlihat seperti laporan yang benar padahal bukan.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">Digest: {error.digest}</p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Coba lagi
      </button>
    </div>
  );
}