/** Docked bottom action bar. */

import type { FormUnit } from "./booking-form-types";

import { Button } from "@/components/ui/button";
import { fmtDate, fmtDuration, fmtTime, rp } from "@/lib/format";

export function DockedBar({
  step,
  selectedUnit,
  date,
  startIso,
  duration,
  price,
  grandTotal,
  submitting,
  timeValid,
  blockReason,
  onBack,
  onForward,
  onSubmit,
}: {
  step: number;
  selectedUnit: FormUnit | null;
  date: string;
  startIso: string | null;
  duration: number;
  price: number | null;
  grandTotal: number;
  submitting: boolean;
  timeValid: boolean;
  blockReason: string;
  onBack: () => void;
  onForward: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="sticky bottom-0 z-30 -mx-4 mt-4 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:static md:mx-0 md:mt-6 md:rounded-xl md:border md:px-4 md:pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {selectedUnit?.name ?? "Unit"} · {fmtDate(date)} ·{" "}
          {startIso ? fmtTime(startIso) : "—"} · {fmtDuration(duration)}
        </p>
        <p className="font-display shrink-0 text-base">
          {price === null ? "—" : rp(grandTotal)}
        </p>
      </div>
      <div className="mt-3 flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={onBack}>
          ← Kembali
        </Button>
        {step === 2 ? (
          <Button
            type="button"
            className="flex-1"
            disabled={!!blockReason}
            aria-describedby={blockReason ? "next-hint" : undefined}
            onClick={onForward}
          >
            Data Diri →
          </Button>
        ) : (
          // Nama & nomor sengaja tidak ikut menentukan `disabled`: klik harus memunculkan
          // alert yang menyebut kolom mana yang kosong.
          <Button type="button" className="flex-1" disabled={submitting || !timeValid} onClick={onSubmit}>
            {submitting ? "Memproses…" : "Buat Booking"}
          </Button>
        )}
      </div>
      {step === 2 && blockReason && (
        <p id="next-hint" className="mt-2 text-xs text-warning">
          {blockReason}
        </p>
      )}
    </div>
  );
}
