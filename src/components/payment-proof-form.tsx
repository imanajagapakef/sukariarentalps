"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downscaleImage } from "@/lib/image-downscale";
import { MAX_PROOFS_PER_BOOKING } from "@/lib/payment-proofs";

/**
 * Lets the customer attach a screenshot of the transfer.
 *
 * This is a claim, not a payment: the page says so, because the alternative reading
 * ("upload and you're done") would make customers wait for a cashier who was never
 * going to look at the file. Nothing here changes booking status.
 */
export function PaymentProofForm({
  code,
  total,
  used,
}: {
  code: string;
  /** What the club is expecting, so the customer does not have to remember. */
  total: number;
  used: number;
}) {
  const router = useRouter();
  const [nominal, setNominal] = useState(String(total));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const remaining = MAX_PROOFS_PER_BOOKING - used;

  async function submit(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("proof", await downscaleImage(file, 1400));
      body.set("nominal", nominal);
      if (note.trim()) body.set("note", note.trim());

      const res = await fetch(`/api/payments/${code}/proof`, { method: "POST", body });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error?.message ?? "Gagal mengirim bukti");

      setDone(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim bukti");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="proof-heading" className="rounded-2xl border border-border bg-card p-5">
      <h2 id="proof-heading" className="flex items-center gap-2 font-display text-lg uppercase">
        <Upload aria-hidden className="size-4" /> Sudah transfer?
      </h2>

      {done ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-primary">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          Bukti terkirim. Kasir akan mencocokkannya dengan mutasi, lalu halaman ini berubah
          sendiri begitu dikonfirmasi.
        </p>
      ) : remaining <= 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Bukti sudah terkirim {MAX_PROOFS_PER_BOOKING} kali. Kalau masih bermasalah, hubungi
          kasir lewat WhatsApp.
        </p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"]');
            void submit(input?.files?.[0]);
          }}
        >
          <p className="text-sm text-muted-foreground">
            Kirim screenshot bukti transfer supaya kasir tahu nominal yang kamu kirim.
            <span className="block text-xs">Ini tidak otomatis deemed lunas — kasir tetap
            perlu mencocokkan dengan mutasi rekening klub.</span>
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="proof-nominal">Nominal yang ditransfer</Label>
              <Input
                id="proof-nominal"
                inputMode="numeric"
                value={nominal}
                onChange={(e) => setNominal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proof-note">Catatan (opsional)</Label>
              <Input
                id="proof-note"
                placeholder="mis. transfer dari DANA atas nama Rina"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-medium">Screenshot bukti</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
            />
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <Button type="submit" disabled={busy} variant="secondary">
            {busy ? "Mengirim…" : "Kirim bukti"}
          </Button>
        </form>
      )}
    </section>
  );
}