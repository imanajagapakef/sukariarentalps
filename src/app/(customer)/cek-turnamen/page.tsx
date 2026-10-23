"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

/**
 * Ticket lookup by code.
 *
 * Same shape as /cek-booking and for the same reason: the customer has a code and no
 * account, so the code is the lookup. It is normalised to upper case here because the
 * codes are printed in upper case and people type them off a screenshot in any case.
 */
export default function CekTurnamenPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [notFound, setNotFound] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setNotFound(false);
    // The ticket page renders "not found" for an unknown code, so the check is only
    // here to avoid a pointless navigation.
    const res = await fetch("/api/tournaments/pay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: c }),
    });
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    router.push(`/turnamen/tiket/${c}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
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

            {notFound && (
              <p role="alert" className="text-sm text-danger">
                Tiket dengan kode itu tidak ditemukan. Cek lagi, atau daftar ulang.
              </p>
            )}

            <Button type="submit" className="w-full">
              Buka Tiket
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}