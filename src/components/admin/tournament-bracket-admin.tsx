"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TournamentBracket } from "@/components/tournament-bracket";
import {
  MATCH_STATUS_LABEL,
  isChampion,
  isScorable,
  roundsFor,
} from "@/lib/tournament-rules";
import type { AdminMatch, AdminRegistration } from "@/lib/tournaments-admin";

/**
 * Bracket control at the counter.
 *
 * Build once the seats are paid, then type a score into each match. A draw is refused
 * by the database rather than silently picking a side, so the form says the same thing:
 * two numbers have to differ. "Reset bracket" only appears while nothing has been played,
 * which is the only time rebuilding is allowed at all.
 */
export function TournamentBracketAdmin({
  tournamentId,
  matches,
  registrations,
}: {
  tournamentId: string;
  matches: AdminMatch[];
  registrations: AdminRegistration[];
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const entrants = registrations.filter((r) => r.status === "PAID" || r.status === "CHECKED_IN");
  const played = matches.some((m) => m.status === "FINISHED");

  async function call(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
      setNotice(ok);
      setScores({});
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    // Reset is the only action here that throws away recorded results, so it says what it
    // destroys before doing it rather than after.
    if (
      !confirm(
        "Reset bracket?\n\nSemua match dan hasil yang sudah tercatat akan dihapus. Kursi peserta yang sudah lunas tetap aman, tapi hasil match sebelumnya hilang permanen.",
      )
    ) {
      return;
    }
    void call({ action: "reset" }, "Bracket dikosongkan. Susun ulang kapan saja.");
  }

  function report(matchId: string) {
    const a = Number(scores[`${matchId}:a`]);
    const b = Number(scores[`${matchId}:b`]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      setError("Isi skor kedua pemain dulu.");
      return;
    }
    if (a === b) {
      setError("Seri tidak bisa jadi hasil. Main ulang, lalu isi angka pemenangnya.");
      return;
    }
    void call(
      { action: "result", match_id: matchId, score_a: a, score_b: b },
      `Hasil ${a}-${b} dicatat.`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => void call({ action: "build" }, "Bracket disusun.")}
          disabled={busy || entrants.length < 2}
        >
          {matches.length === 0 ? "Susun bracket" : "Susun ulang bracket"}
        </Button>
        {matches.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={reset}
            disabled={busy}
          >
            Reset bracket
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {entrants.length} peserta lunas · {roundsFor(entrants.length)} round
          {played && " · sudah ada hasil, menyusun ulang ditolak"}
        </span>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 p-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg bg-primary/10 p-2 text-sm text-primary">{notice}</p>
      )}

      {matches.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          Bracket belum disusun. Minimal 2 peserta lunas.
        </p>
      ) : (
        <div className="space-y-4">
          <TournamentBracket matches={matches} />
          <div className="space-y-2">
            {matches
              .filter(isScorable)
              .map((m) => (
                <div
                  key={m.match_id}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <span className="min-w-45 flex-1 text-sm">
                    {m.player_a_name} vs {m.player_b_name}
                  </span>
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    aria-label={`Skor ${m.player_a_name}`}
                    value={scores[`${m.match_id}:a`] ?? ""}
                    onChange={(e) =>
                      setScores((s) => ({ ...s, [`${m.match_id}:a`]: e.target.value }))
                    }
                  />
                  <span className="pb-2 text-muted-foreground">:</span>
                  <Input
                    className="w-20"
                    type="number"
                    min={0}
                    aria-label={`Skor ${m.player_b_name}`}
                    value={scores[`${m.match_id}:b`] ?? ""}
                    onChange={(e) =>
                      setScores((s) => ({ ...s, [`${m.match_id}:b`]: e.target.value }))
                    }
                  />
                  <Button size="sm" onClick={() => report(m.match_id)} disabled={busy}>
                    Simpan hasil
                  </Button>
                </div>
              ))}

            {matches.filter(isChampion).map((m) => (
              <p
                key={m.match_id}
                className="rounded-lg bg-primary/10 p-3 text-center font-display uppercase text-primary"
              >
                Juara: {m.player_a_name}
              </p>
            ))}

            {matches.every((m) => m.status !== "READY") && (
              <p className="text-xs text-muted-foreground">
                {matches.filter((m) => m.status === "WAITING").length} match masih menunggu
                giliran · {MATCH_STATUS_LABEL.FINISHED}/
                {MATCH_STATUS_LABEL.READY} dirangkum di atas.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}