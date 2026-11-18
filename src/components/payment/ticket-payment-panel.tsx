"use client";

import { useState } from "react";
import { Building2, Check, Copy, Landmark, QrCode, ShieldCheck, Upload } from "lucide-react";
import { PaymentProofForm } from "@/components/payment-proof-form";
import { cn } from "@/lib/utils";
import { rp } from "@/lib/format";

/**
 * Panel pembayaran yang menyatu dengan tiket.
 *
 * Satu tempat untuk dua cara bayar: QRIS atau transfer bank. Pelanggan memilih,
 * panel menampilkan yang relevan (QR atau nomor rekening), lalu mengunggah bukti
 * di tempat yang sama. Setelah bukti masuk — atau tidak — statusnya tetap
 * "menunggu konfirmasi kasir": layar ini tidak pernah mengaku lunas sendiri.
 */
export type BankDetails = {
  bank: string;
  accountNumber: string;
  accountHolder: string;
} | null;

type Method = "QRIS" | "TRANSFER";

export function TicketPaymentPanel({
  code,
  total,
  qrDataUrl,
  bank,
  usedProofs,
  maxProofs,
}: {
  code: string;
  total: number;
  /** Data URL QRIS dinamis; null berarti QRIS belum dikonfigurasi. */
  qrDataUrl: string | null;
  bank: BankDetails;
  /** Berapa bukti yang sudah diunggah, untuk membatasi percobaan. */
  usedProofs: number;
  maxProofs: number;
}) {
  const [method, setMethod] = useState<Method>(qrDataUrl ? "QRIS" : "TRANSFER");
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // clipboard butuh secure context; gagal = diamkan, angkanya tetap terbaca.
    }
  }

  return (
    <section
      aria-labelledby="bayar-heading"
      className="rounded-2xl border border-primary/30 bg-card shadow-lg"
    >
      <div className="border-b border-dashed border-border p-5">
        <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-primary">
          <ShieldCheck aria-hidden className="size-4" /> Menunggu konfirmasi kasir
        </p>
        <h2 id="bayar-heading" className="font-display mt-1 text-xl uppercase">
          Bayar {rp(total)}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pilih cara bayar, lalu unggah buktinya di bawah. Kasir mencocokkan dengan mutasi
          rekening, dan tiket ini berubah sendiri begitu dikonfirmasi.
        </p>
      </div>

      <div className="p-5">
        {/* Tab metode */}
        <div role="tablist" aria-label="Cara pembayaran" className="grid grid-cols-2 gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={method === "QRIS"}
            onClick={() => setMethod("QRIS")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors",
              method === "QRIS"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            <QrCode aria-hidden className="size-4" /> QRIS
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={method === "TRANSFER"}
            onClick={() => setMethod("TRANSFER")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors",
              method === "TRANSFER"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50",
            )}
          >
            <Landmark aria-hidden className="size-4" /> Transfer
          </button>
        </div>

        {/* Isi tab */}
        <div className="mt-4">
          {method === "QRIS" ? (
            qrDataUrl ? (
              <div className="space-y-3">
                <div className="flex justify-center rounded-xl bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URI, ukuran eksplisit */}
                  <img
                    src={qrDataUrl}
                    alt={`QRIS pembayaran ${code}`}
                    width={224}
                    height={224}
                    className="size-56"
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Pindai dengan aplikasi bank atau e-wallet, lalu unggah bukti di bawah.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
                QRIS belum dikonfigurasi. Gunakan transfer bank, atau hubungi kasir.
              </p>
            )
          ) : bank ? (
            <dl className="space-y-2 rounded-xl bg-surface-low p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Building2 aria-hidden className="size-3.5" /> Bank
                </dt>
                <dd className="font-bold">{bank.bank}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Nomor rekening</dt>
                <dd className="flex items-center gap-1.5">
                  <span className="font-mono text-base font-bold tabular-nums">{bank.accountNumber}</span>
                  <button
                    type="button"
                    onClick={() => void copy(bank.accountNumber, "norek")}
                    aria-label="Salin nomor rekening"
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {copied === "norek" ? (
                      <Check aria-hidden className="size-3.5 text-primary" />
                    ) : (
                      <Copy aria-hidden className="size-3.5" />
                    )}
                  </button>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Atas nama</dt>
                <dd className="font-medium">{bank.accountHolder}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                <dt className="text-muted-foreground">Jumlah</dt>
                <dd className="font-mono font-bold tabular-nums text-primary">{rp(total)}</dd>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">
                Transfer tepat sebesar total di atas — nominal yang berbeda membuat kasir harus
                mencocokkan manual.
              </p>
            </dl>
          ) : (
            <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
              Rekening bank belum diatur. Hubungi kasir untuk instruksi pembayaran.
            </p>
          )}
        </div>

        {/* Bukti bayar — satu tempat untuk kedua metode */}
        <div className="mt-5 border-t border-dashed border-border pt-5">
          <PaymentProofForm code={code} total={total} used={usedProofs} maxProofs={maxProofs} />
        </div>

        <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Upload aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
          Tidak punya screenshot? Pembayaranmu tetap masuk antrean konfirmasi kasir.
        </p>
      </div>
    </section>
  );
}