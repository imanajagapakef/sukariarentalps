import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentForBooking, handleMidtransNotification } from "@/services/payment.service";

const TEST_SERVER_KEY = "test-server-key";
process.env.MIDTRANS_SERVER_KEY = TEST_SERVER_KEY;

const sig = (orderId: string, statusCode: string, gross: string) =>
  createHash("sha512").update(`${orderId}${statusCode}${gross}${TEST_SERVER_KEY}`).digest("hex");

// supabase-js reads globalThis.fetch at call time, so a blanket stub would
// hijack DB queries too — intercept only the Snap endpoint.
const realFetch = globalThis.fetch;
function stubSnap(token: string) {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/snap/v1/transactions")) {
      return Promise.resolve(
        new Response(JSON.stringify({ token, redirect_url: `https://app.sandbox.midtrans.com/snap/v2/vtx.html?token=${token}` }), { status: 200 }),
      );
    }
    return realFetch(input as RequestInfo, init);
  });
}

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Payment service integration tests. handleMidtransNotification is driven with
 * real supabase-js against the real database — the behaviour under test is the
 * idempotency index and the booking RPC transition, neither of which a mock
 * would catch. Snap itself is stubbed at fetch level.
 */
describeDb("payment service", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unitId = `P-UNIT-${suffix}`;
  const facilityId = `P-FAC-${suffix}`;
  const branchId = "BR-GANET";
  const phone = `0877${suffix}`;

  let db: Client;
  let admin: ReturnType<typeof createAdminClient>;

  const day = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const at = (time: string) => `${day} ${time}+07`;

  beforeAll(async () => {
    admin = createAdminClient();
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();
    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Payment Test Facility', 'PS5', 'RENTAL')`,
      [facilityId, `PF-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name) values ($1, $2, $3, 'Payment Test Unit')`,
      [unitId, branchId, facilityId],
    );
    await db.query(
      `insert into pricing_rules (pricing_id, branch_id, facility_type_id, pricing_type, duration_minutes, price)
       values ($1, $2, $3, 'HOURLY', 60, 20000), ($4, $2, $3, 'PACKAGE', 120, 35000)`,
      [`PP-1-${suffix}`, branchId, facilityId, `PP-2-${suffix}`],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `delete from payments where booking_id in (select booking_id from bookings where unit_id = $1)`,
      [unitId],
    );
    await db.query(`delete from payment_events where provider_event_id like $1`, [`%${suffix}%`]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [branchId, facilityId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
  });

  // each test owns a clean unit, and the admin client must be created BEFORE
  // stubbing fetch — supabase-js captures the global at construction time
  beforeEach(async () => {
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `delete from payments where booking_id in (select booking_id from bookings where unit_id = $1)`,
      [unitId],
    );
    await db.query(`delete from payment_events where provider_event_id like $1`, [`%${suffix}%`]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`, [unitId]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function newBooking(start: string, duration = 120) {
    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, $6)`,
      [branchId, unitId, "Payer", phone, at(start), duration],
    );
    return rows[0] as { booking_id: string; booking_code: string; total_amount: number };
  }

  async function paymentFor(bookingId: string) {
    const { rows } = await db.query(
      `select payment_id, provider_order_id, status, method, paid_at from payments where booking_id = $1 order by created_at`,
      [bookingId],
    );
    return rows[0];
  }

  it("createPaymentForBooking stores the payment and returns the Snap token", async () => {
    const booking = await newBooking("09:00");
    stubSnap("tok-1");

    const result = await createPaymentForBooking(admin, booking.booking_code);
    expect(result.token).toBe("tok-1");

    const payment = await paymentFor(booking.booking_id);
    expect(payment.status).toBe("PENDING");
    expect(payment.provider_order_id).toBe(payment.payment_id);

    // a second request for the same booking must not double-charge
    await expect(createPaymentForBooking(admin, booking.booking_code)).rejects.toThrow(/sudah dibuat/);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  it("ignores a notification with an invalid signature", async () => {
    const booking = await newBooking("11:00");

    const result = await handleMidtransNotification(admin, {
      transaction_id: `TX-BAD-${suffix}`,
      order_id: booking.booking_code,
      status_code: "200",
      gross_amount: "35000",
      transaction_status: "settlement",
      signature_key: "definitely-wrong",
    });

    expect(result).toEqual({ processed: false, reason: "signature invalid" });
    const { rows: ev } = await db.query(
      `select signature_valid from payment_events where provider_event_id = $1`,
      [`TX-BAD-${suffix}`],
    );
    expect(ev[0].signature_valid).toBe(false);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  it("settles: payment PAID, booking CONFIRMED, duplicate ignored", async () => {
    const booking = await newBooking("13:00");
    stubSnap("tok-2");
    const { payment_id } = await createPaymentForBooking(admin, booking.booking_code);

    const notification = {
      transaction_id: `TX-OK-${suffix}`,
      order_id: payment_id,
      status_code: "200",
      gross_amount: "35000",
      payment_type: "qris",
      transaction_status: "settlement",
      signature_key: sig(payment_id, "200", "35000"),
    };

    const first = await handleMidtransNotification(admin, notification);
    expect(first.processed).toBe(true);

    const payment = await paymentFor(booking.booking_id);
    expect(payment.status).toBe("PAID");
    expect(payment.method).toBe("MIDTRANS_QRIS");
    expect(payment.paid_at).not.toBeNull();

    const { rows: bk } = await db.query(`select status from bookings where booking_id = $1`, [booking.booking_id]);
    expect(bk[0].status).toBe("CONFIRMED");

    // Midtrans retries — second delivery must change nothing
    const second = await handleMidtransNotification(admin, notification);
    expect(second).toEqual({ processed: false, reason: "already processed" });
    const { rows: count } = await db.query(
      `select count(*)::int as n from payment_events where provider_event_id = $1`,
      [`TX-OK-${suffix}`],
    );
    expect(count[0].n).toBe(1);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  it("expiry marks the payment EXPIRED but leaves the booking to the cron", async () => {
    const booking = await newBooking("15:00");
    stubSnap("tok-3");
    const { payment_id } = await createPaymentForBooking(admin, booking.booking_code);

    const result = await handleMidtransNotification(admin, {
      transaction_id: `TX-EXP-${suffix}`,
      order_id: payment_id,
      status_code: "404",
      gross_amount: "35000",
      transaction_status: "expire",
      signature_key: sig(payment_id, "404", "35000"),
    });
    expect(result.processed).toBe(true);

    expect((await paymentFor(booking.booking_id)).status).toBe("EXPIRED");
    const { rows: bk } = await db.query(`select status from bookings where booking_id = $1`, [booking.booking_id]);
    expect(bk[0].status).toBe("WAITING_PAYMENT");

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });
});
