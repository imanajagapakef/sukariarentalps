"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatRemaining } from "@/lib/countdown";

/**
 * Counts down to an absolute deadline (payment window, session start, session end),
 * client-side.
 *
 * The first frame is rendered as an empty placeholder rather than a computed time:
 * Date.now() on the server and on the client differ by however long the response
 * took, which is a hydration mismatch (React discards the whole tree and rebuilds
 * it). null means "not measured yet".
 *
 * `tone` picks the visual weight: `warning` for the payment deadline in its alert
 * box, `primary` for the session-start timer, which the ticket design gives its
 * own block above the boarding pass.
 */
export function Countdown({
  deadline,
  doneLabel = "Waktu habis",
  tone = "warning",
}: {
  deadline: string;
  doneLabel?: string;
  tone?: "warning" | "primary";
}) {
  const target = new Date(deadline).getTime();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(target - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);

  const prominent = tone === "primary";
  const idle = prominent
    ? "font-display text-5xl tabular-nums text-primary md:text-6xl"
    : "font-display text-2xl tabular-nums text-warning";

  if (left === null) {
    return <span className={idle} aria-hidden />;
  }
  if (left <= 0) {
    return (
      <p className={`font-display ${prominent ? "text-xl text-primary" : "text-lg text-danger"}`}>
        {doneLabel}
      </p>
    );
  }
  return (
    <p className={idle} aria-live="polite">
      {formatRemaining(left)}
    </p>
  );
}

/**
 * Copies the booking code. This is the element staff ask for most, and reading
 * `SR-7K2S29` off a phone screen out loud is the step people get wrong.
 *
 * ponytail: navigator.clipboard, no library. It needs a secure context, which
 * https and localhost both satisfy; the catch is the only failure mode worth
 * handling, and it is a silent no-op rather than a crash.
 */
export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} aria-live="polite">
      {copied ? "Tersalin" : "Salin kode"}
    </Button>
  );
}

export function CancelButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${code}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "dibatalkan customer" }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(body?.error?.message ?? "Gagal membatalkan booking");
      }
    } catch {
      setError("Gagal membatalkan booking â€” periksa jaringan lalu coba lagi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="destructive" size="sm" disabled={busy} onClick={() => setOpen(true)}>
        Batalkan
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Batalkan booking ini?"
        description={
          "Pembatalan mandiri hanya bisa sampai 6 jam sebelum sesi dimulai.\n\n" +
          "Jika sudah lewat batas itu, hubungi kasir untuk refund lewat counter.\n" +
          "Pembayaran yang sudah masuk akan direfund dan slot dilepas."
        }
        confirmLabel="Ya, batalkan"
        onConfirm={() => void cancel()}
        busy={busy}
      />
    </>
  );
}
