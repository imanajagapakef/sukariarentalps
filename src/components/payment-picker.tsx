"use client";

import { useState } from "react";
import { Check, Lock } from "lucide-react";
import { StartPaymentButton } from "@/components/ticket-actions";
import { PAYMENT_CHANNELS, type PaymentMethodId } from "@/lib/validations/booking";
import { rp } from "@/lib/format";

/**
 * Method picker for the payment page.
 *
 * Midtrans Snap always renders its own chooser, so choosing here does two
 * things: it records the intent on payments.method and it narrows the Snap page
 * to a single channel via enabled_payments. The webhook's payment_type is still
 * the authority on what was actually paid.
 */
export function PaymentPicker({
  code,
  total,
  className,
}: {
  code: string;
  total: number;
  deadline?: string | null;
  className?: string;
}) {
  const [method, setMethod] = useState<PaymentMethodId>(PAYMENT_CHANNELS[0].id);
  const chosen = PAYMENT_CHANNELS.find((c) => c.id === method) ?? PAYMENT_CHANNELS[0];

  return (
    <div className={className}>
      <fieldset className="space-y-2">
        <legend className="text-xs uppercase tracking-[0.05em] text-primary">Metode pembayaran tersedia</legend>

        <div role="radiogroup" aria-label="Pilih metode pembayaran" className="flex flex-col gap-3">
          {PAYMENT_CHANNELS.map((c) => {
            const picked = method === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => setMethod(c.id)}
                className={`flex items-start gap-4 rounded-xl border p-4 text-left transition-all duration-200 ${
                  picked
                    ? "border-primary bg-primary/10 shadow-arcade-sm"
                    : "border-border hover:border-primary/60 hover:bg-card"
                }`}
              >
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full ${
                    picked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {picked && <Check className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-lg uppercase">{c.label}</span>
                    <span className="rounded bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">{c.badge}</span>
                  </span>
                  <span className="block text-xs uppercase tracking-wide text-primary">{c.sub}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{c.blurb}</span>
                  <span className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] uppercase">Biaya admin {c.fee}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <StartPaymentButton
        code={code}
        method={method}
        className="mt-5"
        label={`Lanjut Pembayaran (${rp(total)})`}
      />

      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock aria-hidden className="size-3.5" />
        QRIS lokal · Kasir verifikasi manual · {chosen.label}
      </p>
    </div>
  );
}
