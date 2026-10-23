"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { phoneRegex } from "@/lib/validations/booking";
import { feeDisplay } from "@/lib/tournament-rules";
import { rp } from "@/lib/format";

/**
 * Tournament registration.
 *
 * Two required fields, which is the whole point: name for the bracket and phone for the
 * ticket. The fee line is shown before submitting so nobody discovers the price after
 * filling the form, and a free tournament says so outright instead of asking for a
 * payment it will never charge.
 *
 * Validation runs against the same regex as the server, so a mistyped number is caught
 * here instead of coming back as a generic 400.
 */
export function TournamentRegisterForm({
  tournamentId,
  registrationFee,
}: {
  tournamentId: string;
  registrationFee: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ name?: string; phone?: string }>({});

  const fee = feeDisplay({ registration_fee: registrationFee, list_price: null });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing: { name?: string; phone?: string } = {};
    if (name.trim().length < 2) missing.name = "Nama wajib diisi (minimal 2 huruf).";
    const digits = phone.trim();
    if (!digits) missing.phone = "Nomor WhatsApp wajib diisi.";
    else if (!phoneRegex.test(digits)) missing.phone = "Nomor WhatsApp tidak valid (6–20 karakter angka).";
    setFieldError(missing);
    if (missing.name || missing.phone) {
      setError("Lengkapi data dulu supaya pesannya menyebut kolomnya.");
      document.getElementById(missing.name ? "trn-name" : "trn-phone")?.focus();
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId, name: name.trim(), phone: digits }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Pendaftaran gagal");
        setBusy(false);
        return;
      }
      // Straight to the ticket: the code is the only thing the customer keeps, and the
      // ticket is where they pay when there is a fee.
      router.push(`/turnamen/tiket/${body.registration.registration_code}`);
    } catch {
      setError("Gagal terhubung. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
        {fee.kind === "free" ? (
          <p className="text-primary">
            <span className="font-display uppercase">Gratis</span> — tidak ada pembayaran,
            tiket langsung jadi setelah daftar.
          </p>
        ) : (
          <p>
            HTM <span className="font-display text-primary">{rp(fee.amount)}</span> per orang.
            Setelah daftar kamu dapat kode tiket untuk bayar QRIS atau langsung di kasir.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="trn-name">
          Nama<span className="text-danger"> *</span>
        </Label>
        <Input
          id="trn-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={Boolean(fieldError.name)}
          autoComplete="name"
        />
        {fieldError.name && <p className="text-xs text-danger">{fieldError.name}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="trn-phone">
          Nomor WhatsApp<span className="text-danger"> *</span>
        </Label>
        <Input
          id="trn-phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-invalid={Boolean(fieldError.phone)}
          autoComplete="tel"
          placeholder="08xxxxxxxxxx"
        />
        {fieldError.phone ? (
          <p className="text-xs text-danger">{fieldError.phone}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Dipakai buat kirim tiket dan info jadwal ke kamu.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Mendaftarkan…" : fee.kind === "free" ? "Daftar & Ambil Tiket" : "Daftar"}
      </Button>
    </form>
  );
}