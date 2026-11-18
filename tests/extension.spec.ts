import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Extension flow integration tests (migration 0046).
 *
 * Diuji di database karena jaminan yang penting bersifat transaksional:
 * pergeseran reservation BOOKING + CLEANING di bawah exclusion constraint,
 * penolakan saat unit sudah dipesan lagi, dan status pembayaran.
 */
describeDb("extension flow", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unitId = `T-EXT-UNIT-${suffix}`;
  const facilityId = `T-EXT-FAC-${suffix}`;
  const customerId = `T-EXT-CUS-${suffix}`;
  const bookingId = `T-EXT-BK-${suffix}`;
  const branchId = "BR-GANET";
  const day = "2031-03-01";

  const at = (time: string) => `${day} ${time}+07`;

  let db: Client;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();

    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Ext Facility', 'PS5', 'RENTAL')
       on conflict (facility_type_id) do nothing`,
      [facilityId, `TE-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name, status)
       values ($1, $2, $3, 'Ext Unit', 'BOOKED')
       on conflict (unit_id) do nothing`,
      [unitId, branchId, facilityId],
    );
    await db.query(
      `insert into customers (customer_id, name, phone)
       values ($1, 'Ext Customer', '62800000001')
       on conflict (customer_id) do nothing`,
      [customerId],
    );
    await db.query(
      `insert into bookings
         (booking_id, booking_code, branch_id, unit_id, customer_id, status,
          scheduled_start_at, scheduled_end_at, duration_minutes, total_amount)
       values ($1, $2, $3, $4, $5, 'CONFIRMED', $6::timestamptz, $7::timestamptz, 120, 0)`,
      [bookingId, `SR-EXT${suffix.slice(0, 3)}`, branchId, unitId, customerId, at("10:00"), at("12:00")],
    );
    await db.query(
      `insert into unit_reservations (unit_id, booking_id, kind, period)
       values ($1, $2, 'BOOKING', tstzrange($3::timestamptz, $4::timestamptz, '[)')),
              ($1, $2, 'CLEANING', tstzrange($4::timestamptz, $4::timestamptz + interval '10 minutes', '[)'))`,
      [unitId, bookingId, at("10:00"), at("12:00")],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(
      `delete from payments where extension_id in
         (select extension_id from booking_extensions where booking_id = $1)`,
      [bookingId],
    );
    await db.query(`delete from booking_extensions where booking_id = $1`, [bookingId]);
    await db.query(`delete from booking_items where booking_id = $1`, [bookingId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from bookings where booking_id = $1`, [bookingId]);
    await db.query(`delete from customers where customer_id = $1`, [customerId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
  });

  it("extends the session, shifts BOOKING + CLEANING, and records a pending payment", async () => {
    const { rows } = await db.query(
      `select * from public.request_extension($1, 60)`,
      [bookingId],
    );
    expect(rows[0].extension_id).toMatch(/^EXT-/);
    expect(new Date(rows[0].new_end_at).toISOString()).toBe(new Date(at("13:00")).toISOString());
    expect(rows[0].payment_id).toMatch(/^PAY-/);

    const booking = await db.query(
      `select scheduled_end_at, duration_minutes from bookings where booking_id = $1`,
      [bookingId],
    );
    expect(new Date(booking.rows[0].scheduled_end_at).toISOString()).toBe(
      new Date(at("13:00")).toISOString(),
    );
    expect(booking.rows[0].duration_minutes).toBe(180);

    const reservations = await db.query(
      `select kind, lower(period) as from_at, upper(period) as until_at
         from unit_reservations where booking_id = $1 order by kind`,
      [bookingId],
    );
    const byKind = Object.fromEntries(reservations.rows.map((r) => [r.kind, r]));
    expect(new Date(byKind.BOOKING.until_at).toISOString()).toBe(new Date(at("13:00")).toISOString());
    expect(new Date(byKind.CLEANING.from_at).toISOString()).toBe(new Date(at("13:00")).toISOString());
    expect(new Date(byKind.CLEANING.until_at).toISOString()).toBe(new Date(at("13:10")).toISOString());

    const payment = await db.query(
      `select status, gross_amount from payments where extension_id = $1`,
      [rows[0].extension_id],
    );
    expect(payment.rows[0].status).toBe("PENDING");
  });

  it("rejects a duration that is not a multiple of the extension interval", async () => {
    await expect(
      db.query(`select * from public.request_extension($1, 90)`, [bookingId]),
    ).rejects.toThrow(/kelipatan 60 menit/);
  });

  it("refuses a room that would collide with the next reservation (including cleaning)", async () => {
    await db.query(
      `insert into unit_reservations (unit_id, booking_id, kind, period)
       values ($1, null, 'BLOCK', tstzrange($2::timestamptz, $3::timestamptz, '[)'))`,
      [unitId, at("13:30"), at("14:00")],
    );

    await expect(
      db.query(`select * from public.request_extension($1, 60)`, [bookingId]),
    ).rejects.toThrow(/tidak ada ruang/);

    // End tidak boleh berubah saat permintaan ditolak.
    const booking = await db.query(
      `select scheduled_end_at from bookings where booking_id = $1`,
      [bookingId],
    );
    expect(new Date(booking.rows[0].scheduled_end_at).toISOString()).toBe(
      new Date(at("13:00")).toISOString(),
    );

    await db.query(
      `delete from unit_reservations where unit_id = $1 and kind = 'BLOCK'`,
      [unitId],
    );
  });

  it("cancels the last extension and reverses time, reservations and payment", async () => {
    const { rows } = await db.query(`select * from public.request_extension($1, 60)`, [bookingId]);
    const extensionId = rows[0].extension_id;

    const status = await db.query(`select public.cancel_extension($1, 'uji batal') as s`, [extensionId]);
    expect(status.rows[0].s).toBe("CANCELLED");

    const booking = await db.query(
      `select scheduled_end_at, duration_minutes from bookings where booking_id = $1`,
      [bookingId],
    );
    expect(new Date(booking.rows[0].scheduled_end_at).toISOString()).toBe(
      new Date(at("13:00")).toISOString(),
    );
    expect(booking.rows[0].duration_minutes).toBe(180);

    const cleaning = await db.query(
      `select lower(period) as from_at from unit_reservations
        where booking_id = $1 and kind = 'CLEANING'`,
      [bookingId],
    );
    expect(new Date(cleaning.rows[0].from_at).toISOString()).toBe(new Date(at("13:00")).toISOString());

    const payment = await db.query(
      `select status from payments where extension_id = $1`,
      [extensionId],
    );
    expect(payment.rows[0].status).toBe("FAILED");
  });

  it("settles pending extension payments when the booking is checked out", async () => {
    await db.query(`update bookings set status = 'IN_USE' where booking_id = $1`, [bookingId]);
    await db.query(`select public.complete_booking($1)`, [bookingId]);

    const paid = await db.query(
      `select count(*)::int as n from payments p
         join booking_extensions e on e.extension_id = p.extension_id
        where e.booking_id = $1 and p.status = 'PAID'`,
      [bookingId],
    );
    expect(paid.rows[0].n).toBe(1);
  });
});