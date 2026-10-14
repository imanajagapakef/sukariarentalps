import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentForBooking, handleCasakuNotification } from "@/services/payment.service";

const TEST_WEBHOOK_SECRET = "test-webhook-secret";
process.env.CASAKU_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
process.env.CASAKU_LICENSE_KEY = "test-license-key";
process.env.CASAKU_QR_ID = "test-qr-id";
process.env.CASAKU_PACKAGE_IDS = "id.dana,com.shopee.id";
process.env.QRIS_STATIC_STRING = "00020101021126650013ID.CO.BTN.WWW011893600200117210000202154051101721000020303UMI51440014ID.CO.QRIS.WWW0215ID10265958817190303UMI5204721053033605802ID5911Dedi Kaisar6014TANJUNG PINANG61052912562070703A016304CA3B";

const sig = (rawBody: string) => createHmac("sha256", TEST_WEBHOOK_SECRET).update(rawBody).digest("hex");

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

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

  it("createPaymentForBooking stores the payment and returns the Casaku transaction id", async () => {
    const booking = await newBooking("09:00");
    const result = await createPaymentForBooking(admin, booking.booking_code);
    expect(result.redirect_url).toBe(`/payment/${booking.booking_code}/qris`);

    const payment = await paymentFor(booking.booking_id);
    expect(payment.status).toBe("PENDING");
    expect(payment.method).toBe("QRIS_MANUAL");
    expect(payment.provider_order_id).toBe(payment.payment_id);

    const again = await createPaymentForBooking(admin, booking.booking_code);
    expect(again.payment_id).toBe(payment.payment_id);
    const { rows: payCount } = await db.query(
      `select count(*)::int as n from payments where booking_id = $1`,
      [booking.booking_id],
    );
    expect(payCount[0].n).toBe(1);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  it("ignores a notification with an invalid signature", async () => {
    const booking = await newBooking("11:00");
    const payload = { transactionId: `TX-BAD-${suffix}`, amount: 35000, packageName: "id.dana", status: "paid" };
    const rawBody = JSON.stringify(payload);

    const result = await handleCasakuNotification(admin, payload, rawBody, "deadbeef");
    expect(result).toEqual({ processed: false, reason: "signature invalid" });
    const { rows: ev } = await db.query(
      `select signature_valid from payment_events where provider_event_id = $1`,
      [payload.transactionId],
    );
    expect(ev[0].signature_valid).toBe(false);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  it("settles: payment PAID, booking CONFIRMED, duplicate ignored", async () => {
    const booking = await newBooking("13:00");
    await createPaymentForBooking(admin, booking.booking_code);

    const paymentRecord = await paymentFor(booking.booking_id);
    const transactionId = paymentRecord.payment_id;
    const payload = { transactionId, amount: 35000, packageName: "id.dana", status: "paid", paidAt: new Date().toISOString() };
    const rawBody = JSON.stringify(payload);
    const signature = sig(rawBody);

    const first = await handleCasakuNotification(admin, payload, rawBody, signature);
    expect(first.processed).toBe(true);

    const payment = await paymentFor(booking.booking_id);
    expect(payment.status).toBe("PAID");
    // Not QRIS_MANUAL any more: the webhook knows which app actually paid
    // (packageName "id.dana") and records that, which is what the revenue report
    // groups by. Before this test was written the webhook left method untouched.
    expect(payment.method).toBe("CASAKU_QRIS");
    expect(payment.paid_at).not.toBeNull();

    const { rows: bk } = await db.query(`select status from bookings where booking_id = $1`, [booking.booking_id]);
    expect(bk[0].status).toBe("CONFIRMED");

    const second = await handleCasakuNotification(admin, payload, rawBody, signature);
    expect(second).toEqual({ processed: false, reason: "already processed" });
    const { rows: count } = await db.query(
      `select count(*)::int as n from payment_events where provider_event_id = $1`,
      [transactionId],
    );
    expect(count[0].n).toBe(1);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  it("expiry marks the payment EXPIRED but leaves the booking to the cron", async () => {
    const booking = await newBooking("15:00");
    await createPaymentForBooking(admin, booking.booking_code);

    const paymentRecord = await paymentFor(booking.booking_id);
    const transactionId = paymentRecord.payment_id;
    const payload = { transactionId, amount: 35000, packageName: "id.dana", status: "expired" };
    const rawBody = JSON.stringify(payload);
    const result = await handleCasakuNotification(admin, payload, rawBody, sig(rawBody));
    expect(result.processed).toBe(true);

    expect((await paymentFor(booking.booking_id)).status).toBe("EXPIRED");
    const { rows: bk } = await db.query(`select status from bookings where booking_id = $1`, [booking.booking_id]);
    expect(bk[0].status).toBe("WAITING_PAYMENT");

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });
});
