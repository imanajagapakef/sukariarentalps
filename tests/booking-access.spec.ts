import { afterEach, describe, expect, it } from "vitest";
import {
  BOOKING_ACCESS_COOKIE,
  bookingAccessToken,
  hasBookingAccess,
  verifyBookingAccess,
} from "@/lib/booking-access";

/**
 * Pure capability-gate tests — HMAC maths and the `next/headers` cookie jar
 * from tests/setup.ts. No database, no network. The whole suite skips when the
 * service key is absent because `secretKey()` refuses to mint anything without
 * it, and that refusal is the one behaviour that cannot be exercised here.
 */
const hasSecret = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const describeSecret = hasSecret ? describe : describe.skip;

const jar = (globalThis as Record<string, unknown>).__adminCookieJar as Map<string, string>;
if (!jar) throw new Error("__adminCookieJar belum diinisialisasi tests/setup.ts");

const CODE = "SR-001";

describeSecret("booking access gate", () => {
  afterEach(() => {
    jar.delete(BOOKING_ACCESS_COOKIE);
  });

  describe("bookingAccessToken", () => {
    it("mints a deterministic, normalized token", () => {
      const first = bookingAccessToken(CODE);
      const second = bookingAccessToken(CODE);
      expect(first).toBe(second);

      // Whitespace and case are normalized to the stored uppercase form.
      expect(bookingAccessToken(`  sr-001  `)).toBe(first);

      expect(first.startsWith(`${CODE}.`)).toBe(true);
      const sig = first.slice(CODE.length + 1);
      expect(sig).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet, no padding
    });

    it("issues different tokens for different codes", () => {
      // Different claim → different HMAC, so a token is also a shorthand proof
      // of exactly one booking.
      expect(bookingAccessToken("SR-001")).not.toBe(bookingAccessToken("SR-002"));
    });
  });

  describe("verifyBookingAccess", () => {
    it("accepts the token it would mint itself, in any case", () => {
      const token = bookingAccessToken("sr-001");
      expect(verifyBookingAccess(token, CODE)).toBe(true);
      // Case-insensitive code, same normalization on both sides.
      expect(verifyBookingAccess(bookingAccessToken(CODE), "sr-001")).toBe(true);
    });

    it("rejects a foreign code", () => {
      expect(verifyBookingAccess(bookingAccessToken(CODE), "SR-999")).toBe(false);
    });

    it("rejects a tampered signature of the same length", () => {
      const token = bookingAccessToken(CODE);
      const sig = token.slice(CODE.length + 1);
      // Flip the first signature character, preserving length — the timing-safe
      // compare has to be what catches this, not a shortcut.
      const flipped = sig[0] === "A" ? "B" : "A";
      const tampered = `${CODE}.${flipped}${sig.slice(1)}`;
      expect(tampered).toHaveLength(token.length);
      expect(tampered).not.toBe(token);
      expect(verifyBookingAccess(tampered, CODE)).toBe(false);
    });

    it("rejects truncated and malformed tokens", () => {
      const token = bookingAccessToken(CODE);

      // Truncated signature — length check short-circuits the compare.
      expect(verifyBookingAccess(token.slice(0, -1), CODE)).toBe(false);

      // Structural rejects, each exercised against a real-looking claim:
      // no separator at all, leading separator, trailing separator, empty.
      expect(verifyBookingAccess(`${CODE}${bookingAccessToken(CODE).slice(CODE.length + 1)}`, CODE)).toBe(false);
      expect(verifyBookingAccess(`.${bookingAccessToken(CODE).slice(CODE.length + 1)}`, CODE)).toBe(false);
      expect(verifyBookingAccess(`${CODE}.`, CODE)).toBe(false);
      expect(verifyBookingAccess("", CODE)).toBe(false);
    });
  });

  describe("hasBookingAccess", () => {
    it("grants access only when the gate cookie matches the code", async () => {
      jar.set(BOOKING_ACCESS_COOKIE, bookingAccessToken("sr-001"));

      expect(await hasBookingAccess(CODE)).toBe(true);
      // Same normalization despite the caller's casing and stray spaces.
      expect(await hasBookingAccess(` ${CODE.toLowerCase().trim()} `)).toBe(true);

      // The cookie is a capability for one booking, not a session for all: a
      // different code asked with this same cookie must fail.
      expect(await hasBookingAccess("SR-002")).toBe(false);
    });

    it("rejects a missing or bogus cookie", async () => {
      jar.delete(BOOKING_ACCESS_COOKIE);
      expect(await hasBookingAccess(CODE)).toBe(false);

      jar.set(BOOKING_ACCESS_COOKIE, "SR-001.not-a-hmac");
      expect(await hasBookingAccess(CODE)).toBe(false);
    });
  });
});
