import type { NextRequest } from "next/server";

/**
 * In-memory fixed-window rate limiter. Zero dependencies, shared per server
 * process — the honest trade-off for a single-region deployment: it holds on
 * one node, and egress behind a shared proxy collapses everyone into one
 * bucket (fail-closed for abuse, fail-closed for a school computer lab too,
 * which is acceptable while the frontend scales).
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
} satisfies Record<string, KindConfig>;

export type RateLimitKind = keyof typeof CONFIG;

type Entry = { count: number; expiresAt: number };

const hits = new Map<string, Entry>();
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_AFTER = 8_000; // roughly the ceiling of an idle app's key count

/** x-forwarded-for first (proxy), then x-real-ip, then an unnamed bucket. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
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
