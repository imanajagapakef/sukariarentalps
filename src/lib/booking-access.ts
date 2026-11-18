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
 * mints an httpOnly HMAC cookie; every ticket surface (page, cancel, and kini
 * juga pembayaran + upload bukti) verifies it before touching the database.
 *
 * The key is derived from the service-role key, which is already the project's
 * server-only secret: no extra env var to rotate, and it is never shipped to
 * the client.
 *
 * Token baru: `CODE.EXP.SIG`, di mana SIG = HMAC(secret, "CODE.EXP").
 * EXP adalah unix seconds — kedaluwarsa ditegakkan di server, bukan cuma
 * `maxAge` browser. Satu cookie menampung daftar hingga 10 kode (masing-masing
 * dengan EXP sendiri) dalam payload JSON bertanda tangan, sehingga membuka
 * tiket kedua tidak menimpa yang pertama.
 *
 * Kompatibilitas: token lama `CODE.SIG` (tanpa EXP) masih diterima untuk
 * transisi 6 jam, tetapi token baru selalu memakai EXP.
 */

export const BOOKING_ACCESS_COOKIE = "sr_tiket_access";
/** Long enough to finish paying, short enough that a leaked cookie expires. */
export const BOOKING_ACCESS_MAX_AGE = 60 * 60 * 6;
const MAX_CODES_PER_COOKIE = 10;

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

function sign(message: string): string {
  return createHmac("sha256", secretKey()).update(message).digest("base64url");
}

function verifySignature(message: string, sig: string): boolean {
  const expected = sign(message);
  if (sig.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
}

function defaultExp(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000) + BOOKING_ACCESS_MAX_AGE;
}

/** Mints `CODE.EXP.SIG` for one booking code. */
export function bookingAccessToken(code: string, nowMs = Date.now()): string {
  const c = normalize(code);
  const exp = defaultExp(nowMs);
  const message = `${c}.${exp}`;
  return `${message}.${sign(message)}`;
}

/**
 * Timing-safe token verification for a single code.
 * Accepts both the new `CODE.EXP.SIG` format and the legacy `CODE.SIG`
 * format (without EXP) during the transition window.
 */
export function verifyBookingAccess(token: string, code: string): boolean {
  const raw = (token ?? "").trim();
  if (!raw) return false;
  const c = normalize(code);
  const parts = raw.split(".");
  if (parts.length === 3) {
    const [claim, expStr, sig] = parts;
    if (claim !== c) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp)) return false;
    if (Math.floor(Date.now() / 1000) > exp) return false;
    return verifySignature(`${claim}.${expStr}`, sig ?? "");
  }
  // Legacy `CODE.SIG` — tanpa EXP, dipakai selama transisi.
  const sep = raw.lastIndexOf(".");
  if (sep <= 0 || sep === raw.length - 1) return false;
  const claim = raw.slice(0, sep);
  const sig = raw.slice(sep + 1);
  if (claim !== c) return false;
  return verifySignature(`${c}.`, sig);
}

// ---------------------------------------------------------------------------
// Multi-code cookie: base64url(JSON {codes:[{c,e}]}) . SIG
// ---------------------------------------------------------------------------

type CookieEntry = { c: string; e: number };

function encodeCookiePayload(entries: CookieEntry[]): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, codes: entries }), "utf8").toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decodeCookiePayload(raw: string): CookieEntry[] {
  const sep = raw.lastIndexOf(".");
  if (sep <= 0) return [];
  const payload = raw.slice(0, sep);
  const sig = raw.slice(sep + 1);
  if (!verifySignature(payload, sig)) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      codes?: { c: string; e: number }[];
    };
    if (!Array.isArray(parsed.codes)) return [];
    const now = Math.floor(Date.now() / 1000);
    return parsed.codes.filter(
      (x) => typeof x?.c === "string" && typeof x?.e === "number" && x.e > now,
    );
  } catch {
    return [];
  }
}

/** Tambah kode ke daftar cookie yang sudah ada (mempertahankan kode lain). */
export function addCodeToAccessCookie(existingRaw: string | undefined, code: string, nowMs = Date.now()): string {
  const c = normalize(code);
  let entries: CookieEntry[] = [];
  if (existingRaw) {
    entries = decodeCookiePayload(existingRaw);
    // Cookie lama (single CODE.SIG) di-upgrade ke format daftar.
    if (entries.length === 0) {
      const legacy = existingRaw.trim();
      const dot = legacy.lastIndexOf(".");
      if (dot > 0) {
        const claim = legacy.slice(0, dot);
        if (/^[A-Z0-9-]+$/.test(claim)) entries = [{ c: claim, e: defaultExp(nowMs) }];
      }
    }
  }
  entries = entries.filter((e) => e.c !== c);
  entries.push({ c, e: Math.floor(nowMs / 1000) + BOOKING_ACCESS_MAX_AGE });
  if (entries.length > MAX_CODES_PER_COOKIE) entries = entries.slice(-MAX_CODES_PER_COOKIE);
  return encodeCookiePayload(entries);
}

/** Attaches the gate cookie to a response (httpOnly, 6 h, whole site). */
export function setBookingAccessCookie(
  res: NextResponse,
  code: string,
  existingRaw?: string,
): void {
  res.cookies.set({
    name: BOOKING_ACCESS_COOKIE,
    value: addCodeToAccessCookie(existingRaw, code),
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
  const c = normalize(code);
  // Format daftar (baru).
  const entries = decodeCookiePayload(token);
  if (entries.some((e) => e.c === c)) return true;
  // Fallback: token tunggal (baru CODE.EXP.SIG atau lama CODE.SIG).
  if (entries.length === 0) return verifyBookingAccess(token, c);
  return false;
}
