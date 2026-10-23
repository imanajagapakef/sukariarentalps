"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle, Search, ShieldCheck } from "lucide-react";

type ErrorKind = "wrong_digits" | "not_found" | "limited" | "invalid" | "server";

/**
 * Verification checkpoint for the ticket. Knowing the booking code is no
 * longer enough — the customer proves ownership by answering the last 4
 * digits of the phone on the booking; a correct answer mints the httpOnly
 * access cookie that unlocks `/tiket/[code]`.
 */
export default function CekBookingPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [last4, setLast4] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorKind | null>(null);
  const [attemptedCode, setAttemptedCode] = useState("");
  const last4Ref = useRef<HTMLInputElement>(null);

  // Tiket redirects here with ?code=… whenever the access cookie is missing or
  // stale — so the visitor never retypes the code.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("code");
    if (fromUrl) setCode(fromUrl.trim().toUpperCase());
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    const digits = last4.replace(/\D/g, "");
    if (!c || digits.length !== 4) {
      setError("invalid");
      if (digits.length !== 4) last4Ref.current?.focus();
      return;
    }

    setLoading(true);
    setAttemptedCode(c);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(c)}?last4=${digits}`);

      if (res.ok) {
        router.push(`/tiket/${encodeURIComponent(c)}`);
        return;
      }
      if (res.status === 401) {
        setError("wrong_digits");
        setLast4("");
        last4Ref.current?.focus();
      } else if (res.status === 404) {
        setError("not_found");
      } else if (res.status === 429) {
        setError("limited");
      } else {
        setError("server");
      }
    } catch {
      setError("server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs font-bold uppercase text-primary shadow-sm">
          <ShieldCheck aria-hidden className="size-4" /> PORTAL PELANGGAN
        </span>
        <h1 className="mt-4 font-display text-4xl uppercase md:text-5xl">Cek Status Booking</h1>
        <p className="mt-2 text-muted-foreground">
          Masukkan kode booking dan verifikasi kepemilikan untuk melihat tiket, rincian unit, dan
          countdown pembayaran.
        </p>
      </div>

      <Card className="mt-8">
        <CardContent>
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Kode Booking *</Label>
              <Input
                id="code"
                placeholder="Contoh: SR-2503-4412"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="h-[52px] font-display uppercase tracking-widest"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Kode booking ada di pesan WhatsApp atau screenshot tiket.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="last4">4 digit terakhir nomor telepon *</Label>
              <Input
                id="last4"
                ref={last4Ref}
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                placeholder="1234"
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="h-[52px] font-display tracking-widest"
                autoComplete="off"
                aria-describedby="last4-hint"
              />
              <p id="last4-hint" className="text-xs text-muted-foreground">
                Nomor telepon yang kamu pakai saat booking. Ini menjaga tiket tetap milikmu meski kode tersebar.
              </p>
            </div>

            {error && error !== "not_found" && (
              <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-5 text-center">
                {error === "wrong_digits" && (
                  <>
                    <p className="font-display text-xl uppercase">Verifikasi Gagal</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      4 digit terakhir tidak cocok dengan nomor telepon pada booking{" "}
                      <strong className="text-foreground">{attemptedCode}</strong>. Kaget sama nomor
                      sendiri terjadi, ya.
                    </p>
                    <Button type="button" variant="outline" className="mt-4" onClick={() => setError(null)}>
                      Coba Lagi
                    </Button>
                  </>
                )}
                {error === "limited" && (
                  <>
                    <p className="font-display text-xl uppercase">Terlalu Banyak Percobaan</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Tunggu beberapa menit, lalu coba lagi. Kalau terus terblokir, hubungi kasir
                      untuk verifikasi manual.
                    </p>
                  </>
                )}
                {error === "invalid" && (
                  <>
                    <p className="font-display text-xl uppercase">Data belum lengkap</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Isi kode booking dan 4 digit terakhir nomor telepon, ya.
                    </p>
                  </>
                )}
                {error === "server" && (
                  <>
                    <p className="font-display text-xl uppercase">Terjadi Kesalahan</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Server sedang bermasalah. Coba beberapa saat lagi.
                    </p>
                  </>
                )}
              </div>
            )}

            {error === "not_found" && (
              <div className="rounded-xl border border-danger/40 bg-danger/10 p-5 text-center">
                <p className="font-display text-xl uppercase">Booking Tidak Ditemukan</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Kami belum menemukan booking dengan kode{" "}
                  <strong className="text-foreground">{attemptedCode}</strong>.
                </p>
                <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                  <Button type="button" variant="outline" onClick={() => setError(null)}>Coba Lagi</Button>
                  <Button asChild><a href="/booking">Buat Booking Baru</a></Button>
                </div>
              </div>
            )}

            <Button type="submit" className="h-[52px] w-full" disabled={loading}>
              {loading ? (
                <Search aria-hidden className="mr-2 size-5 animate-spin" />
              ) : (
                <Search aria-hidden className="mr-2 size-5" />
              )}
              Cek Booking
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
