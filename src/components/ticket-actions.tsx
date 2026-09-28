"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** Counts down to the payment deadline, client-side from an absolute time. */
export function Countdown({ deadline }: { deadline: string }) {
  const target = new Date(deadline).getTime();
  const [left, setLeft] = useState(() => target - Date.now());

  useEffect(() => {
    const t = setInterval(() => setLeft(target - Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);

  if (left <= 0) return <p className="font-display text-lg text-danger">Waktu habis</p>;
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <p className="font-display text-2xl text-warning" aria-live="polite">
      {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </p>
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

export function StartPaymentButton({ code, className }: { code: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [snapUrl, setSnapUrl] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    const res = await fetch("/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ booking_code: code }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      alert(body?.error?.message ?? "Gagal membuat pembayaran");
      return;
    }
    setSnapUrl(body.payment.redirect_url);
  }

  if (snapUrl) return <SnapRedirect url={snapUrl} />;
  return (
    <Button className={className} disabled={busy} onClick={start}>
      {busy ? "Membuka pembayaran…" : "Bayar Sekarang"}
    </Button>
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
