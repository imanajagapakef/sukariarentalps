import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { cookies } from "next/headers";

/**
 * Capability gate for `/turnamen/tiket/[code]`.
 *
 * The registration code alone used to render the player's name and a share link
 * that embeds their phone number to anyone who guessed or overheard it. The gate
 * now asks for the last 4 digits of the phone used at registration, then mints
 * the same kind of httpOnly HMAC cookie as `booking-access.ts`. Codes are
 * printed in upper case, so both sides normalise before hashing.
 *
 * The signing key is derived from the service-role key — already server-only,
 * so there is no extra secret to rotate and nothing ships to the browser.
 */

export const TOURNAMENT_ACCESS_COOKIE = "sr_turnamen_access";
/** Long enough to reach the venue, short enough that a leaked cookie expires. */
export const TOURNAMENT_ACCESS_MAX_AGE = 60 * 60 * 6;

let cachedKey: Buffer | null = null;

function secretKey(): Buffer {
  if (!cachedKey) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY wajib diisi");
    }
    cachedKey = createHash("sha256").update(`tournament-access:${serviceKey}`).digest();
  }
  return cachedKey;
}

function normalize(code: string): string {
  return code.trim().toUpperCase();
}

/** Mints `${CODE}.${base64url-hmac(CODE)}` for one registration code. */
export function tournamentAccessToken(code: string): string {
  const c = normalize(code);
  const sig = createHmac("sha256", secretKey()).update(`${c}.`).digest("base64url");
  return `${c}.${sig}`;
}

/** Timing-safe token verification; the secret lives in the signature. */
export function verifyTournamentAccess(token: string, code: string): boolean {
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
export function setTournamentAccessCookie(res: NextResponse, code: string): void {
  res.cookies.set({
    name: TOURNAMENT_ACCESS_COOKIE,
    value: tournamentAccessToken(code),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOURNAMENT_ACCESS_MAX_AGE,
    path: "/",
  });
}

/** Server-side check against the request's cookies (page or route handler). */
export async function hasTournamentAccess(code: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(TOURNAMENT_ACCESS_COOKIE)?.value;
  if (!token) return false;
  return verifyTournamentAccess(token, code);
}