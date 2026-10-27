"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CircleCheck,
  Flag,
  Loader2,
  LogIn,
  Sparkles,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BOOKING_ACTIONS, bookingChannel } from "@/lib/booking-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ACTION_ICON: Record<string, LucideIcon> = {
  confirm: CircleCheck,
  cancel: Ban,
  check_in: LogIn,
  no_show: UserX,
  complete: Flag,
  mark_ready: Sparkles,
};

/** Aksi destruktif wajib konfirmasi dua langkah. */
const NEEDS_CONFIRM = new Set(["cancel", "no_show"]);

/** Berapa lama tombol "Yakin?" menunggu sebelum kembali normal. */
const ARM_TIMEOUT_MS = 4_000;

/** Batas tunggu subscribe sebelum broadcast ditinggalkan. */
const SUBSCRIBE_TIMEOUT_MS = 3_000;

/**
 * Tells the customer's booking page that its status just changed.
 *
 * The channel is opened on demand, used once, and removed. The old version kept one
 * subscribed channel per row for the component's whole life: a 25-row page held 25
 * idle realtime connections to serve the one button somebody actually presses.
 *
 * The send must still wait for SUBSCRIBED — supabase-js silently drops a broadcast
 * from an unsubscribed channel, which looks exactly like success.
 *
 * Fire-and-forget on purpose: the staff page is refreshed by router.refresh()
 * regardless, and the customer's page falls back to its own polling, so a failure
 * here is not worth surfacing and must never hold the cashier's UI hostage.
 */
async function broadcastStatus(code: string, status: string): Promise<void> {
  const db = createClient();
  const channel = db.channel(bookingChannel(code));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("subscribe timeout")), SUBSCRIBE_TIMEOUT_MS);
      channel.subscribe((state) => {
        if (state === "SUBSCRIBED") {
          clearTimeout(timer);
          resolve();
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          clearTimeout(timer);
          reject(new Error(state));
        }
      });
    });
    await channel.send({ type: "broadcast", event: "status", payload: { status } });
  } catch {
    // Customer page polls; nothing for staff to do.
  } finally {
    void db.removeChannel(channel);
  }
}

export function ActionButtons({ code, status }: { code: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const awaitingRefresh = useRef(false);
  const buttons = BOOKING_ACTIONS[status] ?? [];

  // "Yakin?" kedaluwarsa sendiri supaya tidak tertinggal setengah jalan.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), ARM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [armed]);

  // Spinner bertahan sampai router.refresh() benar-benar selesai, bukan cuma sampai
  // POST-nya selesai — kalau tidak, tombol sempat aktif lagi dengan status lama.
  useEffect(() => {
    if (!pending && awaitingRefresh.current) {
      awaitingRefresh.current = false;
      setBusy(null);
    }
  }, [pending]);

  async function run(action: string) {
    setArmed(null);
    setError(null);
    setBusy(action);
    let ok = false;
    try {
      const res = await fetch(`/api/admin/bookings/${code}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error?.message ?? "Aksi gagal. Coba lagi.");
        return;
      }
      const body = await res.json().catch(() => null);
      ok = true;
      void broadcastStatus(code, body?.status ?? "UNKNOWN");
      awaitingRefresh.current = true;
      startTransition(() => router.refresh());
    } catch {
      // A thrown fetch (network/TLS) would otherwise leave every button
      // permanently disabled with no message at all.
      setError("Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.");
    } finally {
      if (!ok) setBusy(null);
    }
  }

  function onPress(action: string) {
    if (NEEDS_CONFIRM.has(action) && armed !== action) {
      setError(null);
      setArmed(action);
      return;
    }
    void run(action);
  }

  if (buttons.length === 0) return null;

  const locked = busy !== null || pending;
  // Aksi non-destruktif pertama = tindakan utama untuk status ini.
  const primaryAction = buttons.find((b) => !b.danger)?.action;

  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2" role="group" aria-label={`Aksi untuk ${code}`}>
        {buttons.map((b) => {
          const Icon = ACTION_ICON[b.action];
          const isBusy = busy === b.action;
          const isArmed = armed === b.action;
          const isPrimary = b.action === primaryAction;

          if (isArmed) {
            return (
              <span key={b.action} className="inline-flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={locked}
                  onClick={() => onPress(b.action)}
                  className="gap-1.5 font-bold animate-pulse"
                  aria-label={`Ya, ${b.label} ${code}`}
                >
                  <TriangleAlert aria-hidden className="size-3.5" />
                  Yakin {b.label.toLowerCase()}?
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={locked}
                  onClick={() => setArmed(null)}
                  aria-label="Batal"
                >
                  Tidak
                </Button>
              </span>
            );
          }

          return (
            <Button
              key={b.action}
              size="sm"
              variant={b.danger ? "destructive" : isPrimary ? "default" : "secondary"}
              disabled={locked}
              aria-busy={isBusy}
              aria-label={`${b.label} ${code}`}
              onClick={() => onPress(b.action)}
              className={cn(
                "gap-1.5 transition-transform active:scale-95",
                isPrimary && "font-bold",
                // Saat salah satu sedang jalan, yang lain redup supaya jelas mana yang diproses.
                locked && !isBusy && "opacity-50",
              )}
            >
              {isBusy ? (
                <Loader2 aria-hidden className="size-3.5 animate-spin" />
              ) : (
                Icon && <Icon aria-hidden className="size-3.5" />
              )}
              {isBusy ? "Memproses…" : b.label}
            </Button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className="flex max-w-64 items-start gap-1.5 rounded-md border border-coral/40 bg-coral/10 px-2 py-1 text-left text-xs text-coral"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}