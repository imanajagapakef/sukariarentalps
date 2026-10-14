import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { POST as uploadProof } from "@/app/api/payments/[code]/proof/route";
import { PROOF_BUCKET } from "@/lib/payment-proofs";

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
 * Payment proof upload.
 *
 * The assertion that matters most is the last one: the bucket must NOT be publicly
 * readable. A public URL on a bank screenshot exposes account numbers and balances to
 * anyone who guesses the key, and that is the whole reason this got its own bucket
 * instead of riding along in the public `media` one.
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
    const secondCode = second.rows[0].booking_code as string;
    await db.query(`select public.confirm_booking($1)`, [secondId]);
    settledCode = secondCode;
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

  it("keeps the uploaded image out of public reach", async () => {
    // The property that justified a separate private bucket. If this ever passes with
    // a 200, a bank screenshot is one guessable key away from being world-readable.
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