"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader2, Power, TriangleAlert, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Next = "AVAILABLE" | "MAINTENANCE" | "OFFLINE";
type Draftable = Exclude<Next, "AVAILABLE">;

const META: Record<Draftable, { label: string; icon: typeof Wrench; hint: string }> = {
  MAINTENANCE: { label: "Maintenance", icon: Wrench, hint: "Unit diperbaiki / dirawat" },
  OFFLINE: { label: "Offline", icon: Power, hint: "Unit dimatikan sementara" },
};

/** Alasan yang paling sering dipakai kasir: satu ketukan, tanpa mengetik. */
const QUICK_REASONS = ["Stik rusak", "Layar bermasalah", "Koneksi / kabel", "Perlu dibersihkan", "Update sistem"];

export function UnitActions({ unitId, status }: { unitId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Next | null>(null);
  const [draft, setDraft] = useState<Draftable | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const awaitingRefresh = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Spinner bertahan sampai router.refresh() selesai, bukan cuma sampai POST selesai,
  // supaya tombol tidak sempat aktif lagi dengan status lama.
  useEffect(() => {
    if (!pending && awaitingRefresh.current) {
      awaitingRefresh.current = false;
      setBusy(null);
    }
  }, [pending]);

  useEffect(() => {
    if (draft) inputRef.current?.focus();
  }, [draft]);

  async function submit(next: Next, why?: string) {
    setError(null);
    setBusy(next);
    let ok = false;
    try {
      const res = await fetch("/api/admin/units/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unitId, status: next, ...(why ? { reason: why } : {}) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Gagal mengubah status");
        return;
      }
      ok = true;
      setDraft(null);
      setReason("");
      awaitingRefresh.current = true;
      startTransition(() => router.refresh());
    } catch {
      // A thrown fetch (network/TLS) must not leave every button disabled with no message.
      setError("Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.");
    } finally {
      if (!ok) setBusy(null);
    }
  }

  function open(next: Draftable) {
    setError(null);
    // Menutup = "jangan pindahkan unit", sama seperti Cancel pada prompt lama.
    setDraft((d) => (d === next ? null : next));
  }

  const locked = busy !== null || pending;
  const canReady = status === "MAINTENANCE" || status === "OFFLINE" || status === "IN_ORDER";
  const inSession = status === "IN_USE" || status === "BOOKED";

  return (
    <div className="flex min-w-52 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(META) as Draftable[]).map((s) => {
          const { label, icon: Icon } = META[s];
          const active = draft === s;
          return (
            <Button
              key={s}
              size="xs"
              variant="destructive"
              disabled={locked || status === s}
              aria-expanded={active}
              onClick={() => open(s)}
              className={cn("gap-1.5 transition-transform active:scale-95", active && "ring-2 ring-coral/60")}
            >
              <Icon aria-hidden className="size-3" />
              {label}
            </Button>
          );
        })}

        {canReady && (
          <Button
            size="xs"
            disabled={locked}
            aria-busy={busy === "AVAILABLE"}
            onClick={() => submit("AVAILABLE")}
            className="gap-1.5 font-bold transition-transform active:scale-95"
          >
            {busy === "AVAILABLE" ? (
              <Loader2 aria-hidden className="size-3 animate-spin" />
            ) : (
              <CircleCheck aria-hidden className="size-3" />
            )}
            {busy === "AVAILABLE" ? "Memproses…" : "Set Ready"}
          </Button>
        )}
      </div>

      {/* Form alasan inline: menggantikan prompt() yang memblokir dan sering di-suppress di tablet. */}
      {draft && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(draft, reason.trim() || undefined);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setDraft(null);
          }}
          className="w-full max-w-72 space-y-2 rounded-xl border border-coral/40 bg-coral/5 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-coral">{META[draft].label}</p>
              <p className="text-[11px] text-muted-foreground">{META[draft].hint}</p>
            </div>
            <button
              type="button"
              onClick={() => setDraft(null)}
              aria-label="Batal"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>

          {inSession && (
            <p className="flex items-start gap-1.5 rounded-md bg-amber/15 px-2 py-1.5 text-[11px] text-amber">
              <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              Unit sedang {status === "IN_USE" ? "dipakai" : "dipesan"}. Pastikan sesinya sudah beres.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  reason === r
                    ? "border-coral bg-coral/20 text-coral"
                    : "border-border bg-background/60 text-muted-foreground hover:border-coral/60 hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <input
            ref={inputRef}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={120}
            placeholder="Alasan (opsional), mis. stik kiri drift"
            aria-label="Alasan"
            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />

          <div className="flex gap-2">
            <Button type="submit" size="xs" variant="destructive" disabled={locked} className="flex-1 gap-1.5 font-bold">
              {busy === draft ? <Loader2 aria-hidden className="size-3 animate-spin" /> : null}
              {busy === draft ? "Memproses…" : `Ya, ${META[draft].label.toLowerCase()}`}
            </Button>
            <Button type="button" size="xs" variant="secondary" disabled={locked} onClick={() => setDraft(null)}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="flex max-w-72 items-start gap-1.5 rounded-md border border-coral/40 bg-coral/10 px-2 py-1 text-xs text-coral"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}