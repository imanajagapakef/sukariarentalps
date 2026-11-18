"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { SlotPicker } from "@/components/booking/availability-ui";
import { durationOptions, type BookingConfig } from "@/components/booking/form-types";
import { fmtISODay, rp } from "@/lib/format";
import { savingOf, type PromoOffering } from "@/lib/promo-rules";
import type { Slot } from "@/lib/validations/booking";

/**
 * Langkah 2 — Waktu: tanggal, durasi, grid jam, dan promo.
 *
 * Murni presentasi: state grid & promo tetap di induk BookingForm.
 */
export function StepTime({
  cfg,
  minDate,
  maxDate,
  date,
  onDateChange,
  duration,
  onDurationChange,
  unitId,
  slots,
  slotsError,
  startIso,
  onPick,
  durationMinutes,
  onRefresh,
  refreshedAt,
  onNextDay,
  timeValid,
  freeSlotCount,
  price,
  rentalTotal,
  promoDiscount,
  snackTotal,
  promoOfferings,
  promoOptions,
  activePromo,
  onPromotionChange,
  onClearPromo,
  headingRef,
}: {
  cfg: BookingConfig | null;
  minDate: string;
  maxDate: string;
  date: string;
  onDateChange: (date: string) => void;
  duration: number;
  onDurationChange: (duration: number) => void;
  unitId: string;
  slots: Slot[] | null;
  slotsError: string | null;
  startIso: string | null;
  onPick: (iso: string | null) => void;
  durationMinutes: number;
  onRefresh: () => void;
  refreshedAt: number | null;
  onNextDay: () => void;
  timeValid: boolean;
  freeSlotCount: number;
  price: number | null;
  rentalTotal: number;
  promoDiscount: number;
  snackTotal: number;
  promoOfferings: PromoOffering[];
  promoOptions: PromoOffering[];
  activePromo: PromoOffering | null;
  onPromotionChange: (id: string | null) => void;
  onClearPromo: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <div className="space-y-5">
      <h2 ref={headingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
        Waktu
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Tanggal</Label>
          <Input
            id="date"
            type="date"
            min={minDate}
            max={maxDate}
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Durasi</Label>
          <SelectField
            id="duration"
            // R4: a promo is a package for one duration, so while it is active the
            // duration is pinned instead of freely changeable. Dropping the promo
            // is the explicit way to pick another length.
            disabled={!!activePromo}
            value={duration}
            onChange={(e) => onDurationChange(Number(e.target.value))}
          >
            {durationOptions(cfg).map((d) => (
              <option key={d} value={d}>
                {d / 60} Jam
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {/* ---------- slot grid ---------- */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Jam Mulai</legend>

        {!unitId ? (
          <p className="text-sm text-muted-foreground">Pilih unit dulu di langkah sebelumnya.</p>
        ) : (
          <SlotPicker
            slots={slots}
            error={slotsError}
            startIso={startIso}
            onPick={onPick}
            durationMinutes={durationMinutes}
            onRefresh={onRefresh}
            refreshedAt={refreshedAt}
            onNextDay={onNextDay}
          />
        )}
      </fieldset>

      {!timeValid && slots && freeSlotCount > 0 && (
        <p role="status" className="text-sm text-warning">
          Pilih satu jam mulai yang tersedia.
        </p>
      )}

      <p className="text-sm text-muted-foreground">
        {price === null ? "Menunggu harga…" : `Harga sewa: ${rp(rentalTotal)}`}
        {promoDiscount > 0 && price !== null && (
          <span className="text-primary">
            {" "}
            · hemat {rp(promoDiscount)} dari {rp(price)}
          </span>
        )}
        {snackTotal > 0 && ` · snack ${rp(snackTotal)}`}
      </p>

      {/* ---------- promo ---------- */}
      {/* Only offered once there is a unit, because eligibility is per room type
          (R2). The list is what the server will actually accept: same branch, same
          facility type, exactly this duration, and cheaper than the normal price. */}
      {unitId && promoOfferings.length > 0 && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="space-y-2">
            <Label htmlFor="promo">Promo</Label>
            <SelectField
              id="promo"
              value={activePromo?.promotion_id ?? ""}
              onChange={(e) => onPromotionChange(e.target.value || null)}
            >
              <option value="">Tanpa promo</option>
              {promoOptions.map((o) => (
                <option key={o.promotion_id} value={o.promotion_id}>
                  {o.name} — {o.facility_name} {o.duration_minutes / 60} jam · hemat{" "}
                  {rp(savingOf(o))}
                </option>
              ))}
            </SelectField>
          </div>

          {activePromo ? (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-primary">
                {activePromo.name}: {rp(activePromo.promo_price)} untuk {activePromo.duration_minutes / 60} jam{" "}
                {activePromo.facility_name}
              </p>
              <p className="text-xs text-muted-foreground">
                Harga normal {rp(activePromo.normal_price)} · hemat {rp(savingOf(activePromo))}
                {activePromo.bonus_snack_name &&
                  ` · bonus ${activePromo.bonus_quantity}× ${activePromo.bonus_snack_name} (selama stok)`}
              </p>
              <button
                type="button"
                className="text-xs font-bold text-muted-foreground hover:text-foreground hover:underline"
                onClick={onClearPromo}
              >
                Lepas promo
              </button>
            </div>
          ) : promoOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Tidak ada promo untuk tipe unit & durasi ini.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Pilih promo untuk harga paket.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Helper yang dipakai induk untuk tombol "hari berikutnya". */
export function nextDay(date: string, maxDate: string): string | null {
  const next = new Date(Date.parse(`${date}T00:00:00+07:00`) + 86_400_000);
  const nextDayIso = fmtISODay(next);
  return nextDayIso <= maxDate ? nextDayIso : null;
}
