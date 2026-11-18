import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiter. In-memory fixed-window tetap dipertahankan untuk kind
 * non-sensitif (vitest + fallback), tetapi rute sensitif
 * (bookingRead / bookingCancel / verifikasi tiket) memakai
 * `rateLimitDb()` yang counter-nya di Postgres (migrasi 0040) sehingga
 * konsisten lintas instance serverless di Vercel.
 *
 * IMPORTANT: the key is the client IP taken from `x-forwarded-for` /
 * `x-real-ip`. That is only trustworthy when the app sits behind a proxy that
 * OVERWRITES those headers (Vercel/Cloudflare/nginx all do). If the Node server
 * is exposed directly, a caller can rotate the header and bypass every limit.
 */

type KindConfig = { limit: number; windowSeconds: number };

const CONFIG = {
  bookingRead: { limit: 10, windowSeconds: 300 },
  bookingCreate: { limit: 8, windowSeconds: 600 },
  bookingCancel: { limit: 5, windowSeconds: 600 },
  paymentCreate: { limit: 10, windowSeconds: 300 },
  proofUpload: { limit: 6, windowSeconds: 600 },
  feedback: { limit: 5, windowSeconds: 600 },
  vitals: { limit: 40, windowSeconds: 300 },
  tournamentRegister: { limit: 8, windowSeconds: 600 },
  tournamentPay: { limit: 10, windowSeconds: 300 },
  tournamentRead: { limit: 10, windowSeconds: 300 },
} satisfies Record<string, KindConfig>;

export type RateLimitKind = keyof typeof CONFIG;

type Entry = { count: number; expiresAt: number };

const hits = new Map<string, Entry>();
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_AFTER = 8_000; // roughly the ceiling of an idle app's key count

/**
 * Which header carries the client IP.
 *
 * Default `x-forwarded-for` (Vercel, Cloudflare, nginx all set it and overwrite
 * whatever the client sent). Override with `RATE_LIMIT_IP_HEADER` when a proxy
 * uses a different header. Set `RATE_LIMIT_IP_HEADER=none` when there is NO
 * trusted proxy: every caller then shares one bucket, which is fail-closed
 * (heavy abuse throttles everyone) instead of spoofable.
 *
 * The value is trimmed and clamped to 64 chars so a hostile header cannot grow
 * the bucket map without bound.
 */
export function clientIp(req: NextRequest): string {
  const configured = process.env.RATE_LIMIT_IP_HEADER?.trim().toLowerCase();
  if (configured === "none") return "shared";

  const header = configured || "x-forwarded-for";
  const raw = req.headers.get(header);
  if (raw) {
    // Proxies append; the leftmost entry is the original client.
    const first = raw.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }

  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 64);
  return "unknown";
}

export function rateLimit(
  kind: RateLimitKind,
  req: NextRequest,
  extra?: string,
): { allowed: boolean; retryAfterSeconds: number } {
  const cfg = CONFIG[kind];
  const now = Date.now();

  // Cheap garbage collection: only when the map is bloated and at most once a
  // minute. Entries store their own expiry so the sweep needs no kind lookup.
  if (hits.size > SWEEP_AFTER && now - lastSweep >= SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [key, entry] of hits) {
      if (entry.expiresAt <= now) hits.delete(key);
    }
  }

  const key = `${kind}|${clientIp(req)}${extra ? `|${extra.toLowerCase()}` : ""}`;
  const entry = hits.get(key);
  if (!entry || entry.expiresAt <= now) {
    hits.set(key, { count: 1, expiresAt: now + cfg.windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > cfg.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Tot: rate limit persisten di Postgres (migrasi 0040). Dipakai rute sensitif
 * agar tidak bypass via ganti IP/instance — Map in-memory tiap serverless
 * instance punya counter sendiri.
 * Fail-open hanya bila DB down (dengan log), supaya tidak memblokir semua.
 */
export async function rateLimitDb(
  kind: RateLimitKind,
  req: NextRequest,
  extra?: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const cfg = CONFIG[kind];
  const key = `${kind}|${clientIp(req)}${extra ? `|${extra.toLowerCase()}` : ""}`;
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("rate_limit_hit", {
      p_key: key,
      p_limit: cfg.limit,
      p_window_seconds: cfg.windowSeconds,
    });
    if (error || !data?.[0]) throw error ?? new Error("rate_limit_hit empty");
    return { allowed: data[0].allowed, retryAfterSeconds: data[0].retry_after_seconds };
  } catch (e) {
    console.error("[rateLimitDb] fallback in-memory:", e instanceof Error ? e.message : e);
    return rateLimit(kind, req, extra);
  }
}

/** Lockout brute-force last-4 per kode: 5 salah → kunci 15 menit (migrasi 0040). */
export async function bookingAccessIsLocked(
  bookingCode: string,
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("booking_access_is_locked", {
      p_booking_code: bookingCode.trim().toUpperCase(),
    });
    if (error || !data?.[0]) throw error ?? new Error("booking_access_is_locked empty");
    return { locked: data[0].locked, retryAfterSeconds: data[0].retry_after_seconds };
  } catch (e) {
    console.error("[bookingAccessIsLocked] fail-open:", e instanceof Error ? e.message : e);
    return { locked: false, retryAfterSeconds: 0 };
  }
}

export async function bookingAccessLockout(
  bookingCode: string,
  success: boolean,
): Promise<{ locked: boolean; retryAfterSeconds: number }> {
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("booking_access_record", {
      p_booking_code: bookingCode.trim().toUpperCase(),
      p_success: success,
    });
    if (error || !data?.[0]) throw error ?? new Error("booking_access_record empty");
    return { locked: data[0].locked, retryAfterSeconds: data[0].retry_after_seconds };
  } catch (e) {
    console.error("[bookingAccessLockout] fail-open:", e instanceof Error ? e.message : e);
    return { locked: false, retryAfterSeconds: 0 };
  }
}

/** Clears every window; vitest isolation only. */
export function _resetForTests(): void {
  hits.clear();
  lastSweep = 0;
}
