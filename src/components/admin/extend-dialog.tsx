"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { CalendarClock, CircleAlert, Loader2, Plus, Undo2, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtTime, rp } from "@/lib/format";
import { cn } from "@/lib/utils";

type ExtendOption = { minutes: number; amount: number; new_end_at: string };
type ExtensionRow = {
  extension_id: string;
  status: string;
  requested_minutes: number;
  previous_end_at: string;
  new_end_at: string;
  amount: number;
  payment_status: string | null;
  payment_method: string | null;
  proof_count: number;
};

type Info = {
  status: string;
  scheduled_end_at: string;
  duration_minutes: number;
  boundary: string | null;
  minimum_minutes: number;
  options: ExtendOption[];
  extensions: ExtensionRow[];
};

/**
 * Dialog "Perpanjang" untuk kasir.
 *
 * Semua angka (jam yang muat, batas reservasi berikutnya, estimasi harga)
 * datang dari server; dialog ini tidak menghitung sendiri supaya tidak
 * menawarkan kombinasi yang akan ditolak RPC.
 */
export function ExtendDialog({
  code,
  open,
  onOpenChange,
  onDone,
}: {
  code: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah data berubah, supaya tabel di belakang ikut refresh. */
  onDone: () => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | "cancel" | "paid" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setInfo(null);

    void (async () => {
      try {
        const res = await fetch(`/api/admin/bookings/${code}/extension`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) throw new Error(body?.error?.message ?? `Gagal memuat (${res.status})`);
        setInfo(body as Info);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Gagal memuat data perpanjangan");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [code, open]);

  async function reload() {
    const res = await fetch(`/api/admin/bookings/${code}/extension`, { cache: "no-store" });
    const body = await res.json().catch(() => null);
    if (res.ok) setInfo(body as Info);
  }

  async function extend(minutes: number) {
    setBusy(minutes);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${code}/extension`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Perpanjangan gagal. Coba lagi.");
        return;
      }
      setNotice(`Sesi diperpanjang sampai ${fmtDateTime(body.new_end_at)}.`);
      onDone();
      await reload();
    } catch {
      setError("Tidak bisa terhubung ke server.");
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(extensionId: string) {
    setBusy("paid");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${code}/extension/paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension_id: extensionId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Gagal menandai lunas.");
        return;
      }
      setNotice("Pembayaran perpanjangan ditandai lunas.");
      onDone();
      await reload();
    } catch {
      setError("Tidak bisa terhubung ke server.");
    } finally {
      setBusy(null);
    }
  }

  async function undo(extensionId: string) {
    setBusy("cancel");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/bookings/${code}/extension`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extension_id: extensionId, reason: "dibatalkan kasir" }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? "Gagal membatalkan perpanjangan.");
        return;
      }
      setNotice("Perpanjangan dibatalkan; jam sesi kembali seperti semula.");
      onDone();
      await reload();
    } catch {
      setError("Tidak bisa terhubung ke server.");
    } finally {
      setBusy(null);
    }
  }

  const active = info?.extensions.find((e) => e.status === "CONFIRMED") ?? null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          aria-describedby="extend-desc"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <Dialog.Title className="font-display text-lg uppercase">Perpanjang sesi</Dialog.Title>
              <Dialog.Description id="extend-desc" className="mt-0.5 text-sm text-muted-foreground">
                <span className="font-mono text-xs">{code}</span>
                {info && ` · selesai ${fmtTime(info.scheduled_end_at)}`}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Tutup"
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X aria-hidden className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-4 px-5 py-4">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 aria-hidden className="size-4 animate-spin" /> Memeriksa ketersediaan unit...
              </p>
            )}

            {info && (
              <p className="flex items-start gap-2 rounded-lg bg-surface-low px-3 py-2 text-sm">
                <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {info.boundary
                    ? `Unit sudah dipesan lagi ${fmtDateTime(info.boundary)}.`
                    : "Tidak ada booking lain setelah sesi ini — unit kosong."}
                  {" "}Tambahan minimum {info.minimum_minutes} menit.
                </span>
              </p>
            )}

            {info && info.options.length > 0 && (
              <ul className="grid gap-2 sm:grid-cols-3">
                {info.options.map((o) => (
                  <li key={o.minutes}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void extend(o.minutes)}
                      className={cn(
                        "group w-full rounded-xl border border-border bg-surface-low px-3 py-3 text-center transition-colors",
                        "hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                      )}
                    >
                      <span className="flex items-center justify-center gap-1 font-display text-2xl leading-none text-primary">
                        {busy === o.minutes ? (
                          <Loader2 aria-hidden className="size-5 animate-spin" />
                        ) : (
                          <Plus aria-hidden className="size-4" />
                        )}
                        {o.minutes / 60}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        jam
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        s/d {fmtTime(o.new_end_at)}
                      </span>
                      {o.amount > 0 && (
                        <span className="mt-0.5 block text-xs font-semibold tabular-nums text-foreground">
                          {rp(o.amount)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {info && info.options.length === 0 && (
              <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                Tidak ada jeda yang cukup untuk tambahan jam. Buat booking baru setelah jam
                berikutnya, atau pindah unit.
              </p>
            )}

            {active && (
              <div className="space-y-2 rounded-lg border border-border px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Perpanjangan aktif: +{active.requested_minutes / 60} jam (s/d{" "}
                    {fmtTime(active.new_end_at)}) · {rp(active.amount)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
                      active.payment_status === "PAID"
                        ? "bg-primary/15 text-primary"
                        : "bg-warning/15 text-warning",
                    )}
                  >
                    {active.payment_status === "PAID" ? "Lunas" : "Menunggu bayar"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {active.payment_status !== "PAID" && (
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void markPaid(active.extension_id)}
                      className="gap-1.5"
                    >
                      {busy === "paid" ? (
                        <Loader2 aria-hidden className="size-3.5 animate-spin" />
                      ) : (
                        <Wallet aria-hidden className="size-3.5" />
                      )}
                      Tandai lunas
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy !== null}
                    onClick={() => void undo(active.extension_id)}
                    className="gap-1.5"
                  >
                    {busy === "cancel" ? (
                      <Loader2 aria-hidden className="size-3.5 animate-spin" />
                    ) : (
                      <Undo2 aria-hidden className="size-3.5" />
                    )}
                    Batalkan
                  </Button>
                  {active.proof_count > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {active.proof_count} bukti terunggah — cek di kolom bukti booking
                    </span>
                  )}
                </div>
              </div>
            )}

            {notice && (
              <p role="status" className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
                {notice}
              </p>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Uang tambahan dicatat sebagai pembayaran PENDING dan otomatis lunas saat kasir
              menekan Selesai (check-out). Slot langsung terkunci begitu perpanjangan disimpan.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}