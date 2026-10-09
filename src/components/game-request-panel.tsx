"use client";

import { useMemo, useState } from "react";
import { Lightbulb, ThumbsUp } from "lucide-react";
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

  return (
    <section className="mt-12 grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="flex items-center gap-2 font-display text-sm uppercase tracking-[0.06em] text-primary">
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

      <div className="rounded-xl border border-border bg-card p-5">
        <p className="font-display text-sm uppercase tracking-[0.06em] text-primary">TOP REQUEST GAMEPOP</p>
        <h2 className="font-display mt-2 text-2xl uppercase">Paling Dicari</h2>

        {requests.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Belum ada request. Jadilah yang pertama minta game!
          </p>
        ) : (
          <ol className="mt-4 space-y-2">
            {requests.map((r, i) => (
              <li
                key={r.request_id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="font-display w-6 shrink-0 text-center text-xl text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{r.game_name}</span>
                  {r.status === "UNDER_REVIEW" && (
                    <span className="text-xs uppercase text-primary">Sedang ditinjau</span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{r.vote_count} vote</span>
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
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
