"use client";

import { useMemo, useState } from "react";
import { Lightbulb, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GameRequestRow } from "@/lib/catalog";

/**
 * Anonymous per-browser id, so (request_id, voter_ref) — already unique in the
 * schema — can stop one visitor double-voting. Deliberately not a phone number
 * or account: voting on a wishlist should not require giving up an identifier.
 */
function voterRef(): string {
  if (typeof window === "undefined") return "";
  const KEY = "sukaria.voter_ref";
  const existing = window.localStorage.getItem(KEY);
  if (existing) return existing;
  const ref =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(KEY, ref);
  return ref;
}

export function GameRequestPanel({ initial }: { initial: GameRequestRow[] }) {
  const db = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<GameRequestRow[]>(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const gameName = name.trim();
    if (gameName.length < 2) {
      setNotice("Tulis judul game minimal 2 huruf.");
      return;
    }
    setBusy(true);
    setNotice(null);
    // RLS already grants anon INSERT on game_requests, so no API route needed.
    const { data, error } = await db
      .from("game_requests")
      .insert({ game_name: gameName, status: "REQUESTED" })
      .select("request_id, game_name, status, vote_count, created_at")
      .single();
    setBusy(false);
    if (error) {
      setNotice(`Gagal mengirim: ${error.message}`);
      return;
    }
    setRequests((r) => [...r, data as GameRequestRow].sort((a, b) => b.vote_count - a.vote_count));
    setName("");
    setNotice(`Oke, "${gameName}" masuk daftar request.`);
  }

  async function vote(requestId: string) {
    const ref = voterRef();
    if (!ref || voted[requestId]) return;
    setBusy(true);
    setNotice(null);
    const { error } = await db.from("game_votes").insert({ request_id: requestId, voter_ref: ref });
    setBusy(false);
    if (error) {
      // 23505 = unique violation: this browser already voted for it.
      setNotice(error.code === "23505" ? "Kamu sudah vote untuk game ini." : `Gagal vote: ${error.message}`);
      return;
    }
    // The sync_game_request_votes trigger keeps vote_count correct; reflect it
    // locally rather than refetching the page.
    setVoted((v) => ({ ...v, [requestId]: true }));
    setRequests((r) =>
      r.map((x) => (x.request_id === requestId ? { ...x, vote_count: x.vote_count + 1 } : x)),
    );
  }

  // Bar vote relatif ke request teratas: dengan satu request saja, bar pertama
  // tampil penuh — yang memang benar ("paling dicari").
  const maxVotes = requests.reduce((m, r) => Math.max(m, r.vote_count), 0);

  return (
    <section className="mt-12 grid gap-6 lg:grid-cols-2">
      <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-arcade-sm sm:p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-primary via-primary/40 to-transparent"
        />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-primary/15 blur-3xl" />
        <p className="font-display flex items-center gap-2 text-sm uppercase tracking-[0.06em] text-primary">
          <Lightbulb aria-hidden className="size-4" />
          Game yang bisa di-install?
        </p>
        <h2 className="font-display mt-2 text-2xl uppercase">Request Game</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Judul yang kamu mau belum ada? Request ke tim teknisi Sukaria — yang paling banyak vote kami prox beli dulu.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="space-y-2">
            <label htmlFor="req-name" className="text-sm font-medium">
              Masukkan judul game
            </label>
            <Input
              id="req-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="mis. EA Sports FC 26"
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Mengirim…" : "Kirim Request"}
          </Button>
        </form>

        {notice && <p className="mt-3 text-sm text-primary">{notice}</p>}
      </div>

      <div className="relative isolate overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-arcade-sm sm:p-6">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-linear-to-r from-amber via-amber/40 to-transparent"
        />
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 size-56 rounded-full bg-amber/15 blur-3xl" />
        <p className="font-display text-sm uppercase tracking-[0.06em] text-amber">Top request gamepop</p>
        <h2 className="font-display mt-2 text-2xl uppercase">Paling Dicari</h2>

        {requests.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Belum ada request. Jadilah yang pertama minta game!
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {requests.map((r, i) => {
              const pct = maxVotes > 0 ? Math.round((r.vote_count / maxVotes) * 100) : 0;
              const top = i < 3;
              return (
                <li
                  key={r.request_id}
                  className={cn(
                    "relative isolate overflow-hidden rounded-xl border p-3 transition-colors",
                    top ? "border-primary/30 bg-primary/5" : "border-border",
                  )}
                >
                  {/* Bar proporsi vote, di belakang konten. */}
                  <div
                    aria-hidden
                    className={cn("absolute inset-y-0 left-0 -z-10", top ? "bg-primary/15" : "bg-muted-foreground/10")}
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center gap-3">
                    <span
                      className={cn(
                        "font-display grid size-7 shrink-0 place-items-center rounded-lg text-sm tabular-nums",
                        top ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.game_name}</span>
                      {r.status === "UNDER_REVIEW" && (
                        <span className="text-[11px] uppercase text-primary">Sedang ditinjau</span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums">
                      {r.vote_count}
                    </span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant={voted[r.request_id] ? "secondary" : "outline"}
                      disabled={busy || voted[r.request_id]}
                      onClick={() => vote(r.request_id)}
                      aria-label={`Vote ${r.game_name}`}
                    >
                      <ThumbsUp aria-hidden className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
