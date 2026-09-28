"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const ACTIONS: Record<string, { label: string; action: string; danger?: boolean }[]> = {
  WAITING_PAYMENT: [
    { label: "Konfirmasi", action: "confirm" },
    { label: "Batalkan", action: "cancel", danger: true },
  ],
  CONFIRMED: [
    { label: "Check-in", action: "check_in" },
    { label: "No-show", action: "no_show", danger: true },
    { label: "Batalkan", action: "cancel", danger: true },
  ],
  IN_USE: [{ label: "Selesai (check-out)", action: "complete" }],
  COMPLETED: [{ label: "Unit Siap", action: "mark_ready" }],
};

export function ActionButtons({ code, status }: { code: string; status: string; source?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const buttons = ACTIONS[status] ?? [];

  async function run(action: string) {
    if (action === "cancel" && !confirm(`Batalkan ${code}?`)) return;
    setBusy(action);
    const res = await fetch(`/api/admin/bookings/${code}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      alert(body?.error?.message ?? "Aksi gagal");
      return;
    }
    router.refresh();
  }

  if (buttons.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {buttons.map((b) => (
        <Button
          key={b.action}
          size="sm"
          variant={b.danger ? "destructive" : "secondary"}
          disabled={busy !== null}
          onClick={() => run(b.action)}
        >
          {busy === b.action ? "…" : b.label}
        </Button>
      ))}
    </div>
  );
}
