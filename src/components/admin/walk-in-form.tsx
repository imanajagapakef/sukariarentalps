"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { rp } from "@/lib/format";

type Branch = { id: string; name: string };
type Unit = { id: string; name: string; branchId: string; status: string };

export function WalkInForm({ branches, units }: { branches: Branch[]; units: Unit[] }) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [duration, setDuration] = useState(60);
  const [payMethod, setPayMethod] = useState<"CASH" | "QRIS_MANUAL" | "TRANSFER_MANUAL">("CASH");
  const [startAt, setStartAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const branchUnits = useMemo(() => units.filter((u) => u.branchId === branchId), [units, branchId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
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
        ...(startAt ? { start_at: new Date(startAt).toISOString() } : {}),
      }),
    });
    const body = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Gagal membuat walk-in");
      return;
    }
    setResult(`${body.booking.booking_code} · ${rp(body.booking.total_amount)} · ${body.booking.status}`);
    setUnitId("");
    setName("");
    setPhone("");
    router.refresh();
  }

  const selectCls = "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm";

  return (
    <Card className="mt-6">
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wi-branch">Cabang</Label>
              <select id="wi-branch" className={selectCls} value={branchId} onChange={(e) => { setBranchId(e.target.value); setUnitId(""); }}>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-unit">Unit</Label>
              <select id="wi-unit" className={selectCls} value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                <option value="">Pilih unit…</option>
                {branchUnits.map((u) => (
                  <option key={u.id} value={u.id} disabled={u.status === "MAINTENANCE" || u.status === "OFFLINE"}>
                    {u.name} {u.status !== "AVAILABLE" ? `(${u.status})` : ""}
                  </option>
                ))}
              </select>
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
              <Label htmlFor="wi-duration">Durasi (menit)</Label>
              <select id="wi-duration" className={selectCls} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {[30, 60, 90, 120, 180, 240, 300, 360].map((d) => (
                  <option key={d} value={d}>{d} menit</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wi-pay">Bayar pakai</Label>
              <select id="wi-pay" className={selectCls} value={payMethod} onChange={(e) => setPayMethod(e.target.value as typeof payMethod)}>
                <option value="CASH">Tunai</option>
                <option value="QRIS_MANUAL">QRIS (manual)</option>
                <option value="TRANSFER_MANUAL">Transfer (manual)</option>
              </select>
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
