"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { SlotPicker, UnitStatusChip, isUnitBlocked } from "@/components/booking/availability-ui";
import { createClient } from "@/lib/supabase/client";
import { fmtDate, fmtDuration, fmtISODay, fmtTime, rp } from "@/lib/format";
import { stockStatus } from "@/lib/snack-stock";
import { phoneRegex, type Slot } from "@/lib/validations/booking";
import {
  eligibleOfferings,
  keepsEligibility,
  savingOf,
  type PromoContext,
  type PromoOffering,
} from "@/lib/promo-rules";
import { isSlotPreset, pickSlotStart, presetDay } from "@/lib/slot-preset";

/** Minimal shapes: only the fields the form renders ride in the RSC payload. */
export type FormBranch = { branch_id: string; name: string };
export type FormUnit = {
  unit_id: string;
  name: string;
  status: string;
  branch_id: string;
  facility_type_id: string;
  facility_types: { name: string; category: string } | null;
};
export type FormGame = {
  game_id: string;
  name: string;
  game_availability: { branch_id: string | null; available: boolean }[];
};
export type FormSnack = { snack_id: string; name: string; price: number; stock: number; min_stock: number };
import { SelectField } from "@/components/ui/select-field";

type BookingConfig = {
  minimum_duration_minutes: number;
  maximum_duration_minutes: number;
  booking_interval_minutes: number;
  payment_deadline_minutes: number;
  advance_booking_days: number;
};

function durationOptions(cfg: BookingConfig | null) {
  const min = cfg?.minimum_duration_minutes ?? 60;
  const max = cfg?.maximum_duration_minutes ?? 360;
  // Fallback 60, bukan 30: satu jam adalah satu-satunya durasi yang bisa dipilih
  // sejak opsi 30 menit dihapus (migrasi 0021).
  const step = cfg?.booking_interval_minutes ?? 60;
  const out: number[] = [];
  for (let d = min; d <= max; d += step) out.push(d);
  return out;
}

/** Same rules the server applies, so a mistake is reported on the field itself instead
 *  of arriving as a generic "Data booking tidak valid" after the POST. */
function nameError(value: string): string | undefined {
  return value.trim().length < 2 ? "Nama wajib diisi (minimal 2 huruf)." : undefined;
}

function phoneError(value: string): string | undefined {
  const phone = value.trim();
  if (!phone) return "Nomor WhatsApp wajib diisi.";
  if (!phoneRegex.test(phone)) return "Nomor WhatsApp tidak valid (6–20 karakter angka).";
  return undefined;
}

function Stepper({ step }: { step: number }) {
  const labels = ["Tempat", "Waktu", "Data Diri"];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {labels.map((l, i) => {
        const n = i + 1;
        return (
          <li key={l} className="flex items-center gap-2">
            <span
              aria-current={step === n ? "step" : undefined}
              className={`grid size-6 place-items-center rounded-full text-xs font-semibold ${
                step === n
                  ? "bg-primary text-primary-foreground"
                  : step > n
                    ? "bg-primary/20 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {step > n ? "✓" : n}
            </span>
            <span className={step === n ? "font-medium text-foreground" : "text-muted-foreground"}>{l}</span>
            {n < labels.length && <span aria-hidden className="mx-1 w-6 border-t border-border" />}
          </li>
        );
      })}
    </ol>
  );
}

export function BookingForm({
  branches,
  units,
  snacks,
  games,
  initialUnit,
  initialBranch,
  initialType,
  initialSlot,
  promoOfferings = [],
  initialPromo,
  initialDuration,
}: {
  branches: FormBranch[];
  units: FormUnit[];
  snacks: FormSnack[];
  games: FormGame[];
  initialUnit?: string;
  initialBranch?: string;
  /** facility_type_id from the instant-booking widget. */
  initialType?: string;
  /** "evening" | "midnight" | "tomorrow"; anything else is ignored. */
  initialSlot?: string;
  /** ACTIVE promo packages, with the normal price each is measured against. */
  promoOfferings?: PromoOffering[];
  /** promotion_id from /promo — preselects it and pins its duration. */
  initialPromo?: string;
  /** Duration (minutes) that came with the deep link. */
  initialDuration?: number;
}) {
  const router = useRouter();
  const db = useMemo(() => createClient(), []);

  const preset = isSlotPreset(initialSlot) ? initialSlot : null;

  const [step, setStep] = useState(initialUnit ? 2 : 1);
  const [branchId, setBranchId] = useState(initialBranch ?? branches[0]?.branch_id ?? "");
  const [unitId, setUnitId] = useState(initialUnit ?? "");
  const [typeId, setTypeId] = useState(initialType ?? "");
  const [cfg, setCfg] = useState<BookingConfig | null>(null);

  const minDate = useMemo(() => fmtISODay(new Date()), []);
  const maxDate = useMemo(
    () => fmtISODay(new Date(Date.now() + (cfg?.advance_booking_days ?? 30) * 86_400_000)),
    [cfg],
  );
  // The widget's "Malam Ini" / "Besok Siang" lands on a specific day, so the
  // date box opens there instead of on today.
  const [date, setDate] = useState(() => (preset ? presetDay(preset) : minDate));
  const [duration, setDuration] = useState(initialDuration ?? 60);
  const [promotionId, setPromotionId] = useState<string | null>(initialPromo ?? null);
  const [price, setPrice] = useState<number | null>(null);
  const [gameId, setGameId] = useState("");
  const [pickedSnacks, setPickedSnacks] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Error per-field untuk step 3. Server sudah menolak nama/nomor kosong
  // (createBookingSchema), tapi tombol yang mati sendiri tidak menjelaskan apa pun —
  // pengguna perlu diberi tahu kolom mana yang wajib.
  const [fieldError, setFieldError] = useState<{ name?: string; phone?: string }>({});

  // Slot grid for the chosen unit/day/duration, so the picker can say why a
  // slot is unavailable and when it frees up rather than listing bare times.
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsNonce, setSlotsNonce] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const [startIso, setStartIso] = useState<string | null>(null);
  const startIsoRef = useRef(startIso);
  const presetPending = useRef(false);
  useEffect(() => {
    startIsoRef.current = startIso;
  }, [startIso]);

  const rentalUnits = useMemo(
    () => units.filter((u) => u.branch_id === branchId && u.facility_types?.category === "RENTAL"),
    [units, branchId],
  );

  // ---- promo -----------------------------------------------------------------
  // R2/R4: what the customer could book right now, and what is actually selected.
  const selectedUnit = useMemo(
    () => units.find((u) => u.unit_id === unitId) ?? null,
    [units, unitId],
  );
  const promoContext: PromoContext = useMemo(
    () => ({
      branchId,
      facilityTypeId: selectedUnit?.facility_type_id ?? null,
      durationMinutes: duration,
    }),
    [branchId, selectedUnit, duration],
  );
  const promoOptions = useMemo(
    () => eligibleOfferings(promoOfferings, promoContext),
    [promoOfferings, promoContext],
  );
  /** Null while the selection is not valid for the current context — the discount is
   *  then simply not applied, and the picker says why instead of quoting a ghost price. */
  const activePromo = useMemo(
    () =>
      promotionId
        ? promoOptions.find((o) => o.promotion_id === promotionId) ?? null
        : null,
    [promoOptions, promotionId],
  );

  // `?type=` from the instant-booking widget narrows the picker, and so does an active
  // promo: R4 pins the room type too, because the package is priced for one type of
  // room. Whichever is set wins, and the "N unit disembunyikan" line below the filter
  // is what explains the rest to the customer.
  const effectiveTypeId = activePromo?.facility_type_id ?? typeId;
  const branchUnits = useMemo(
    () => (effectiveTypeId ? rentalUnits.filter((u) => u.facility_type_id === effectiveTypeId) : rentalUnits),
    [rentalUnits, effectiveTypeId],
  );
  const hiddenByType = rentalUnits.length - branchUnits.length;
  /** A promo that was preselected from a deep link but no longer matches (ended,
   *  wrong branch, wrong duration) must not linger as a selection. */
  useEffect(() => {
    if (!promotionId) return;
    // Before a unit is picked there is no facility type to check against. Clearing here
    // would throw away the promo the customer arrived with from /promo, so the check
    // waits until the context exists.
    if (!selectedUnit) return;
    const stillThere = promoOfferings.some(
      (o) => o.promotion_id === promotionId && keepsEligibility(o, promoContext),
    );
    if (!stillThere) setPromotionId(null);
  }, [promotionId, promoOfferings, promoContext, selectedUnit]);

  const promoDiscount = activePromo ? savingOf(activePromo) : 0;
  /** What the rental line costs: the promo price when one applies, the normal price
   *  otherwise. `price` and the offering's normal_price both come from
   *  calculate_price(), so the two cannot disagree. */
  const rentalTotal = activePromo ? activePromo.promo_price : (price ?? 0);
  const branchGames = useMemo(
    () => games.filter((g) => g.game_availability.some((a) => a.branch_id === branchId && a.available)),
    [games, branchId],
  );

  useEffect(() => {
    if (!branchId) return;
    let alive = true;
    void (async () => {
      const { data: c } = await db.rpc("get_booking_config", { p_branch_id: branchId });
      if (!alive || !c) return;
      setCfg(c as BookingConfig);
    })();
    return () => {
      alive = false;
    };
  }, [db, branchId]);

  // A rental's price is a function of branch, room type and duration — never of the day.
  // Keyed on the room type rather than the unit list, so a re-render that rebuilds
  // `branchUnits` cannot re-fire the RPC, and `date` is gone, so moving to another day
  // no longer recomputes a number that did not change.
  const facilityTypeId = selectedUnit?.facility_type_id ?? null;

  useEffect(() => {
    setPrice(null);
    if (!facilityTypeId || !cfg) return;
    if (duration < cfg.minimum_duration_minutes || duration > cfg.maximum_duration_minutes) return;
    let alive = true;
    void (async () => {
      const { data: p } = await db.rpc("calculate_price", {
        p_branch_id: branchId,
        p_facility_type_id: facilityTypeId,
        p_duration_minutes: duration,
      });
      if (alive && typeof p === "number") setPrice(p);
    })();
    return () => {
      alive = false;
    };
  }, [db, branchId, facilityTypeId, duration, cfg]);

  // Efek 1: saat unit, tanggal, durasi, atau konfigurasi berubah — reset grid dan
  // tandai bahwa slot baru harus dipilih saat data tiba. Grid lama tidak dihapus
  // di sini; itu terjadi di efek 2 agar layar tidak kedip saat memperbarui.
  useEffect(() => {
    if (!branchId || !unitId || !date || !cfg) {
      setSlots(null);
      setSlotsError(null);
      setRefreshedAt(null);
      presetPending.current = false;
      return;
    }
    if (duration < cfg.minimum_duration_minutes || duration > cfg.maximum_duration_minutes) {
      setSlots(null);
      setSlotsError(`Durasi harus antara ${cfg.minimum_duration_minutes} dan ${cfg.maximum_duration_minutes} menit.`);
      setRefreshedAt(null);
      presetPending.current = false;
      return;
    }
    // Konteks berubah: grid lama tidak valid lagi, tandai untuk dipilih ulang saat
    // data baru tiba. Jangan setSlots(null) di sini — biarkan efek 2 tetap menampilkan
    // grid lama sampai data baru siap.
    presetPending.current = true;
  }, [branchId, unitId, date, duration, cfg]);

  // Efek 2: ambil ulang grid saat konteks atau slotsNonce berubah. Mempertahankan
  // grid lama selama memuat (tidak ada skeleton yang menutupi kotak yang ada).
  useEffect(() => {
    if (!branchId || !unitId || !date || !cfg) return;
    if (duration < cfg.minimum_duration_minutes || duration > cfg.maximum_duration_minutes) return;

    let alive = true;
    void (async () => {
      const params = new URLSearchParams({
        branch_id: branchId,
        unit_id: unitId,
        date,
        duration_minutes: String(duration),
      });
      try {
        const res = await fetch(`/api/slots?${params}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error?.message ?? `Gagal memuat slot (${res.status})`);
        if (!alive) return;
        const next: Slot[] = body.slots ?? [];
        setSlots(next);
        setRefreshedAt(Date.now());

        if (presetPending.current) {
          // Konteks baru: coba pasang preset (mis. ?slot=evening → 20:00), atau
          // biarkan null jika tidak ada yang cocok.
          const picked = preset ? pickSlotStart(next, preset) : null;
          setStartIso(picked);
          startIsoRef.current = picked;
          presetPending.current = false;
        } else {
          // Refresh manual atau nonce bump: pertahankan pilihan saat masih valid,
          // else kosongkan.
          if (
            startIsoRef.current &&
            !next.some((s) => s.slot_start === startIsoRef.current && s.state === "AVAILABLE")
          ) {
            setStartIso(null);
            startIsoRef.current = null;
          }
        }
      } catch (e) {
        if (alive) {
          setSlots([]);
          setSlotsError(e instanceof Error ? e.message : "Gagal memuat slot");
          setRefreshedAt(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [branchId, unitId, date, duration, cfg, preset, slotsNonce]);

  // Refetch saat tab kembali aktif, agar ketersediaan tidak basi. Maksimal sekali
  // per 15 detik, hanya di step 2 atau seterusnya. Sengaja tidak refetch saat masuk
  // step 3 — data dari step 2 masih segar, dan konflik tetap ditangani server.
  const lastRefetchRef = useRef(0);
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (step < 2) return;
      const now = Date.now();
      if (now - lastRefetchRef.current < 15_000) return;
      lastRefetchRef.current = now;
      setSlotsNonce((n) => n + 1);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [step]);

  const freeSlots = useMemo(
    () => (slots ?? []).filter((s) => s.state === "AVAILABLE"),
    [slots],
  );

  const snackTotal = useMemo(
    () => snacks.reduce((sum, s) => sum + (pickedSnacks[s.snack_id] ?? 0) * s.price, 0),
    [snacks, pickedSnacks],
  );

  /** R5: the discount comes off the rental only, never the snacks. `rentalTotal` already
   *  *is* the discounted figure while a promo is active (it reads `promo_price` straight
   *  from the same calculate_price pair the normal price comes from), so subtracting the
   *  saving again here would count it twice — and would drift whenever the two prices
   *  disagree by a rounding step. */
  const grandTotal = rentalTotal + snackTotal;

  const timeValid = startIso != null && slots?.some((s) => s.slot_start === startIso && s.state === "AVAILABLE");

  /** One reason for the primary button being dead, computed once and reused as `disabled`,
   *  the hint under it, and its `aria-describedby`. Two separate conditions is how the
   *  label and the reason end up disagreeing for a frame. */
  const blockReason = (() => {
    if (step === 1) return unitId ? null : "Pilih unit dulu.";
    if (step !== 2) return null;
    if (slots === null) return "Memuat ketersediaan jam…";
    if (freeSlots.length === 0) return "Tidak ada jam kosong untuk pilihan ini.";
    if (!timeValid) return "Pilih jam mulai yang tersedia.";
    if (price === null) return "Menghitung harga…";
    return null;
  })();

  // Step changes move focus to that step's heading, so a keyboard or screen-reader user
  // lands inside the new step instead of being left where the previous button used to be.
  // Skipped on mount: a deep link that opens straight on step 2 must not steal focus from
  // wherever the browser put it.
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const lastStepRef = useRef(step);
  useEffect(() => {
    if (lastStepRef.current === step) return;
    lastStepRef.current = step;
    stepHeadingRef.current?.focus();
  }, [step]);

  // `initialDuration` arrives from the URL before the branch's own rules do, so it cannot
  // be checked in the useState initializer — cfg only exists after a fetch. Until it lands
  // the picker simply shows no matching option; this corrects it as soon as it can.
  useEffect(() => {
    if (!cfg) return;
    const options = durationOptions(cfg);
    if (options.includes(duration)) return;
    // A promo's duration belongs to the package (R4), not to the picker, and the deep link
    // that carried it in may point at a length the branch's grid does not offer. Correcting
    // it would silently undo the promo the customer arrived with.
    if (
      promotionId &&
      (initialDuration === duration || activePromo?.duration_minutes === duration)
    ) {
      return;
    }
    setDuration(options[0] ?? duration);
  }, [cfg, duration, promotionId, initialDuration, activePromo]);

  async function submit() {
    // Wajib diisi: nama (minimal 2 huruf, sama seperti batas server) dan nomor
    // WhatsApp. Dicek sebelum fetch supaya pesannya menyebut kolomnya, bukan
    // "Data booking tidak valid" generik dari API.
    const missing: { name?: string; phone?: string } = {};
    const n = nameError(customer.name);
    if (n) missing.name = n;
    const p = phoneError(customer.phone);
    if (p) missing.phone = p;
    setFieldError(missing);
    if (missing.name || missing.phone) {
      setError(`Lengkapi data diri dulu: ${[missing.name, missing.phone].filter(Boolean).join(" ")}`);
      document.getElementById(missing.name ? "name" : "phone")?.focus();
      return;
    }
    // R4: never send a promo that the current context no longer qualifies for. The
    // server would reject it, and a 400 here reads like the form is broken.
    if (promotionId && !activePromo) {
      setError("Promo yang dipilih tidak berlaku lagi. Pilih ulang atau lanjut tanpa promo.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: branchId,
          unit_id: unitId,
          customer_name: customer.name,
          customer_phone: customer.phone,
          ...(customer.email ? { customer_email: customer.email } : {}),
          // Only ever sent when it still matches the context — see the guard in submit().
          ...(activePromo ? { promotion_id: activePromo.promotion_id } : {}),
          start_at: startIso,
          duration_minutes: duration,
          ...(gameId ? { game_id: gameId } : {}),
          snacks: Object.entries(pickedSnacks)
            .filter(([, q]) => q > 0)
            // A quantity can outlive the availability that allowed it: the form stays
            // open while someone else buys the last one. Clamp against the stock this
            // render knows about instead of sending a number that is already known to be
            // impossible. The database still refuses anything that slips through here.
            .map(([snack_id, quantity]) => {
              const known = snacks.find((s) => s.snack_id === snack_id);
              return { snack_id, quantity: known ? Math.min(quantity, known.stock) : 0 };
            })
            .filter((s) => s.quantity > 0),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(body?.error?.message ?? `Gagal booking (${res.status})`);
        (err as { code?: string }).code = body?.error?.code;
        throw err;
      }
      router.push(`/tiket/${body.booking.booking_code}`);
    } catch (e) {
      // Only a failure re-enables the form. On success the router is already navigating
      // away, and flipping the button back to "Buat Booking" invites a second submit of
      // the same booking while the first is still in flight.
      setSubmitting(false);
      const errCode = e instanceof Error && "code" in e ? (e as { code?: string }).code : undefined;
      // Konflik slot (23P01): orang lain mengambil jam yang sama. Kembali ke step 2,
      // kosongkan pilihan, muat ulang grid, dan tunjukkan pesan yang jelas.
      if (errCode === "23P01") {
        setStartIso(null);
        startIsoRef.current = null;
        setStep(2);
        setSlotsNonce((n) => n + 1);
        setError("Jam yang dipilih baru saja diambil orang lain. Silakan pilih jam lain.");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mt-8">
      <Card>
        <CardContent
          className={cn(
            "space-y-6 p-6",
            // Clearance for the docked bar, so the last field on a phone can be scrolled
            // out from under it.
            step > 1 && "pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-6",
          )}
        >
          <Stepper step={step} />

        {error && (
          <p role="alert" className="rounded-lg bg-danger/15 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <h2 ref={stepHeadingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
              Tempat
            </h2>
            <div className="space-y-2">
              <Label htmlFor="branch">Cabang</Label>
              <SelectField
                id="branch"
                value={branchId}
                onChange={(e) => {
                  const nextBranch = e.target.value;
                  setBranchId(nextBranch);
                  setUnitId("");
                  // Jam yang dipilih milik unit lama, jadi harus ikut hilang; membiarkannya
                  // berarti ringkasan di langkah berikutnya mengutip unit berbeda pada
                  // tanggal lama.
                  setStartIso(null);
                  setSlots(null);
                  // Game adalah ketersediaan per cabang — yang valid untuk cabang lama belum
                  // tentu ada di yang baru.
                  setGameId("");
                  // Tipe dari widget hanya dibuang kalau memang tidak ada unit bertipe itu
                  // di cabang baru. Mengosongkannya tanpa syarat akan membuang filter yang
                  // masih relevan.
                  if (typeId && !units.some((u) => u.branch_id === nextBranch && u.facility_type_id === typeId)) {
                    setTypeId("");
                  }
                }}
              >
                {branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.name}
                  </option>
                ))}
              </SelectField>
            </div>

            {typeId && (
              <p className="flex items-center justify-between gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
                <span>
                  Disaring ke{" "}
                  <strong className="font-medium">
                    {rentalUnits.find((u) => u.facility_type_id === typeId)?.facility_types?.name ??
                      "tipe konsol"}
                  </strong>
                  {hiddenByType > 0 && ` · ${hiddenByType} unit disembunyikan`}
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setTypeId("")}>
                  Semua tipe
                </Button>
              </p>
            )}

            {branchUnits.length === 0 ? (
              <EmptyState
                title={typeId ? "Tidak ada unit tipe ini di cabang ini" : "Belum ada unit di cabang ini"}
              />
            ) : (
              <div role="radiogroup" aria-label="Pilih unit" className="grid gap-2 md:grid-cols-2">
                {branchUnits.map((u) => (
                  <button
                    key={u.unit_id}
                    type="button"
                    role="radio"
                    aria-checked={unitId === u.unit_id}
                    aria-disabled={isUnitBlocked(u.status)}
                    disabled={isUnitBlocked(u.status)}
                    onClick={() => setUnitId(u.unit_id)}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                      unitId === u.unit_id
                        ? "border-primary bg-primary/10"
                        : isUnitBlocked(u.status)
                          ? "border-border/50 bg-muted/40 text-muted-foreground cursor-not-allowed"
                          : "border-border hover:border-primary/60"
                    }`}
                  >
                    <span>
                      <span className="font-display block">{u.name}</span>
                      <span className="text-muted-foreground">{u.facility_types?.name}</span>
                    </span>
                    <UnitStatusChip status={u.status} />
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <Button
                type="button"
                className="w-full"
                disabled={!!blockReason}
                aria-describedby={blockReason ? "unit-hint" : undefined}
                onClick={() => setStep(2)}
              >
                Pilih Waktu →
              </Button>
              {blockReason && (
                <p id="unit-hint" className="text-center text-xs text-warning">
                  {blockReason}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 ref={stepHeadingRef} tabIndex={-1} className="font-display text-lg uppercase scroll-mt-28">
              Waktu
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Tanggal</Label>
                <Input id="date" type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
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
                  onChange={(e) => setDuration(Number(e.target.value))}
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
                  onPick={setStartIso}
                  durationMinutes={duration}
                  onRefresh={() => setSlotsNonce((n) => n + 1)}
                  refreshedAt={refreshedAt}
                  onNextDay={() => {
                    const next = new Date(Date.parse(date + "T00:00:00+07:00") + 86_400_000);
                    const nextDay = fmtISODay(next);
                    if (nextDay <= maxDate) setDate(nextDay);
                  }}
                />
              )}
            </fieldset>

            {!timeValid && slots && freeSlots.length > 0 && (
              <p className="text-sm text-warning">Pilih satu jam mulai yang tersedia.</p>
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
            {selectedUnit && promoOfferings.length > 0 && (
              <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="space-y-2">
                  <Label htmlFor="promo">Promo</Label>
                  <SelectField
                    id="promo"
                    value={activePromo?.promotion_id ?? ""}
                    onChange={(e) => {
                      const next = e.target.value || null;
                      setPromotionId(next);
                      // Snap the duration to the package (R4) rather than silently
                      // dropping a promo the customer just picked.
                      const picked = next ? promoOptions.find((o) => o.promotion_id === next) : null;
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
                      onClick={() => setPromotionId(null)}
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
        )}

        {step === 3 && (
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
                  onChange={(e) => {
                    setCustomer({ ...customer, name: e.target.value });
                    if (fieldError.name) setFieldError({ ...fieldError, name: undefined });
                  }}
                  onBlur={(e) => {
                    const message = nameError(e.target.value);
                    if (message !== fieldError.name) setFieldError({ ...fieldError, name: message });
                  }}
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
                  onChange={(e) => {
                    setCustomer({ ...customer, phone: e.target.value });
                    if (fieldError.phone) setFieldError({ ...fieldError, phone: undefined });
                  }}
                  onBlur={(e) => {
                    const message = phoneError(e.target.value);
                    if (message !== fieldError.phone) setFieldError({ ...fieldError, phone: message });
                  }}
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
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="game">Game (opsional)</Label>
              <SelectField
                id="game"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
              >
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
                        setPickedSnacks({
                          ...pickedSnacks,
                          [s.snack_id]: Math.max(0, Math.min(cap, Number(e.target.value) || 0)),
                        })
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
        )}
      </CardContent>
      </Card>

      {/* Docked summary + the one primary button for this step. It sits outside the Card
          because Card sets `overflow-hidden`: a sticky child of an overflow-hidden box pins
          to that box rather than to the viewport, which looks correct until you scroll.
          One button, one place — the per-step button rows below are gone, so there is no
          duplicate for a screen reader to walk through. */}
      {step > 1 && (
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
            <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(step - 1)}>
              ← Kembali
            </Button>
            {step === 2 ? (
              <Button
                type="button"
                className="flex-1"
                disabled={!!blockReason}
                aria-describedby={blockReason ? "next-hint" : undefined}
                onClick={() => setStep(3)}
              >
                Data Diri →
              </Button>
            ) : (
              // Nama & nomor sengaja tidak ikut menentukan `disabled`: klik harus memunculkan
              // alert yang menyebut kolom mana yang kosong.
              <Button type="button" className="flex-1" disabled={submitting || !timeValid} onClick={submit}>
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
      )}
    </div>
  );
}
