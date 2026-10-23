"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Badge } from "@/components/ui/badge";
import { TOURNAMENT_STATUS_LABEL, feeDisplay, type TournamentStatus } from "@/lib/tournament-rules";
import { downscaleImage } from "@/lib/image-downscale";
import { rp } from "@/lib/format";

export type TournamentRow = {
  tournament_id: string;
  title: string;
  game_id: string | null;
  branch_id: string;
  poster_url: string | null;
  description: string | null;
  rules: string | null;
  prize: string | null;
  starts_at: string;
  registration_closes_at: string | null;
  registration_fee: number;
  list_price: number | null;
  quota: number;
  payment_window_minutes: number;
  status: TournamentStatus;
};

const STATUSES: TournamentStatus[] = ["DRAFT", "OPEN", "FULL", "ONGOING", "DONE", "CANCELLED"];

/** datetime-local wants "YYYY-MM-DDTHH:mm"; the API stores an ISO instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Tournament editor.
 *
 * The two money fields are the confusing part, so the form explains them inline: the
 * fee is what gets charged, and the list price is only a number to cross out when the
 * fee is zero. Changing the fee to zero without a list price is allowed — the sticker
 * then just says Gratis on its own.
 */
export function TournamentEditor({
  tournament,
  branchOptions,
  gameOptions,
}: {
  /** Omit for a new tournament. */
  tournament?: TournamentRow;
  branchOptions: { id: string; label: string }[];
  gameOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const isNew = !tournament?.tournament_id;

  const [title, setTitle] = useState(tournament?.title ?? "");
  const [branchId, setBranchId] = useState(
    tournament?.branch_id ?? branchOptions[0]?.id ?? "",
  );
  const [gameId, setGameId] = useState(tournament?.game_id ?? "");
  const [startsAt, setStartsAt] = useState(toLocalInput(tournament?.starts_at ?? null));
  const [closesAt, setClosesAt] = useState(
    toLocalInput(tournament?.registration_closes_at ?? null),
  );
  const [fee, setFee] = useState(tournament?.registration_fee ?? 0);
  const [listPrice, setListPrice] = useState<string>(
    tournament?.list_price ? String(tournament.list_price) : "",
  );
  const [quota, setQuota] = useState(tournament?.quota ?? 16);
  const [window, setWindow] = useState(tournament?.payment_window_minutes ?? 30);
  const [prize, setPrize] = useState(tournament?.prize ?? "");
  const [description, setDescription] = useState(tournament?.description ?? "");
  const [rules, setRules] = useState(tournament?.rules ?? "");
  const [posterUrl, setPosterUrl] = useState(tournament?.poster_url ?? "");
  const [status, setStatus] = useState<TournamentStatus>(tournament?.status ?? "DRAFT");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preview = feeDisplay({ registration_fee: fee, list_price: Number(listPrice) || null });

  async function pickPoster(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      // Downscaled in the browser first, like the payment-proof upload: a phone photo is
      // several megabytes and the bucket rejects anything over 5 MB anyway.
      const body = new FormData();
      body.set("poster", await downscaleImage(file, 1600));
      if (tournament?.tournament_id) body.set("tournament_id", tournament.tournament_id);

      const res = await fetch("/api/admin/tournaments/poster", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);

      setPosterUrl(data.url as string);
      setNotice("Poster diunggah. Jangan lupa Simpan.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah poster");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const payload = {
      title: title.trim(),
      branch_id: branchId,
      game_id: gameId || null,
      starts_at: startsAt,
      registration_closes_at: closesAt || "",
      registration_fee: fee,
      list_price: listPrice ? Number(listPrice) : null,
      quota,
      payment_window_minutes: window,
      prize: prize.trim() || null,
      description: description.trim() || null,
      rules: rules.trim() || null,
      poster_url: posterUrl || null,
      status,
    };
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? payload : { ...payload, tournament_id: tournament?.tournament_id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
      setNotice(isNew ? "Turnamen dibuat." : "Turnamen disimpan.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!tournament?.tournament_id) return;
    if (!confirm(`Hapus turnamen "${title}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/tournaments?id=${encodeURIComponent(tournament.tournament_id)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? `Gagal (${res.status})`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display text-lg uppercase">
          {isNew ? "Turnamen Baru" : title || "(tanpa judul)"}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {!isNew && (
            <Badge variant="secondary" className="bg-primary/15 text-primary">
              {TOURNAMENT_STATUS_LABEL[status]}
            </Badge>
          )}
          <Button type="button" size="sm" onClick={save} disabled={busy || !title.trim()}>
            {busy ? "Menyimpan…" : "Simpan"}
          </Button>
          {!isNew && (
            <Button type="button" size="sm" variant="destructive" onClick={remove} disabled={busy}>
              Hapus
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tr-title">Judul *</Label>
          <Input id="tr-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-branch">Cabang *</Label>
          <SelectField id="tr-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branchOptions.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-game">Game</Label>
          <SelectField id="tr-game" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            <option value="">Tanpa game</option>
            {gameOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-start">Mulai *</Label>
          <Input
            id="tr-start"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-closes">Pendaftaran ditutup</Label>
          <Input
            id="tr-closes"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Kosongkan untuk menutup otomatis saat mulai.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-fee">HTM (yang ditagih)</Label>
          <Input
            id="tr-fee"
            type="number"
            min={0}
            value={fee}
            onChange={(e) => setFee(Number(e.target.value) || 0)}
          />
          <p className="text-xs text-muted-foreground">
            0 = gratis, tidak ada halaman pembayaran sama sekali.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-list">Harga coret (opsional)</Label>
          <Input
            id="tr-list"
            type="number"
            min={0}
            value={listPrice}
            onChange={(e) => setListPrice(e.target.value)}
            placeholder="100000"
          />
          <p className="text-xs text-muted-foreground">
            Dipakai kalau HTM 0: muncul dicoret dengan stiker GRATIS di atasnya.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-quota">Kuota peserta *</Label>
          <Input
            id="tr-quota"
            type="number"
            min={2}
            max={512}
            value={quota}
            onChange={(e) => setQuota(Number(e.target.value) || 2)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-window">Batas bayar (menit)</Label>
          <Input
            id="tr-window"
            type="number"
            min={5}
            max={1440}
            value={window}
            onChange={(e) => setWindow(Number(e.target.value) || 30)}
          />
          <p className="text-xs text-muted-foreground">
            Kalau lewat, kursi dilepas otomatis supaya orang lain bisa masuk.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-status">Status</Label>
          <SelectField
            id="tr-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TournamentStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {TOURNAMENT_STATUS_LABEL[s]}
              </option>
            ))}
          </SelectField>
          <p className="text-xs text-muted-foreground">
            Hanya OPEN/FULL/ONGOING/DONE yang tampil di situs.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tr-prize">Hadiah</Label>
          <Input
            id="tr-prize"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            placeholder="Juara 1: Rp 500.000"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tr-poster">Poster</Label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickPoster(e.target.files?.[0])}
            />
            <Button type="button" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? "Mengunggah…" : posterUrl ? "Ganti poster" : "Unggah poster"}
            </Button>
            {posterUrl && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterUrl}
                  alt="Poster"
                  className="h-16 w-28 rounded object-cover"
                />
                <Button type="button" size="sm" variant="ghost" onClick={() => setPosterUrl("")}>
                  Hapus poster
                </Button>
              </>
            )}
          </div>
          {posterUrl && (
            <div className="flex items-center gap-2 pt-1 text-sm">
              <span className="text-muted-foreground">Tampil sebagai:</span>
              {preview.kind === "free" ? (
                <span className="relative inline-flex flex-col items-start pr-1 pt-2">
                  {preview.strikePrice ? (
                    <span className="text-sm text-muted-foreground line-through">
                      {rp(preview.strikePrice)}
                    </span>
                  ) : null}
                  <span className="absolute -top-1 left-0 -rotate-6 rounded bg-primary px-1.5 py-0.5 font-display text-[10px] uppercase leading-none text-primary-foreground shadow-sm">
                    Gratis
                  </span>
                </span>
              ) : (
                <span className="font-display text-primary">{rp(preview.amount)}</span>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tr-desc">Deskripsi</Label>
          <textarea
            id="tr-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tr-rules">Aturan main</Label>
          <textarea
            id="tr-rules"
            rows={4}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm"
            placeholder={"• Best of 3\n• Bawa HB Controller\n• Dilarang cheat"}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-lg bg-primary/10 p-3 text-sm text-primary">{notice}</p>
      )}
    </div>
  );
}