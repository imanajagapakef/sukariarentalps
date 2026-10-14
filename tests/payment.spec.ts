import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentForBooking } from "@/services/payment.service";
import { POST as bookingActions } from "@/app/api/admin/bookings/[code]/actions/route";
import { callRoute, canAuthenticate, signInAsOwner, signOut } from "./admin-harness";

process.env.QRIS_STATIC_STRING = "00020101021126650013ID.CO.BTN.WWW011893600200117210000202154051101721000020303UMI51440014ID.CO.QRIS.WWW0215ID10265958817190303UMI5204721053033605802ID5911Dedi Kaisar6014TANJUNG PINANG61052912562070703A016304CA3B";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Payment lifecycle with no gateway.
 *
 * Casaku is gone, so there is no webhook and nothing auto-confirms. The only path
 * that settles a payment is a cashier pressing "Konfirmasi" in /admin/bookings,
 * and that is what the settlement test drives - through the real route handler,
 * signed in as the bootstrapped owner, so the staff guard, the zod parse, the
 * guarded confirm_booking RPC and the audit write are all exercised.
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
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [branchId, facilityId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
    signOut();
  });

  beforeEach(async () => {
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `delete from payments where booking_id in (select booking_id from bookings where unit_id = $1)`,
      [unitId],
    );
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`, [unitId]);
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

  async function bookingStatus(bookingId: string) {
    const { rows } = await db.query(`select status from bookings where booking_id = $1`, [bookingId]);
    return rows[0].status as string;
  }

  it("createPaymentForBooking stores the payment and returns the QRIS page", async () => {
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

  it("rejects an unknown payment method before writing anything", async () => {
    const booking = await newBooking("10:00");

    await expect(
      createPaymentForBooking(admin, booking.booking_code, "NOT_A_CHANNEL"),
    ).rejects.toThrow(/tidak dikenal/);

    const { rows: payCount } = await db.query(
      `select count(*)::int as n from payments where booking_id = $1`,
      [booking.booking_id],
    );
    expect(payCount[0].n).toBe(0);

    await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
  });

  const describeSettlement = canAuthenticate ? describe : describe.skip;

  describeSettlement("staff confirmation settles the payment", () => {
    beforeAll(async () => {
      await signInAsOwner();
    });

    it("confirm marks the payment PAID and the booking CONFIRMED", async () => {
      const booking = await newBooking("13:00");
      await createPaymentForBooking(admin, booking.booking_code);
      expect((await paymentFor(booking.booking_id)).status).toBe("PENDING");

      const result = await callRoute(
        bookingActions,
        { params: Promise.resolve({ code: booking.booking_code }) },
        { body: { action: "confirm" } },
      );
      expect(result.status).toBe(200);
      expect((result.body as { status: string }).status).toBe("CONFIRMED");

      const payment = await paymentFor(booking.booking_id);
      expect(payment.status).toBe("PAID");
      expect(payment.paid_at).not.toBeNull();
      expect(await bookingStatus(booking.booking_id)).toBe("CONFIRMED");

      await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
    });

    it("confirming twice is rejected by the guarded RPC, not applied twice", async () => {
      const booking = await newBooking("14:00");
      await createPaymentForBooking(admin, booking.booking_code);

      const first = await callRoute(
        bookingActions,
        { params: Promise.resolve({ code: booking.booking_code }) },
        { body: { action: "confirm" } },
      );
      expect(first.status).toBe(200);

      // The route swallows "already confirmed" only for the payment write; the second
      // call must not report success for a transition the RPC refuses.
      const second = await callRoute(
        bookingActions,
        { params: Promise.resolve({ code: booking.booking_code }) },
        { body: { action: "confirm" } },
      );
      expect(second.status).not.toBe(200);

      const { rows: n } = await db.query(
        `select count(*)::int as n from payments where booking_id = $1 and status = 'PAID'`,
        [booking.booking_id],
      );
      expect(n[0].n).toBe(1);

      await db.query(`select public.cancel_booking($1)`, [booking.booking_id]);
    });
  });

  it("expiry expires the payment too, and leaves the booking to the cron", async () => {
    const booking = await newBooking("15:00");
    await createPaymentForBooking(admin, booking.booking_code);

    // Pull the deadline into the past rather than sleeping: the cron only fires on a
    // schedule, so this is the only way to exercise its body.
    await db.query(`update bookings set payment_deadline_at = now() - interval '1 minute' where booking_id = $1`, [
      booking.booking_id,
    ]);
    await db.query(`select public.expire_bookings()`);

    expect((await paymentFor(booking.booking_id)).status).toBe("EXPIRED");
    expect(await bookingStatus(booking.booking_id)).toBe("EXPIRED");
  });
});