"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UnitActions({ unitId, status }: { unitId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(next: "AVAILABLE" | "MAINTENANCE" | "OFFLINE") {
    let reason: string | undefined;
    if (next !== "AVAILABLE") {
      const raw = prompt(`Alasan ${next.toLowerCase()} (mis. stik rusak)?`);
      // Cancel means "don't move the unit" — the old code read null as "no
      // reason" and proceeded with the move anyway.
      if (raw === null) return;
      reason = raw || undefined;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/units/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unitId, status: next, ...(reason ? { reason } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error?.message ?? "Gagal mengubah status");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {["MAINTENANCE", "OFFLINE"].map((s) => (
        <Button
          key={s}
          size="xs"
          variant="destructive"
          disabled={busy || status === s}
          onClick={() => set(s as "MAINTENANCE" | "OFFLINE")}
        >
          {s === "MAINTENANCE" ? "Maintenance" : "Offline"}
        </Button>
      ))}
      {(status === "MAINTENANCE" || status === "OFFLINE" || status === "IN_ORDER") && (
        <Button size="xs" disabled={busy} onClick={() => set("AVAILABLE")}>
          Set Ready
        </Button>
      )}
    </div>
  );
}
