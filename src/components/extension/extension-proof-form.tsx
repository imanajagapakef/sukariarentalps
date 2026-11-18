"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downscaleImage } from "@/lib/image-downscale";

/**
 * Unggah bukti untuk SATU perpanjangan.
 *
 * Dipakai dua tempat: di dalam dialog setelah pelanggan memilih QRIS, dan di
 * panel "menunggu pembayaran" pada halaman /extension (supaya bukti tetap bisa
 * dikirim setelah dialog ditutup atau halaman dimuat ulang).
 *
 * Tidak mengubah status pembayaran — kasir yang memverifikasi.
 */
export function ExtensionProofForm({
  code,
  extensionId,
  nominal,
  onUploaded,
  compact = false,
}: {
  code: string;
  extensionId: string;
  nominal: number;
  /** Dipanggil setelah bukti tersimpan (mis. refresh halaman). */
  onUploaded?: () => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(file: File | undefined) {
    if (!file) {
      setError("Pilih screenshot bukti dulu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("extension_id", extensionId);
      form.set("proof", await downscaleImage(file, 1400));
      form.set("nominal", String(nominal));

      const res = await fetch(`/api/bookings/${code}/extend/proof`, { method: "POST", body: form });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? "Gagal mengirim bukti");

      setDone(true);
      onUploaded?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim bukti");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
        <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
        Bukti terkirim. Kasir akan mencocokkannya dengan mutasi.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Sudah bayar? Unggah screenshot bukti supaya kasir bisa memverifikasi tanpa kamu
        datang ke meja.
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
      />
      {error && <p className="text-sm text-warning">{error}</p>}
      <Button
        type="button"
        variant={compact ? "secondary" : "default"}
        disabled={busy}
        onClick={() => void submit(fileRef.current?.files?.[0])}
        className="gap-1.5"
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 animate-spin" />
        ) : (
          <Upload aria-hidden className="size-4" />
        )}
        Kirim bukti
      </Button>
    </div>
  );
}