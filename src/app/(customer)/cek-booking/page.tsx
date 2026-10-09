"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Search, ShieldCheck } from "lucide-react";

export default function CekBookingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [notFound, setNotFound] = useState(false);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    setNotFound(false);
    const res = await fetch(`/api/bookings/${c}`);
    if (res.ok) router.push(`/tiket/${c}`);
    else setNotFound(true);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold uppercase text-primary shadow-sm">
          <ShieldCheck aria-hidden className="size-4" /> PORTAL PELANGGAN
        </span>
        <h1 className="mt-4 font-display text-4xl uppercase md:text-5xl">Cek Status Booking</h1>
        <p className="mt-2 text-muted-foreground">Lacak status sesi, rincian unit, dan countdown pembayaran tanpa login.</p>
      </div>

      <Card className="mt-8">
        <CardContent>
          <form onSubmit={lookup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Kode Booking *</Label>
              <Input
                id="code"
                placeholder="Contoh: SR-2503-4412"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="h-[52px] font-display uppercase tracking-widest"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Kode booking ada di pesan WhatsApp atau screenshot tiket.</p>
            </div>
            {notFound && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-5 text-center">
                <p className="font-display text-xl uppercase">Booking Tidak Ditemukan</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Kami belum menemukan booking dengan kode <strong className="text-foreground">{code.toUpperCase()}</strong>.
                </p>
                <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setNotFound(false)}>Coba Lagi</Button>
                  <Button asChild><a href="/booking">Buat Booking Baru</a></Button>
                </div>
              </div>
            )}
            <Button type="submit" className="h-[52px] w-full">
              <Search aria-hidden className="mr-2 size-5" /> Cek Booking
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-8 rounded-xl bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Butuh bantuan?</p>
        <p className="mt-1">Hubungi kasir standby 24 jam untuk verifikasi manual.</p>
        <a href="https://wa.me/6281398765432" target="_blank" rel="noreferrer noopener" className="mt-2 inline-flex items-center gap-1.5 text-primary hover:underline">
          <MessageCircle aria-hidden className="size-4" /> Chat Kasir (WA: 0813-9876-5432)
        </a>
      </div>
    </div>
  );
}
