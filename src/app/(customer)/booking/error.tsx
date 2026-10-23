"use client";

import { useEffect } from "react";

/**
 * Error boundary for /booking.
 *
 * The page's server work is five catalog reads before the form can render anything. If
 * one of them fails there is no half-built form worth keeping: a form missing its snack
 * list or its promo table still *looks* complete, and the customer only finds out at the
 * last step that something they were offered no longer exists. So this replaces the page.
 */
export default function BookingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("/booking failed to render", error);
  }, [error]);

  return (
    <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-danger/40 bg-danger/5 p-6">
      <h1 className="font-display text-xl uppercase text-danger">Form booking gagal dimuat</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Data cabang, unit, atau promo tidak bisa dibaca, jadi formnya tidak ditampilkan —
        lebih baik gagalnya kelihatan sekarang daripada pelanggan baru sadar di langkah
        terakhir.
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
