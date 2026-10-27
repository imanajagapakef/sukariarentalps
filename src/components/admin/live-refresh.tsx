"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pause, Play, RefreshCw, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "admin-live-refresh:paused";
const MIN_INTERVAL_MS = 5_000;
/** Refresh yang ditunda karena user mengetik tetap dipaksa setelah sekian kali interval. */
const MAX_DEFER_FACTOR = 5;

const timeFmt = new Intl.DateTimeFormat("id-ID", { timeStyle: "medium", timeZone: "Asia/Jakarta" });

/** Field teks yang sedang fokus dan berisi sesuatu: kasir sedang mengetik / mengisi. */
function userIsTyping(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement) return el.value.length > 0;
  if (el instanceof HTMLInputElement) {
    const textual = ["text", "search", "tel", "email", "url", "number", "password"].includes(el.type);
    return textual && el.value.length > 0;
  }
  return false;
}

type Variant = "floating" | "inline" | "silent";

/**
 * Re-fetches the current admin route on an interval, and says so.
 *
 * The topbar says "Live · data real-time". 60s keeps the numbers fresh without
 * re-running every admin server component (including the heavy /admin/reports
 * fan-out) six times per minute per open tab.
 *
 * ponytail: router.refresh() re-runs the server components, which is the whole
 * mechanism — no websocket, no client cache, no polling endpoint.
 *
 * What the old version got wrong, and this one does not:
 *  - one setInterval + a visibility check meant returning to a tab after ten minutes
 *    showed ten-minute-old numbers for up to another 60s. It now refreshes on the way
 *    back if the data is older than one interval;
 *  - it never noticed the network. Offline ticks are skipped (no point asking a dead
 *    connection) and the moment it comes back, it refreshes;
 *  - refreshes could stack when the server was slow. One in flight at a time;
 *  - it refreshed under a cashier who was typing. It now waits (but never forever);
 *  - nobody could pause it or force it.
 *
 * Variants: "floating" (pojok kanan bawah, default), "inline" (taruh di topbar),
 * "silent" (perilaku lama: tanpa UI).
 */
export function LiveRefresh({
  intervalMs = 60_000,
  variant = "floating",
}: {
  intervalMs?: number;
  variant?: Variant;
}) {
  const router = useRouter();
  const interval = Math.max(MIN_INTERVAL_MS, intervalMs);

  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [online, setOnline] = useState(true);
  const [deferred, setDeferred] = useState(false);
  const [now, setNow] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(0);

  // Refs: the ticker and the event listeners must read the latest values without
  // re-subscribing every time one of them changes.
  const lastRef = useRef(0);
  const pausedRef = useRef(false);
  const pendingRef = useRef(false);
  pendingRef.current = isPending;
  pausedRef.current = paused;

  const attempt = useCallback(
    (reason: "tick" | "visible" | "online" | "manual") => {
      const manual = reason === "manual";
      if (!manual) {
        if (pausedRef.current) return;
        if (document.visibilityState !== "visible") return;
        if (!navigator.onLine) {
          setOnline(false);
          return;
        }
      }
      if (pendingRef.current) return; // one in flight at a time

      if (!manual && userIsTyping() && Date.now() - lastRef.current < interval * MAX_DEFER_FACTOR) {
        setDeferred(true);
        return;
      }

      setDeferred(false);
      lastRef.current = Date.now();
      startTransition(() => router.refresh());
    },
    [router, interval],
  );

  // Mount: read the persisted pause flag and start the clock from "fresh" — the page
  // that just rendered is, by definition, current.
  useEffect(() => {
    try {
      setPaused(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // storage can be blocked; default to running
    }
    const t = Date.now();
    lastRef.current = t;
    setNow(t);
    setUpdatedAt(t);
    setOnline(navigator.onLine);
    setMounted(true);
  }, []);

  // A refresh finished: stamp the time shown in the pill.
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending) setUpdatedAt(Date.now());
    wasPending.current = isPending;
  }, [isPending]);

  // One 1-second ticker drives both the countdown and the refresh itself. Elapsed time
  // is measured against the wall clock, so a throttled or slept timer cannot drift.
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - lastRef.current >= interval) attempt("tick");
    }, 1_000);
    return () => clearInterval(id);
  }, [attempt, interval]);

  // Coming back to the tab / window / network: refresh if the data has gone stale.
  useEffect(() => {
    const stale = () => Date.now() - lastRef.current >= interval;
    const onVisible = () => {
      if (document.visibilityState === "visible" && stale()) attempt("visible");
    };
    const onFocus = () => {
      if (stale()) attempt("visible");
    };
    const onOnline = () => {
      setOnline(true);
      attempt("online");
    };
    const onOffline = () => setOnline(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [attempt, interval]);

  function togglePause() {
    const next = !paused;
    setPaused(next);
    pausedRef.current = next;
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore
    }
    // Resuming means the user wants current numbers, not another wait.
    if (!next) attempt("manual");
  }

  if (variant === "silent" || !mounted) return null;

  const elapsed = Math.max(0, now - lastRef.current);
  const remaining = Math.max(0, Math.ceil((interval - elapsed) / 1_000));
  const pct = Math.min(100, (elapsed / interval) * 100);

  const state = !online ? "offline" : paused ? "paused" : deferred ? "deferred" : isPending ? "loading" : "live";
  const label = {
    live: "Live",
    loading: "Memperbarui…",
    paused: "Dijeda",
    offline: "Offline",
    deferred: "Menunggu selesai mengetik",
  }[state];

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-full border bg-card/90 shadow-lg backdrop-blur",
        variant === "floating" && "fixed bottom-4 right-4 z-40",
        variant === "inline" && "inline-flex shadow-none",
        state === "offline" ? "border-coral/50" : state === "paused" || state === "deferred" ? "border-amber/50" : "border-primary/30",
      )}
      title={`Data terakhir diperbarui ${timeFmt.format(updatedAt)} WIB`}
    >
      <div className="flex items-center gap-2 py-1.5 pl-3 pr-1.5 text-xs">
        {/* indikator: warna + ikon/teks, tidak pernah warna saja */}
        {state === "offline" ? (
          <WifiOff aria-hidden className="size-3.5 text-coral" />
        ) : state === "paused" ? (
          <Pause aria-hidden className="size-3.5 text-amber" />
        ) : (
          <span className="relative flex size-2">
            {state !== "deferred" && (
              <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", state === "deferred" ? "bg-amber" : "bg-primary")} />
          </span>
        )}

        <span role="status" className="font-bold uppercase tracking-wide">
          {label}
        </span>

        {state === "live" && (
          <span aria-hidden className="hidden tabular-nums text-muted-foreground sm:inline">
            {remaining}d
          </span>
        )}
        <span className="hidden tabular-nums text-muted-foreground md:inline">· {timeFmt.format(updatedAt)}</span>

        <button
          type="button"
          onClick={() => attempt("manual")}
          disabled={isPending}
          aria-label="Perbarui sekarang"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw aria-hidden className={cn("size-3.5", isPending && "animate-spin")} />
        </button>
        <button
          type="button"
          onClick={togglePause}
          aria-label={paused ? "Lanjutkan pembaruan otomatis" : "Jeda pembaruan otomatis"}
          aria-pressed={paused}
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
        </button>
      </div>

      {/* progres menuju refresh berikutnya */}
      {state === "live" && (
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-muted">
          <div className="h-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}