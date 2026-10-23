import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as uploadProof } from "@/app/api/payments/[code]/proof/route";
import { PROOF_BUCKET, detectImageKind, listPaymentProofs } from "@/lib/payment-proofs";
import { _resetForTests as resetRateLimits } from "@/lib/rate-limit";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/** A 1x1 PNG, real enough for storage to accept and for the bucket to hand back. */
const PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

function proofRequest(code: string, body: { nominal?: string; note?: string; file?: File }) {
  const form = new FormData();
  if (body.nominal !== undefined) form.set("nominal", body.nominal);
  if (body.note !== undefined) form.set("note", body.note);
  form.set("proof", body.file ?? new File([PNG_BYTES], "bukti.png", { type: "image/png" }));
  return new NextRequest(new Request(`http://localhost/api/payments/${code}/proof`, { method: "POST", body: form }));
}

/**
 * Pure content sniffing — no database, no network, no secrets. `checkProofFile`
 * rejects a claimed-but-forged `file.type` based on these bytes, so the matrix
 * below is the whole of what "is this actually a picture" means here.
 */
describe("detectImageKind (magic bytes)", () => {
  it("recognises every accepted image kind from its real header", () => {
    // JPEG: SOI + APP0 marker ("JFIF\0" follows at 6-10).
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    expect(detectImageKind(jpeg)).toBe("image/jpeg");

    // The 1x1 PNG used for the storage tests above.
    expect(detectImageKind(PNG_BYTES)).toBe("image/png");

    // WebP: "RIFF" + byte size + "WEBP".
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageKind(webp)).toBe("image/webp");

    // AVIF: ftyp box with major brand "avif", and the HEIF aerial variant "avis".
    const avif = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(detectImageKind(avif)).toBe("image/avif");
    const avis = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x73, 0x00, 0x00, 0x00, 0x00,
    ]);
    expect(detectImageKind(avis)).toBe("image/avif");
  });

  it("rejects formats we do not accept", () => {
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
    expect(detectImageKind(gif)).toBeNull();

    // Text renamed to .png — the exact rename-a-script payload the check exists for.
    const text = Uint8Array.from("console.log('hi')", (c) => c.charCodeAt(0));
    expect(detectImageKind(text)).toBeNull();

    expect(detectImageKind(new Uint8Array())).toBeNull();
  });

  it("is strict about IMG containers and truncated headers", () => {
    // RIFF box that is a WAV file, not a WebP.
    const wave = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(detectImageKind(wave)).toBeNull();

    // ftyp box with a non-image major brand.
    const mif1 = Uint8Array.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x69, 0x66, 0x31,
    ]);
    expect(detectImageKind(mif1)).toBeNull();

    // Truncated headers cannot claim an image.
    expect(detectImageKind(Uint8Array.from([0xff, 0xd8]))).toBeNull();
    expect(detectImageKind(Uint8Array.from([0x89, 0x50, 0x4e]))).toBeNull();
    expect(
      detectImageKind(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00])),
    ).toBeNull();
    expect(
      detectImageKind(Uint8Array.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])),
    ).toBeNull();
  });
});

/**
 * Payment proof upload.
 *
 * The assertion that matters most is "keeps the uploaded image out of public reach":
 * the bucket must NOT be publicly readable. A public URL on a bank screenshot exposes
 * account numbers and balances to anyone who guesses the key, and that is the whole
 * reason this got its own bucket instead of riding along in the public `media` one.
 */
describeDb("payment proofs", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unitId = `P-PRF-${suffix}`;
  const facilityId = `P-PRF-F${suffix}`;
  const branchId = "BR-GANET";
  const phone = `0876${suffix}`;

  let db: Client;
  let admin: ReturnType<typeof createAdminClient>;
  let bookingCode = "";
  let bookingId = "";
  /** A CONFIRMED booking, to prove a settled booking cannot accept a proof. */
  let settledCode = "";

  const day = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const at = (time: string) => `${day} ${time}+07`;

  beforeAll(async () => {
    admin = createAdminClient();
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();
    // The route's limiter is in-memory and every request this process makes rides on
    // one shared IP bucket. Clear it so each test starts quiet — the assertions below
    // are about the per-booking cap, never a leftover window from an earlier test.
    resetRateLimits();
    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Proof Test Facility', 'PS5', 'RENTAL')`,
      [facilityId, `PFX-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name) values ($1, $2, $3, 'Proof Test Unit')`,
      [unitId, branchId, facilityId],
    );
    await db.query(
      `insert into pricing_rules (pricing_id, branch_id, facility_type_id, pricing_type, duration_minutes, price)
       values ($1, $2, $3, 'PACKAGE', 120, 35000)`,
      [`PP-PRF-${suffix}`, branchId, facilityId],
    );

    const first = await db.query(
      `select booking_id, booking_code from public.create_booking($1, $2, $3, $4, $5::timestamptz, 120)`,
      [branchId, unitId, "Proof Payer", phone, at("09:00")],
    );
    bookingId = first.rows[0].booking_id;
    bookingCode = first.rows[0].booking_code;

    const second = await db.query(
      `select booking_id, booking_code from public.create_booking($1, $2, $3, $4, $5::timestamptz, 120)`,
      [branchId, unitId, "Proof Payer 2", `${phone}9`, at("14:00")],
    );
    const secondId = second.rows[0].booking_id as string;
    settledCode = second.rows[0].booking_code as string;
    await db.query(`select public.confirm_booking($1)`, [secondId]);
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `delete from payments where booking_id in (select booking_id from bookings where unit_id = $1)`,
      [unitId],
    );
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone like $1`, [`${phone}%`]);
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [branchId, facilityId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
  });

  async function cleanProofs() {
    resetRateLimits(); // keep the shared in-memory limiter from bleeding between tests
    const { data } = await admin
      .from("payment_proofs")
      .select("object_path")
      .in("booking_id", [bookingId]);
    if (data?.length) {
      await admin.storage
        .from(PROOF_BUCKET)
        .remove(data.map((d) => d.object_path))
        .catch(() => undefined);
    }
    await admin.from("payment_proofs").delete().eq("booking_id", bookingId);
  }

  it("rejects an unknown booking", async () => {
    const res = await uploadProof(proofRequest("SR-NOPE00", { nominal: "35000" }), {
      params: Promise.resolve({ code: "SR-NOPE00" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a nominal that is not a plausible transfer", async () => {
    const res = await uploadProof(proofRequest(bookingCode, { nominal: "10" }), {
      params: Promise.resolve({ code: bookingCode }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a file that is not an allowed image type", async () => {
    const res = await uploadProof(
      proofRequest(bookingCode, {
        nominal: "35000",
        file: new File(["not an image"], "bukti.pdf", { type: "application/pdf" }),
      }),
      { params: Promise.resolve({ code: bookingCode }) },
    );
    expect(res.status).toBe(400);
  });

  it("stores a proof with its nominal and note", async () => {
    await cleanProofs();
    const res = await uploadProof(
      proofRequest(bookingCode, { nominal: "35000", note: "transfer dari DANA" }),
      { params: Promise.resolve({ code: bookingCode }) },
    );
    expect(res.status).toBe(201);

    const { data } = await admin
      .from("payment_proofs")
      .select("nominal, note, object_path")
      .eq("booking_id", bookingId);
    expect(data).toHaveLength(1);
    expect(data?.[0].nominal).toBe(35000);
    expect(data?.[0].note).toBe("transfer dari DANA");
    expect(data?.[0].object_path).toMatch(/^proof\//);
  });

  it("refuses a proof on a booking that is no longer waiting", async () => {
    const res = await uploadProof(proofRequest(settledCode, { nominal: "35000" }), {
      params: Promise.resolve({ code: settledCode }),
    });
    expect(res.status).toBe(409);
  });

  it("caps how many proofs one booking can send", async () => {
    await cleanProofs();
    for (let i = 0; i < 3; i++) {
      const ok = await uploadProof(proofRequest(bookingCode, { nominal: "35000" }), {
        params: Promise.resolve({ code: bookingCode }),
      });
      expect(ok.status).toBe(201);
    }
    const fourth = await uploadProof(proofRequest(bookingCode, { nominal: "35000" }), {
      params: Promise.resolve({ code: bookingCode }),
    });
    expect(fourth.status).toBe(400);
  });

  it("reads a proof back with a signed URL", async () => {
    // The read path is what the admin table uses, and it must not depend on booking
    // status: the old screen only asked for WAITING_PAYMENT rows, so the evidence
    // vanished the instant the cashier pressed Konfirmasi - which is exactly when a
    // dispute needs it most.
    await cleanProofs();
    await uploadProof(proofRequest(bookingCode, { nominal: "35000" }), {
      params: Promise.resolve({ code: bookingCode }),
    });

    const byBooking = await listPaymentProofs(admin, [bookingId]);
    expect(byBooking.get(bookingId)).toHaveLength(1);
    expect(byBooking.get(bookingId)?.[0].signedUrl).toBeTruthy();

    // The status is never part of the lookup: asking for the same booking after it is
    // settled returns the same proof rather than nothing.
    const { data: confirmed } = await admin
      .from("bookings")
      .select("booking_id, status")
      .eq("booking_id", bookingId)
      .maybeSingle();
    expect(confirmed?.status).toBe("WAITING_PAYMENT");

    const stillThere = await listPaymentProofs(admin, [bookingId]);
    expect(stillThere.get(bookingId)).toHaveLength(1);

    await cleanProofs();
  });

  it("keeps the uploaded image out of public reach", async () => {
    // The property that justified a separate private bucket. If this ever passes with
    // a 200, a bank screenshot is one guessable key away from being world-readable.
    await cleanProofs();
    await uploadProof(proofRequest(bookingCode, { nominal: "35000" }), {
      params: Promise.resolve({ code: bookingCode }),
    });

    const { data: row } = await admin
      .from("payment_proofs")
      .select("object_path")
      .eq("booking_id", bookingId)
      .limit(1)
      .maybeSingle();
    expect(row?.object_path).toBeTruthy();

    const { data: pub } = admin.storage.from(PROOF_BUCKET).getPublicUrl(row!.object_path);
    const res = await fetch(pub.publicUrl);
    expect(res.ok).toBe(false);

    // Staff path still works: a signed URL is how the admin page reads it.
    const { data: signed, error } = await admin.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(row!.object_path, 60);
    expect(error).toBeNull();
    expect(signed?.signedUrl).toBeTruthy();
    expect((await fetch(signed!.signedUrl)).ok).toBe(true);

    await cleanProofs();
  });

  it("deletes proofs along with the booking", async () => {
    // A throwaway booking so the cascade can be proven without having to resurrect the
    // shared one - bookings.customer_id is NOT NULL and the RPC that creates the
    // matching customer is not something to re-run by hand.
    const tmp = await db.query(
      `select booking_id, booking_code from public.create_booking($1, $2, $3, $4, $5::timestamptz, 120)`,
      [branchId, unitId, "Cascade Payer", `${phone}C`, at("18:00")],
    );
    const tmpId = tmp.rows[0].booking_id as string;
    const tmpCode = tmp.rows[0].booking_code as string;

    const res = await uploadProof(proofRequest(tmpCode, { nominal: "35000" }), {
      params: Promise.resolve({ code: tmpCode }),
    });
    expect(res.status).toBe(201);

    const { count: before } = await admin
      .from("payment_proofs")
      .select("proof_id", { count: "exact", head: true })
      .eq("booking_id", tmpId);
    expect(before).toBe(1);

    await db.query(`delete from bookings where booking_id = $1`, [tmpId]);

    const { count: after } = await admin
      .from("payment_proofs")
      .select("proof_id", { count: "exact", head: true })
      .eq("booking_id", tmpId);
    expect(after).toBe(0);
  });
});