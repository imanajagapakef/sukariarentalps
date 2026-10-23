"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { rp } from "@/lib/format";
import { SelectField } from "@/components/ui/select-field";
import { eligibleOfferings, savingOf, type PromoOffering } from "@/lib/promo-rules";

type Branch = { id: string; name: string };
type Unit = {
  id: string;
  name: string;
  branchId: string;
  status: string;
  /** Needed to decide which promos apply — a promo is priced for one type of room. */
  facilityTypeId: string;
};

export function WalkInForm({
  branches,
  units,
  promoOfferings = [],
  branchLocked = false,
}: {
  branches: Branch[];
  units: Unit[];
  promoOfferings?: PromoOffering[];
  /** The page already narrowed the branch list for pinned profiles; this shows it. */
  branchLocked?: boolean;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [duration, setDuration] = useState(60);
  const [promotionId, setPromotionId] = useState<string>("");
  const [payMethod, setPayMethod] = useState<"CASH" | "QRIS_MANUAL" | "TRANSFER_MANUAL">("CASH");
  const [startAt, setStartAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchUnits = useMemo(() => units.filter((u) => u.branchId === branchId), [units, branchId]);

  // The same eligibility the customer form uses, on the same list: a promo that is not
  // offered here would only fail at the RPC, after the cashier filled the form in.
  const promoOptions = useMemo(
    () =>
      eligibleOfferings(promoOfferings, {
        branchId,
        facilityTypeId: branchUnits.find((u) => u.id === unitId)?.facilityTypeId ?? null,
        durationMinutes: duration,
      }),
    [promoOfferings, branchId, branchUnits, unitId, duration],
  );
  const activePromo = promoOptions.find((o) => o.promotion_id === promotionId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/walk-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          unit_id: unitId,
          customer_name: name,
          customer_phone: phone,
          duration_minutes: duration,
          pay_method: payMethod,
          ...(promotionId ? { promotion_id: promotionId } : {}),
          ...(startAt ? { start_at: new Date(startAt).toISOString() } : {}),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Gagal membuat walk-in");
        return;
      }
      setResult(`${body.booking.booking_code} · ${rp(body.booking.total_amount)} · ${body.booking.status}`);
      setUnitId("");
      setName("");
      setPhone("");
      setPromotionId("");
      router.refresh();
    } finally {
      // A thrown fetch must not leave the cashier staring at a stuck spinner.
      setBusy(false);
    }
  }

  
  return (
    <Card className="mt-6">
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wi-branch">Cabang</Label>
              <SelectField
                id="wi-branch"
                value={branchId}
                disabled={branchLocked}
                onChange={(e) => { setBranchId(e.target.value); setUnitId(""); setPromotionId(""); }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </SelectField>
              {branchLocked && (
                <p className="text-xs text-muted-foreground">
                  Cabang dikunci sesuai penempatan profilmu.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-unit">Unit</Label>
              <SelectField id="wi-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="">Pilih unit…</option>
                {branchUnits.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.status === "MAINTENANCE" || u.status === "OFFLINE"}>
                    {u.name} {u.status !== "AVAILABLE" ? `(${u.status})` : ""}
                  </option>
                ))}
              </SelectField>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-name">Nama</Label>
              <Input id="wi-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-phone">No. WhatsApp</Label>
              <Input id="wi-phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-duration">Durasi</Label>
              <SelectField
                id="wi-duration"
                // A promo package is priced for one duration, so it pins this while
                // active; clearing the promo is the way to choose another length.
                disabled={!!activePromo}
                value={duration}
                onChange={(e) => {
                  setDuration(Number(e.target.value));
                  setPromotionId("");
                }}
              >
                {[60, 120, 180, 240, 300, 360].map((d) => (
                  <option key={d} value={d}>{d / 60} Jam</option>
                ))}
              </SelectField>
            </div>
            {unitId && promoOfferings.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="wi-promo">Promo</Label>
                <SelectField
                  id="wi-promo"
                  value={promotionId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPromotionId(next);
                    // Snap to the package length, the same way the customer form does.
                    const picked = promoOptions.find((o) => o.promotion_id === next);
                    if (picked) setDuration(picked.duration_minutes);
                  }}
                >
                  <option value="">Tanpa promo</option>
                  {promoOptions.map((o) => (
                    <option key={o.promotion_id} value={o.promotion_id}>
                      {o.name} — {o.facility_name} {o.duration_minutes / 60} jam · hemat {rp(savingOf(o))}
                    </option>
                  ))}
                </SelectField>
                {activePromo && (
                  <p className="text-xs text-muted-foreground">
                    {activePromo.name}: {rp(activePromo.promo_price)} untuk {activePromo.duration_minutes / 60} jam
                    {activePromo.bonus_snack_name &&
                      ` · bonus ${activePromo.bonus_quantity}× ${activePromo.bonus_snack_name} (selama stok)`}
                  </p>
                )}
                {!activePromo && promoOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tidak ada promo untuk unit & durasi ini.
                  </p>
                )}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="wi-pay">Bayar pakai</Label>
              <SelectField id="wi-pay" value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                <option value="CASH">Tunai</option>
                <option value="QRIS_MANUAL">QRIS (manual)</option>
                <option value="TRANSFER_MANUAL">Transfer (manual)</option>
              </SelectField>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="wi-start">Mulai (kosongkan = sekarang)</Label>
              <Input id="wi-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {result && <p className="rounded-lg bg-primary/10 p-3 text-sm text-primary">Booking dibuat: {result}</p>}

          <Button type="submit" className="w-full" disabled={busy || !unitId}>
            {busy ? "Memproses…" : "Buat Walk-in + Confirm"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
