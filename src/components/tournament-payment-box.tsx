"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QrisCard } from "@/components/payment/qris-card";
import { rp } from "@/lib/format";

/**
 * The fee payment box on a ticket.
 *
 * Free is not a special case here — it is the absence of this component. A paid
 * ticket asks the server for a dynamic-amount QRIS from the merchant's static
 * string, generates the QR on the client (the API returns only the payload
 * string), and renders it inside the shared QrisCard instead of dumping the raw
 * payload into a <pre>.
 */
export function TournamentPaymentBox({
  code,
  amount,
}: {
  code: string;
  amount: number;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
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
      const qrString = body.payment.qr_string as string;
      // qrcode dimuat secara dinamis setelah tombol ditekan agar bundle awal
      // halaman tiket tidak membebani beban sebelum pengguna benar-benar butuh QR.
      const qrcode = (await import("qrcode")).default;
      const dataUrl = await qrcode.toDataURL(qrString, {
        width: 512,
        margin: 1,
        errorCorrectionLevel: "M",
      });
      setQrDataUrl(dataUrl);
      setBusy(false);
    } catch {
      setError("Gagal terhubung. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {qrDataUrl ? (
        <QrisCard
          amount={amount}
          qrDataUrl={qrDataUrl}
          status="PENDING"
          note="Tunjukkan QR ini ke kasir setelah pembayaran."
        />
      ) : (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">HTM </span>
            <span className="font-display text-primary">{rp(amount)}</span>
            <span className="text-muted-foreground"> — belum dibayar.</span>
          </p>
          <Button type="button" className="mt-3 w-full" onClick={ask} disabled={busy}>
            {busy ? "Menyiapkan QRIS…" : "Bayar QRIS"}
          </Button>
        </>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
