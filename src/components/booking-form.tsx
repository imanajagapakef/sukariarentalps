"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { createClient } from "@/lib/supabase/client";
import { rp } from "@/lib/format";
import type { BranchRow, GameRow, SnackRow, UnitRow } from "@/lib/catalog";

type BookingConfig = {
  minimum_duration_minutes: number;
  maximum_duration_minutes: number;
  booking_interval_minutes: number;
  payment_deadline_minutes: number;
  advance_booking_days: number;
};

function timeSlots(interval: number) {
  const slots: string[] = [];
  for (let m = 0; m < 24 * 60; m += interval) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return slots;
}

function durationOptions(cfg: BookingConfig | null) {
  const min = cfg?.minimum_duration_minutes ?? 60;
  const max = cfg?.maximum_duration_minutes ?? 360;
  const step = cfg?.booking_interval_minutes ?? 30;
  const out: number[] = [];
  for (let d = min; d <= max; d += step) out.push(d);
  return out;
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
}: {
  branches: BranchRow[];
  units: UnitRow[];
  snacks: SnackRow[];
  games: GameRow[];
  initialUnit?: string;
  initialBranch?: string;
}) {
  const router = useRouter();
  const db = useMemo(() => createClient(), []);

  const [step, setStep] = useState(initialUnit ? 2 : 1);
  const [branchId, setBranchId] = useState(initialBranch ?? branches[0]?.branch_id ?? "");
  const [unitId, setUnitId] = useState(initialUnit ?? "");
  const [cfg, setCfg] = useState<BookingConfig | null>(null);

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const maxDate = useMemo(
    () => new Date(Date.now() + (cfg?.advance_booking_days ?? 30) * 86_400_000).toISOString().slice(0, 10),
    [cfg],
  );
  const [date, setDate] = useState(minDate);
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(60);
  const [price, setPrice] = useState<number | null>(null);
  const [gameId, setGameId] = useState("");
  const [pickedSnacks, setPickedSnacks] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const branchUnits = useMemo(
    () => units.filter((u) => u.branch_id === branchId && u.facility_types?.category === "RENTAL"),
    [units, branchId],
  );
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

  useEffect(() => {
    setPrice(null);
    const unit = branchUnits.find((u) => u.unit_id === unitId);
    if (!unit || !date || !cfg) return;
    if (duration < cfg.minimum_duration_minutes || duration > cfg.maximum_duration_minutes) return;
    let alive = true;
    void (async () => {
      const { data: p } = await db.rpc("calculate_price", {
        p_branch_id: branchId,
        p_facility_type_id: unit.facility_type_id,
        p_duration_minutes: duration,
      });
      if (alive && typeof p === "number") setPrice(p);
    })();
    return () => {
      alive = false;
    };
  }, [db, branchId, unitId, date, duration, cfg, branchUnits]);

  const snackTotal = useMemo(
    () => snacks.reduce((sum, s) => sum + (pickedSnacks[s.snack_id] ?? 0) * s.price, 0),
    [snacks, pickedSnacks],
  );

  const timeValid =
    date > minDate ||
    new Date(`${date}T${time}:00+07:00`).getTime() > Date.now();

  async function submit() {
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
          start_at: new Date(`${date}T${time}:00+07:00`).toISOString(),
          duration_minutes: duration,
          ...(gameId ? { game_id: gameId } : {}),
          snacks: Object.entries(pickedSnacks)
            .filter(([, q]) => q > 0)
            .map(([snack_id, quantity]) => ({ snack_id, quantity })),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message ?? `Gagal booking (${res.status})`);
      router.push(`/tiket/${body.booking.booking_code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-8">
      <CardContent className="space-y-6 p-6">
        <Stepper step={step} />

        {error && (
          <p role="alert" className="rounded-lg bg-danger/15 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="branch">Cabang</Label>
              <select
                id="branch"
                value={branchId}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setUnitId("");
                }}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.branch_id} value={b.branch_id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {branchUnits.length === 0 ? (
              <EmptyState title="Belum ada unit di cabang ini" />
            ) : (
              <div role="radiogroup" aria-label="Pilih unit" className="grid gap-2">
                {branchUnits.map((u) => (
                  <button
                    key={u.unit_id}
                    type="button"
                    role="radio"
                    aria-checked={unitId === u.unit_id}
                    onClick={() => setUnitId(u.unit_id)}
                    className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                      unitId === u.unit_id ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"
                    }`}
                  >
                    <span>
                      <span className="font-display block uppercase">{u.name}</span>
                      <span className="text-muted-foreground">{u.facility_types?.name}</span>
                    </span>
                    {u.status !== "AVAILABLE" && (
                      <span className="text-xs text-warning">
                        {u.status === "IN_USE" ? "sedang dipakai" : u.status === "BOOKED" ? "dipesan" : u.status.toLowerCase()}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <Button type="button" className="w-full" disabled={!unitId} onClick={() => setStep(2)}>
              Pilih Waktu →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="date">Tanggal</Label>
                <Input id="date" type="date" min={minDate} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="time">Jam Mulai</Label>
                <select
                  id="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                >
                  {timeSlots(cfg?.booking_interval_minutes ?? 30).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Durasi</Label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
                >
                  {durationOptions(cfg).map((d) => (
                    <option key={d} value={d}>
                      {d} menit
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!timeValid && (
              <p className="text-sm text-warning">Waktu mulai sudah terlewat — pilih jam yang akan datang.</p>
            )}

            <p className="text-sm text-muted-foreground">
              {price === null ? "Menunggu harga…" : `Harga sewa: ${rp(price)}`}
              {snackTotal > 0 && ` · snack ${rp(snackTotal)}`}
            </p>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(1)}>
                ← Kembali
              </Button>
              <Button type="button" className="flex-1" disabled={!timeValid || price === null} onClick={() => setStep(3)}>
                Data Diri →
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nama</Label>
                <Input
                  id="name"
                  value={customer.name}
                  maxLength={80}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Nomor WhatsApp</Label>
                <Input
                  id="phone"
                  inputMode="tel"
                  placeholder="08xx xxxx xxxx"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email (opsional)</Label>
              <Input
                id="email"
                type="email"
                value={customer.email}
                onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="game">Game (opsional)</Label>
              <select
                id="game"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">Tanpa game tertentu</option>
                {branchGames.map((g) => (
                  <option key={g.game_id} value={g.game_id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label id="snacks-label">Snacks (opsional)</Label>
              <div role="group" aria-labelledby="snacks-label" className="grid gap-2 sm:grid-cols-2">
                {snacks.map((s) => (
                  <div key={s.snack_id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
                    <span className="min-w-0 truncate">
                      {s.name} · {rp(s.price)}
                      {s.stock <= s.min_stock && <span className="ml-1 text-xs text-warning">stok tipis</span>}
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      aria-label={`Jumlah ${s.name}`}
                      value={pickedSnacks[s.snack_id] ?? 0}
                      onChange={(e) =>
                        setPickedSnacks({
                          ...pickedSnacks,
                          [s.snack_id]: Math.max(0, Math.min(20, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-16 rounded-md border border-input bg-card px-2 py-1 text-right"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-surface-low p-4 text-sm">
              <p className="flex justify-between">
                <span>
                  Sewa {date} {time} · {duration} menit
                </span>
                <span>{price === null ? "—" : rp(price)}</span>
              </p>
              <p className="flex justify-between">
                <span>Snacks</span>
                <span>{rp(snackTotal)}</span>
              </p>
              <p className="font-display mt-2 flex justify-between border-t border-border pt-2 text-base uppercase">
                <span>Total</span>
                <span>{price === null ? "—" : rp(price + snackTotal)}</span>
              </p>
              {cfg && (
                <p className="mt-2 text-xs text-warning">
                  Bayar dalam {cfg.payment_deadline_minutes} menit setelah booking dibuat.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(2)}>
                ← Kembali
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={submitting || !timeValid || !customer.name.trim() || !customer.phone.trim()}
                onClick={submit}
              >
                {submitting ? "Memproses…" : "Buat Booking"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
