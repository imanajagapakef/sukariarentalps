"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rp } from "@/lib/format";

/**
 * The fee payment box on a ticket.
 *
 * Free is not a special case here — it is the absence of this component. A paid ticket
 * asks the server for a dynamic-amount QRIS from the merchant's static string, the same
 * conversion the booking flow uses, and shows the code so a customer at the counter can
 * just read it out.
 */
export function TournamentPaymentBox({
  code,
  amount,
}: {
  code: string;
  amount: number;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Gagal membuat QRIS");
        setBusy(false);
        return;
      }
      setQr(body.payment.qr_string as string);
      setBusy(false);
    } catch {
      setError("Gagal terhubung. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <p className="text-sm">
        <span className="text-muted-foreground">HTM </span>
        <span className="font-display text-primary">{rp(amount)}</span>
        <span className="text-muted-foreground"> — belum dibayar.</span>
      </p>

      {qr ? (
        <div className="mt-3 space-y-2 text-center">
          {/* A plain rendered code rather than an <img>: the QR payload is already a
              string, and rendering it directly avoids another round trip. */}
          <pre className="overflow-x-auto rounded bg-card p-2 text-[10px] leading-tight break-all">
            {qr}
          </pre>
          <p className="text-xs text-muted-foreground">
            Scan pakai QRIS (app m-banking / GoPay), atau bayar di kasir dengan
            tunjukkan kode tiket ini.
          </p>
        </div>
      ) : (
        <Button type="button" className="mt-3 w-full" onClick={ask} disabled={busy}>
          {busy ? "Menyiapkan QRIS…" : "Bayar QRIS"}
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}