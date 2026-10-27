"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { fmtDateTime, rp } from "@/lib/format";
import { StickerTag } from "@/components/kit/sticker-tag";

/**
 * Kartu pembayaran QRIS berbentuk tiket/resi arcade.
 *
 * Digunakan baik secara mandiri pada halaman pembayaran booking, maupun
 * nested di dalam tiket turnamen. Frame-nya sendiri (bg-card + border +
 * shadow-arcade) supaya tidak bergantung pada latar belakang induk — 작a baik
 * ditempa langsung di atas bg-surface atau di dalam tiket yang sudah bg-card.
 *
 * Slot opsional: reference, deadline, note — supaya booking dan turnamen
 * dapat membagi satu komponen tanpa duplikasi markup.
 */
export function QrisCard({
  amount,
  qrDataUrl,
  status,
  reference,
  deadline,
  note,
  className,
}: {
  amount: number;
  qrDataUrl: string;
  status?: string;
  reference?: string;
  deadline?: string;
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-6 shadow-arcade",
        className,
      )}
    >
      {/* Perforasi tiket atas */}
      <div className="border-b border-dashed border-white/10 pb-4 mb-4">
        <div className="flex items-center justify-between gap-3">
          <Image
            src="/brand/logo-primary.svg"
            alt=""
            width={210}
            height={42}
            unoptimized
            className="h-7 w-auto"
          />
          {status && (
            <StickerTag variant="green" className="text-[0.65rem]">
              {status}
            </StickerTag>
          )}
        </div>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-1">
        Scan QRIS untuk Bayar
      </p>

      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Total
        </p>
        <p className="font-display text-3xl text-primary">{rp(amount)}</p>
      </div>

      {/* QR dengan zona diam (quiet zone) putih tambahan agar ter-scan dengan
          baik. Data URLnya sendiri sudah carries latar putih + margin, padding
          putih ini adalah cadangan ekstra. */}
      <div className="flex items-center justify-center mb-4">
        <div className="rounded-lg bg-white p-2 shadow-arcade-sm">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI, ukuran eksplisit */}
          <img
            src={qrDataUrl}
            alt="QR Code Pembayaran QRIS"
            className="size-40 block"
          />
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground leading-relaxed mb-4">
        Scan pakai aplikasi QRIS (m-banking, GoPay, OVO, Dana), lalu tunjukkan
        bukti pembayaran ke kasir.
      </p>

      <div className="space-y-2">
        {reference && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-bold uppercase tracking-wider text-[10px]">
              Ref
            </span>
            <span className="font-mono text-foreground">{reference}</span>
          </div>
        )}
        {deadline && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-bold uppercase tracking-wider text-[10px]">
              Bayar Sebelum
            </span>
            <span className="font-bold text-primary">
              {fmtDateTime(deadline)}
            </span>
          </div>
        )}
        {note && <p className="text-xs text-muted-foreground italic">{note}</p>}
      </div>

      {/* Perforasi tiket bawah dengan sticker terpusat */}
      <div className="mt-6 pt-4 border-t border-dashed border-white/10 flex items-center justify-center gap-2">
        <span className="h-px flex-1 shrink-0 bg-white/20" />
        <StickerTag variant="outline" className="text-[0.6rem]">
          TIKET
        </StickerTag>
        <span className="h-px flex-1 shrink-0 bg-white/20" />
      </div>
    </div>
  );
}
