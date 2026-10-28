import type { NextRequest } from "next/server";

/**
 * In-memory fixed-window rate limiter. Zero dependencies, shared per server
 * process — the honest trade-off for a single-region deployment: it holds on
 * one node, and egress behind a shared proxy collapses everyone into one
 * bucket (fail-closed for abuse, fail-closed for a school computer lab too,
 * which is acceptable while the frontend scales).
 *
 * IMPORTANT: the key is the client IP taken from `x-forwarded-for` /
 * `x-real-ip`. That is only trustworthy when the app sits behind a proxy that
 * OVERWRITES those headers (Vercel/Cloudflare/nginx all do). If the Node server
 * is exposed directly, a caller can rotate the header and bypass every limit.
 * A shared store (Upstash/Redis) is the next step when the app scales past one
 * instance; until then, keep the origin private and behind a proxy.
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

/** Clears every window; vitest isolation only. */
export function _resetForTests(): void {
  hits.clear();
  lastSweep = 0;
}
