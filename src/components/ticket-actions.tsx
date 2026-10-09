"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export function PayButton({ code, className }: { code: string; className?: string }) {
  const router = useRouter();
  return (
    <Button className={className} onClick={() => router.push(`/payment/${code}`)}>
      Bayar Sekarang
    </Button>
  );
}

export function StartPaymentButton({
  code,
  method,
  className,
  label,
}: {
  code: string;
  method?: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setFailure(null);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_code: code, ...(method ? { method } : {}) }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setFailure(body?.error?.message ?? "Gagal membuat pembayaran");
      return;
    }
    setSnapUrl(body.payment.redirect_url);
  }

  if (snapUrl) return <SnapRedirect url={snapUrl} />;
  return (
    <div className={className}>
      <Button className="w-full" disabled={busy} onClick={start}>
        {busy ? "Membuka pembayaran…" : (label ?? "Bayar Sekarang")}
      </Button>
      {failure && <p className="mt-2 text-sm text-danger">{failure}</p>}
    </div>
  );
}

/** Lands on the Snap hosted page; manual link in case auto-redirect is blocked. */
function SnapRedirect({ url }: { url: string }) {
  useEffect(() => {
    window.location.href = url;
  }, [url]);
  return (
    <a href={url} className="text-sm text-primary underline">
      Tidak otomatis teralihkan? Klik di sini
    </a>
  );
}

export function CancelButton({ code }: { code: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    if (!confirm("Batalkan booking ini?")) return;
    setBusy(true);
    const res = await fetch(`/api/bookings/${code}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "dibatalkan customer" }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else alert("Gagal membatalkan booking");
  }

  return (
    <Button variant="destructive" size="sm" disabled={busy} onClick={cancel}>
      {busy ? "Membatalkan…" : "Batalkan"}
    </Button>
  );
}
