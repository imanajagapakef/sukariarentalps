"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";

/**
 * Ticket lookup by code plus proof of ownership.
 *
 * Same shape as /cek-booking and for the same reason: the customer has a code and no
 * account, so the code is the lookup — but a code alone no longer opens the ticket.
 * The last 4 digits of the phone used at registration unlock it, exactly like a
 * booking. The code is normalised to upper case because the printed codes are upper
 * case and people type them off a screenshot in any case.
 */
export default function CekTurnamenPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [last4, setLast4] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The ticket page bounces unverified visitors here with ?code=..., so start
  // with the code already filled in.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) setCode(fromUrl.toUpperCase());
  }, []);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const digits = last4.replace(/\D/g, "").slice(0, 4);
    setError(null);
    if (!c) return;
    if (digits.length !== 4) {
      setError("Masukkan 4 digit terakhir nomor telepon yang dipakai saat daftar.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `/api/tournaments/${encodeURIComponent(c)}/access?last4=${digits}`,
        { method: "GET" },
      );
      if (res.status === 404) {
        setError("Tiket dengan kode itu tidak ditemukan. Cek lagi, atau daftar ulang.");
        return;
      }
      if (res.status === 401) {
        setError("4 digit terakhir tidak cocok dengan nomor yang dipakai saat daftar.");
        return;
      }
      if (res.status === 429) {
        setError("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
        return;
      }
      if (!res.ok) {
        setError("Tidak bisa membuka tiket sekarang. Coba lagi.");
        return;
      }
      router.push(`/turnamen/tiket/${encodeURIComponent(c)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <Breadcrumbs
        className="mb-8"
        items={[
          { label: "Home", href: "/" },
          { label: "Turnamen", href: "/turnamen" },
          { label: "Cek Tiket" },
        ]}
      />
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold uppercase text-primary shadow-sm">
          <ShieldCheck aria-hidden className="size-4" /> PORTAL PELANGGAN
        </span>
        <h1 className="mt-4 font-display text-4xl uppercase md:text-5xl">Cek Tiket Turnamen</h1>
        <p className="mt-2 text-muted-foreground">
          Kode tiket ada di pesan WhatsApp atau screenshot yang kamu terima.
        </p>
      </div>

      <Card className="mt-8">
        <CardContent>
          <form onSubmit={lookup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Kode Tiket *</Label>
              <Input
                id="code"
                placeholder="Contoh: TRN-K3P9QW"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-display uppercase tracking-widest"
                maxLength={20}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="last4">4 digit terakhir nomor telepon *</Label>
              <Input
                id="last4"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Contoh: 5678"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                required
              />
              <p className="text-xs text-muted-foreground">
                Nomor yang kamu pakai saat mendaftar. Ini menjaga tiket tetap milikmu meski
                kodenya tersebar.
              </p>
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Memeriksa..." : "Buka Tiket"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}