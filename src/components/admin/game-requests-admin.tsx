"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { GameRequestRow } from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

/**
 * The smells of triage, mirrored from the `request_status` enum (migration 0002).
 * APPROVED/ADDED/REJECTED all leave the public wishlist on their own — the public
 * list only shows REQUESTED and UNDER_REVIEW — which is exactly why staff still
 * need to see them here: otherwise there is no way to tell "done" from "forgotten",
 * and nothing to delete once a game actually ships.
 */
const STATUS: { value: string; label: string; tone: string }[] = [
  { value: "REQUESTED", label: "Diminta", tone: "bg-muted text-muted-foreground" },
  { value: "UNDER_REVIEW", label: "Ditinjau", tone: "bg-amber/15 text-amber" },
  { value: "APPROVED", label: "Disetujui", tone: "bg-primary/15 text-primary" },
  { value: "ADDED", label: "Sudah ada", tone: "bg-primary/15 text-primary" },
  { value: "REJECTED", label: "Ditolak", tone: "bg-danger/15 text-danger" },
];

export function GameRequestsAdmin({ requests }: { requests: GameRequestRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: "PATCH" | "DELETE", id: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/game-requests/${encodeURIComponent(id)}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error?.message ?? "Gagal menyimpan perubahan.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (requests.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Belum ada request game. Halaman /games akan mengisi daftar ini begitu pelanggan mengirim judul.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {error && <p className="text-sm text-danger">{error}</p>}
      {requests.map((r) => {
        const meta = STATUS.find((s) => s.value === r.status) ?? STATUS[0];
        return (
          <div
            key={r.request_id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.game_name}</span>
              <span className="block font-mono text-xs text-muted-foreground">
                {r.request_id} · {r.vote_count} vote
              </span>
            </span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold uppercase", meta.tone)}>
              {meta.label}
            </span>
            <SelectField
              size="sm"
              aria-label={`Status request ${r.game_name}`}
              className="w-36"
              value={r.status}
              disabled={busy}
              onChange={(e) => {
                if (e.target.value !== r.status) void call("PATCH", r.request_id, { status: e.target.value });
              }}
            >
              {STATUS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </SelectField>
            {/* Delete is offered even for APPROVED/ADDED rows: once the game is in the
                catalogue the request has served its purpose, and leaving it forever is
                how the wishlist turns into a graveyard. Votes cascade with it. */}
            <Button
              size="xs"
              variant="destructive"
              disabled={busy}
              title="Hapus request"
              onClick={() => {
                if (confirm(`Hapus request "${r.game_name}"?\n\nVote yang masuk ke request ini ikut terhapus.`)) {
                  void call("DELETE", r.request_id);
                }
              }}
            >
              <Trash2 aria-hidden className="size-3.5" /> Hapus
            </Button>
          </div>
        );
      })}
    </div>
  );
}
