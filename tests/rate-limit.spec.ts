import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { clientIp, rateLimit, _resetForTests } from "@/lib/rate-limit";
import { jsonRateLimited } from "@/lib/api/response";

/**
 * Pure limiter tests — the in-memory fixed window keyed on request headers, and
 * the 429 helper every rate-limited route now returns. No database. Each window
 * is minutes long, so expiry paths are exercised in production, not here.
 */

type HeadersIn = Record<string, string>;

function req(headers: HeadersIn = {}): NextRequest {
  return new NextRequest(new Request("http://localhost/api/bookings/cancel", { method: "POST", headers }));
}

beforeEach(() => {
  _resetForTests();
});

describe("rateLimit fixed window", () => {
  it("allows up to the limit (bookingCancel: 5) and rejects the next hit", () => {
    for (let i = 1; i <= 5; i++) {
      const hit = rateLimit("bookingCancel", req({ "x-forwarded-for": "203.0.113.7" }));
      // Every allowed hit must have a non-positive retryAfter, just as every
      // rejected one below must have a positive one — the pairing is the whole
      // contract of the return shape.
      expect(hit.allowed).toBe(true);
      expect(hit.retryAfterSeconds).toBe(0);
    }

    const blocked = rateLimit("bookingCancel", req({ "x-forwarded-for": "203.0.113.7" }));
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(600);

    // The window is fixed: still blocked well before any reset would be due.
    expect(rateLimit("bookingCancel", req({ "x-forwarded-for": "203.0.113.7" })).allowed).toBe(false);
  });

  it("counts buckets per kind, per client, and per extra key independently", () => {
    // Exhaust bookingCancel for this IP.
    for (let i = 0; i <= 5; i++) {
      rateLimit("bookingCancel", req({ "x-forwarded-for": "203.0.113.7" }));
    }

    // Same IP, other kinds unaffected — a burst of cancels must not lock out
    // payment flows for everyone behind the same NAT.
    const other = rateLimit("paymentCreate", req({ "x-forwarded-for": "203.0.113.7" }));
    expect(other.allowed).toBe(true);
    expect(other.retryAfterSeconds).toBe(0);

    // A different IP never collides with the exhausted bucket.
    expect(rateLimit("bookingCancel", req({ "x-forwarded-for": "198.51.100.9" })).allowed).toBe(true);
  });

  it("keys per-extra buckets together regardless of case", () => {
    for (let i = 0; i <= 5; i++) {
      rateLimit("proofUpload", req(), "SR-001");
    }

    // proofUpload has the 6/600 budget; the exhausted code is blocked under
    // either casing because extras fold to lowercase.
    expect(rateLimit("proofUpload", req(), "SR-001").allowed).toBe(false);
    expect(rateLimit("proofUpload", req(), "sr-001").allowed).toBe(false);
    // Other codes keep their own bucket.
    expect(rateLimit("proofUpload", req(), "SR-002").allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for entry, trimmed", () => {
    expect(clientIp(req({ "x-forwarded-for": " 203.0.113.7, 10.0.0.1 " }))).toBe("203.0.113.7");
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to an unnamed bucket", () => {
    expect(clientIp(req({ "x-real-ip": " 198.51.100.9 " }))).toBe("198.51.100.9");
    // No proxy headers at all — local/off-proxy traffic shares one bucket,
    // which is the fail-closed side the limiter accepts by design.
    expect(clientIp(req())).toBe("unknown");
  });
});

describe("jsonRateLimited", () => {
  it("answers 429 with a numeric Retry-After header", () => {
    const res = jsonRateLimited(42);
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBe(42);

    // Sub-second values clamp to 1 so the header is always at least a second.
    const clamped = jsonRateLimited(0);
    expect(Number(clamped.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
  });

  it("speaks the shared error envelope with the RATE_LIMITED code", async () => {
    const body = (await jsonRateLimited(30).json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
