import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Capability gate for `/tiket/[code]`.
 *
 * A booking code alone used to expose the full ticket — phone number, totals,
 * countdowns — to anyone who guessed or overheard the code. The gate now is
 * "remember something the customer already knows": the last 4 digits of the
 * phone on the booking. A correct answer (POST /api/bookings/[code]?last4=…)
 * mints an httpOnly HMAC cookie; every ticket surface (page, cancel) verifies
 * it before touching the database.
 *
 * The key is derived from the service-role key, which is already the project's
 * server-only secret: no extra env var to rotate, and it is never shipped to
 * the client. Tokens are `${CODE}.${hmac(CODE)}` and verified with a
 * timing-safe compare.
 */

export const BOOKING_ACCESS_COOKIE = "sr_tiket_access";
/** Long enough to finish paying, short enough that a leaked cookie expires. */
export const BOOKING_ACCESS_MAX_AGE = 60 * 60 * 6;

let cachedKey: Buffer | null = null;

function secretKey(): Buffer {
  if (!cachedKey) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY wajib diisi");
    }
    cachedKey = createHash("sha256").update(`booking-access:${serviceKey}`).digest();
  }
  return cachedKey;
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

/** Mints `${CODE}.${base64url-hmac(CODE)}` for one booking code. */
export function bookingAccessToken(code: string): string {
  const c = normalize(code);
  const sig = createHmac("sha256", secretKey()).update(`${c}.`).digest("base64url");
  return `${c}.${sig}`;
}

/**
 * Timing-safe token verification. Whole-token equality on the(code) part is
 * fine — the caller picks the code anyway; the secret lives in the signature.
 */
export function verifyBookingAccess(token: string, code: string): boolean {
  const sep = (token ?? "").lastIndexOf(".");
  if (sep <= 0 || sep === (token ?? "").length - 1) return false;
  const c = normalize(code);
  const claim = token.slice(0, sep);
  const sig = token.slice(sep + 1);
  if (claim !== c) return false;
  const expected = createHmac("sha256", secretKey()).update(`${c}.`).digest("base64url");
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
}

/** Attaches the gate cookie to a response (httpOnly, 6 h, whole site). */
export function setBookingAccessCookie(res: NextResponse, code: string): void {
  res.cookies.set({
    name: BOOKING_ACCESS_COOKIE,
    value: bookingAccessToken(code),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: BOOKING_ACCESS_MAX_AGE,
    path: "/",
  });
}

/** Server-side check against the request's cookies (page or route handler). */
export async function hasBookingAccess(code: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(BOOKING_ACCESS_COOKIE)?.value;
  if (!token) return false;
  return verifyBookingAccess(token, code);
}
