/** Step 3 — data diri, tambahan, ringkasan. */
import type { RefObject } from "react";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { fmtDuration, fmtTime, rp } from "@/lib/format";
import type { PromoOffering } from "@/lib/promo-rules";
import { stockStatus } from "@/lib/snack-stock";
import type { BookingConfig, FormGame, FormSnack } from "./booking-form-types";

export function StepDetails({
  stepHeadingRef,
  customer,
  fieldError,
  onNameChange,
  onNameBlur,
  onPhoneChange,
  onPhoneBlur,
  onEmailChange,
  gameId,
  onGameChange,
  branchGames,
  snacks,
  pickedSnacks,
  onSnackChange,
  date,
  startIso,
  duration,
  price,
  rentalTotal,
  promoDiscount,
  snackTotal,
  grandTotal,
  activePromo,
  cfg,
}: {
  stepHeadingRef: RefObject<HTMLHeadingElement | null>;
  customer: { name: string; phone: string; email: string };
  fieldError: { name?: string; phone?: string };
  onNameChange: (value: string) => void;
  onNameBlur: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onPhoneBlur: (value: string) => void;
  onEmailChange: (value: string) => void;
  gameId: string;
  onGameChange: (value: string) => void;
  branchGames: FormGame[];
  snacks: FormSnack[];
  pickedSnacks: Record<string, number>;
  onSnackChange: (snackId: string, qty: number) => void;
  date: string;
  startIso: string | null;
  duration: number;
  price: number | null;
  rentalTotal: number;
  promoDiscount: number;
  snackTotal: number;
  grandTotal: number;
  activePromo: PromoOffering | null;
  cfg: BookingConfig | null;
}) {
  return (
    <div className="space-y-5">
      <h2 ref={stepHeadingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
        Data Diri
      </h2>
      {/* One required-marker style: `*` next to the label means required, "opsional"
          in the label means not. A legend explaining the asterisk only duplicates
          that in a second place to keep in sync. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">
            Nama <span className="text-danger">*</span>
          </Label>
          <Input
            id="name"
            required
            autoComplete="name"
            enterKeyHint="next"
            aria-invalid={fieldError.name ? true : undefined}
            aria-describedby={fieldError.name ? "name-error" : undefined}
            value={customer.name}
            maxLength={80}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={(e) => onNameBlur(e.target.value)}
          />
          {fieldError.name && (
            <p id="name-error" className="text-xs text-danger">
              {fieldError.name}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">
            Nomor WhatsApp <span className="text-danger">*</span>
          </Label>
          <Input
            id="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            placeholder="08xx xxxx xxxx"
            aria-invalid={fieldError.phone ? true : undefined}
            aria-describedby={fieldError.phone ? "phone-error" : undefined}
            value={customer.phone}
            onChange={(e) => onPhoneChange(e.target.value)}
            onBlur={(e) => onPhoneBlur(e.target.value)}
          />
          {fieldError.phone && (
            <p id="phone-error" className="text-xs text-danger">
              {fieldError.phone}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email (opsional)</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          enterKeyHint="next"
          value={customer.email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="game">Game (opsional)</Label>
        <SelectField id="game" value={gameId} onChange={(e) => onGameChange(e.target.value)}>
          <option value="">Tanpa game tertentu</option>
          {branchGames.map((g) => (
            <option key={g.game_id} value={g.game_id}>
              {g.name}
            </option>
          ))}
        </SelectField>
      </div>

      <div className="space-y-2">
        <Label id="snacks-label">Snacks (opsional)</Label>
        <div role="group" aria-labelledby="snacks-label" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {snacks.map((s) => {
            const status = stockStatus(s);
            const soldOut = status === "out";
            // A convenience, not the guard. Stock can move between this render and
            // the submit, so the trigger on inventory_movements stays the thing that
            // actually refuses an oversell — this only stops the form offering a
            // number the shelf cannot honour.
            const cap = Math.min(20, s.stock);
            return (
              <div
                key={s.snack_id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm",
                  soldOut && "opacity-60",
                )}
              >
                <span className="min-w-0 truncate">
                  {s.name} · {rp(s.price)}
                  {/* Same rule as the menu, and for the same reason: the old
                      `stock <= min_stock` test labelled a sold-out item "stok tipis"
                      and never said it was gone. */}
                  {status !== "ok" && (
                    <span
                      className={cn(
                        "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        soldOut ? "bg-danger/15 text-error" : "bg-warning/15 text-warning",
                      )}
                    >
                      {soldOut ? "Habis" : "Stok tipis"}
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  min={0}
                  max={cap}
                  disabled={soldOut}
                  aria-label={`Jumlah ${s.name}`}
                  value={soldOut ? 0 : pickedSnacks[s.snack_id] ?? 0}
                  onChange={(e) =>
                    onSnackChange(s.snack_id, Math.max(0, Math.min(cap, Number(e.target.value) || 0)))
                  }
                  className="w-16 rounded-md border border-input bg-card px-2 py-1 text-right disabled:cursor-not-allowed"
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg bg-surface-low p-4 text-sm">
        <p className="flex justify-between">
          <span>
            Sewa {date} {startIso ? fmtTime(startIso) : "—"} · {fmtDuration(duration)}
            {activePromo && price !== null && (
              <span className="text-muted-foreground"> (normal {rp(price)})</span>
            )}
          </span>
          <span>{price === null ? "—" : rp(rentalTotal)}</span>
        </p>
        {/* The saving is stated, not subtracted: "Sewa" above already shows the promo
            price, so a minus here would read as a second discount that the total
            does not contain. */}
        {activePromo && (
          <p className="flex justify-between text-primary">
            <span>Promo {activePromo.name} · hemat</span>
            <span>{rp(promoDiscount)}</span>
          </p>
        )}
        <p className="flex justify-between">
          <span>Snacks</span>
          <span>{rp(snackTotal)}</span>
        </p>
        {activePromo?.bonus_snack_name && (
          <p className="flex justify-between text-xs text-muted-foreground">
            <span>Bonus dari promo</span>
            <span>
              {activePromo.bonus_quantity}× {activePromo.bonus_snack_name}
            </span>
          </p>
        )}
        <p className="font-display mt-2 flex justify-between border-t border-border pt-2 text-base">
          <span>Total</span>
          <span>{price === null ? "—" : rp(grandTotal)}</span>
        </p>
        {cfg && (
          <p className="mt-2 text-xs text-warning">
            Bayar dalam {cfg.payment_deadline_minutes} menit setelah booking dibuat.
          </p>
        )}
      </div>
    </div>
  );
}
