"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  Banknote,
  CircleCheck,
  Loader2,
  MessageCircle,
  Plus,
  QrCode,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtensionProofForm } from "@/components/extension/extension-proof-form";
import { fmtDateTime, fmtTime, rp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Option = {
  minutes: number;
  amount: number;
  new_end_at: string;
  /** QRIS dinamis untuk nominal ini; null kalau QRIS belum dikonfigurasi. */
  qrDataUrl?: string | null;
};

type Created = { extension_id: string; new_end_at: string; amount: number };
type Method = "QRIS_MANUAL" | "CASH";

/**
 * Perpanjangan mandiri + pilihan bayar.
 *
 * Situasional, sesuai keputusan pemilik:
 *  - QRIS: pelanggan membayar sekarang, bisa tanpa datang ke kasir (termasuk
 *    sebelum sesi dimulai). Bukti diunggah di dialog ini; kasir memverifikasi.
 *  - Tunai: dicatat sebagai pembayaran PENDING dan dilunasi di kasir saat
 *    check-out — untuk pelanggan yang memang sedang berada di tempat.
 *
 * Slot tetap langsung terkunci begitu perpanjangan dibuat, apa pun metodenya;
 * pilihan metode tidak mengubah ketersediaan.
 */
export function ExtendActions({
  code,
  options,
  waHref,
}: {
  code: string;
  options: Option[];
  /** Fallback "minta lewat kasir" untuk pembayaran/permintaan khusus. */
  waHref: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Option | null>(null);
  const [busy, setBusy] = useState<Method | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function open(option: Option) {
    setChosen(option);
    setCreated(null);
    setMethod(null);
    setError(null);
    setNotice(null);
  }

  function close(open: boolean) {
    if (open) return;
    setChosen(null);
    // Refresh ditunda sampai dialog ditutup: kalau halaman dimuat ulang saat
    // dialog masih terbuka, daftar opsi menyusut dan komponen ini ter-unmount
    // sebelum pelanggan sempat memindai QR / mengunggah bukti.
    if (created) router.refresh();
  }

  async function extend(kind: Method) {
    if (!chosen) return;
    setBusy(kind);
    setMethod(kind);
    setError(null);
    try {
      const res = await fetch(`/api/bookings/${code}/extend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: chosen.minutes, method: kind }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Gagal menambah jam. Coba lagi.");
        setMethod(null);
        return;
      }
      setCreated({
        extension_id: body.extension_id,
        new_end_at: body.new_end_at,
        amount: body.amount,
      });
    } catch {
      setError("Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.");
      setMethod(null);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-3">
        {options.map((o) => (
          <li key={o.minutes}>
            <button
              type="button"
              onClick={() => open(o)}
              className={cn(
                "group relative block w-full overflow-hidden rounded-2xl border border-border bg-card p-4 text-center transition-all",
                "hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg active:scale-[0.98]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <span aria-hidden className="absolute -right-6 -top-8 size-20 rounded-full bg-primary/10 blur-2xl" />
              <span className="font-display flex items-center justify-center gap-1 text-4xl leading-none tabular-nums text-primary">
                <Plus aria-hidden className="size-5" />
                {o.minutes / 60}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">jam</span>
              <span className="mt-2 block text-xs text-muted-foreground">
                sampai <b className="text-foreground">{fmtTime(o.new_end_at)}</b>
              </span>
              {o.amount > 0 && (
                <span className="mt-1 block text-sm font-semibold tabular-nums text-foreground">
                  ± {rp(o.amount)}
                </span>
              )}
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold uppercase text-primary">
                Pilih &amp; bayar
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Button asChild variant="outline" size="sm" className="mt-3">
        <a href={waHref} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden className="mr-1.5 size-4" /> Atau minta lewat kasir
        </a>
      </Button>

      <Dialog.Root open={chosen !== null} onOpenChange={close}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl"
            aria-describedby="extend-pay-desc"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <Dialog.Title className="font-display text-lg uppercase">
                  {created ? "Pembayaran perpanjangan" : "Perpanjang sesi"}
                </Dialog.Title>
                <Dialog.Description id="extend-pay-desc" className="mt-0.5 text-sm text-muted-foreground">
                  {chosen && `+${chosen.minutes / 60} jam · sampai ${fmtTime(chosen.new_end_at)}`}
                  {chosen && chosen.amount > 0 && ` · ${rp(chosen.amount)}`}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Tutup"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </Dialog.Close>
            </div>

            <div className="space-y-4 px-5 py-4">
              {/* Langkah 1: pilih cara bayar. */}
              {!created && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Slot langsung dikunci setelah kamu memilih. Pilih cara bayarnya:
                  </p>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      disabled={busy !== null || !chosen?.qrDataUrl}
                      onClick={() => void extend("QRIS_MANUAL")}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border border-border bg-surface-low px-3 py-3 text-left transition-colors",
                        "hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        {busy === "QRIS_MANUAL" ? (
                          <Loader2 aria-hidden className="size-5 animate-spin" />
                        ) : (
                          <QrCode aria-hidden className="size-5" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">Bayar QRIS sekarang</span>
                        <span className="block text-xs text-muted-foreground">
                          Tanpa ke kasir — cocok kalau kamu belum/tidak di tempat.
                        </span>
                        {!chosen?.qrDataUrl && (
                          <span className="block text-xs text-warning">QRIS belum aktif.</span>
                        )}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void extend("CASH")}
                      className="flex items-center gap-3 rounded-xl border border-border bg-surface-low px-3 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber/10 text-amber">
                        {busy === "CASH" ? (
                          <Loader2 aria-hidden className="size-5 animate-spin" />
                        ) : (
                          <Banknote aria-hidden className="size-5" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">Bayar tunai di kasir</span>
                        <span className="block text-xs text-muted-foreground">
                          Dicatat sebagai tagihan; lunas saat check-out.
                        </span>
                      </span>
                    </button>
                  </div>
                </>
              )}

              {/* Langkah 2 QRIS: tampilkan QR + bukti. */}
              {created && method === "QRIS_MANUAL" && (
                <>
                  <p className="flex items-start gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                    <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                    Sesi diperpanjang sampai {fmtDateTime(created.new_end_at)}. Bayar{" "}
                    {rp(created.amount)} lewat QRIS di bawah.
                  </p>

                  {chosen?.qrDataUrl ? (
                    <div className="flex justify-center rounded-xl bg-white p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URI, ukuran eksplisit */}
                      <img
                        src={chosen.qrDataUrl}
                        alt={`QRIS perpanjangan ${code}`}
                        width={224}
                        height={224}
                        className="size-56"
                      />
                    </div>
                  ) : (
                    <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                      QRIS belum dikonfigurasi. Bayar di kasir saat check-out.
                    </p>
                  )}

                  <ExtensionProofForm
                    code={code}
                    extensionId={created.extension_id}
                    nominal={created.amount}
                    onUploaded={() => router.refresh()}
                    compact
                  />
                </>
              )}

              {/* Langkah 2 tunai. */}
              {created && method === "CASH" && (
                <p className="flex items-start gap-2 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber">
                  <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
                  Sesi diperpanjang sampai {fmtDateTime(created.new_end_at)}. Bayar{" "}
                  {rp(created.amount)} di kasir saat check-out.
                </p>
              )}

              {notice && (
                <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                  {notice}
                </p>
              )}

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}

              {created ? (
                <Dialog.Close asChild>
                  <Button className="w-full">Selesai</Button>
                </Dialog.Close>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Harga di atas estimasi dari tarif klub. Kasir tetap mencocokkan pembayaran dan
                  bisa membatalkan perpanjangan kalau tidak dibayar.
                </p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}