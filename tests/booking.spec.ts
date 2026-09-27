import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Booking engine integration tests.
 *
 * These call the real RPCs (create_booking, confirm_booking, ...) against the
 * real database, because the guarantees under test are transactional: slot
 * locking, state machine guards and the cleaning buffer. A mocked database
 * would only test the mock.
 */
describeDb("booking engine", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unitId = `B-UNIT-${suffix}`;
  const facilityId = `B-FAC-${suffix}`;
  const branchId = "BR-GANET";
  const phone = `0899${suffix}`;

  let db: Client;

  // must stay inside booking_config.advance_booking_days (30), so pick a
  // date a few days out rather than a hard-coded future year
  const day = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const at = (time: string) => `${day} ${time}+07`;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();

    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Booking Test Facility', 'PS5', 'RENTAL')`,
      [facilityId, `BF-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name)
       values ($1, $2, $3, 'Booking Test Unit')`,
      [unitId, branchId, facilityId],
    );
    // VIP pricing already exists for BR-GANET; add one for this facility so
    // calculate_price has something to return.
    await db.query(
      `insert into pricing_rules (pricing_id, branch_id, facility_type_id, pricing_type, duration_minutes, price)
       values ($1, $2, $3, 'HOURLY', 60, 20000),
              ($4, $2, $3, 'PACKAGE', 120, 35000)`,
      [`BP-1-${suffix}`, branchId, facilityId, `BP-2-${suffix}`],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [branchId, facilityId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
  });

  // each test owns a clean unit: no leftover reservations, no leftover status
  beforeEach(async () => {
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`, [unitId]);
  });

  async function createBooking(start: string, duration = 120, name = "Booking Tester") {
    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, $6)`,
      [branchId, unitId, name, phone, at(start), duration],
    );
    return rows[0] as {
      booking_id: string;
      booking_code: string;
      scheduled_start_at: string;
      scheduled_end_at: string;
      total_amount: number;
      payment_deadline_at: string;
    };
  }

  it("creates a booking with the right code, price and reservations", async () => {
    const booking = await createBooking("10:00");

    expect(booking.booking_code).toMatch(/^SR-[A-Z2-9]{6}$/);
    expect(booking.total_amount).toBe(35000); // 2h package

    const { rows: reservations } = await db.query(
      `select kind, lower(period) as starts, upper(period) as ends
         from unit_reservations where booking_id = $1 order by kind`,
      [booking.booking_id],
    );
    expect(reservations.map((r) => r.kind)).toEqual(["BOOKING", "CLEANING"]);

    const cleaning = reservations.find((r) => r.kind === "CLEANING");
    expect(new Date(cleaning.ends).toISOString()).toBe(new Date(at("12:10")).toISOString());

    const { rows: unit } = await db.query(`select status from units where unit_id = $1`, [unitId]);
    expect(unit[0].status).toBe("BOOKED");

    const { rows: line } = await db.query(
      `select count(*)::int as n from booking_items where booking_id = $1`,
      [booking.booking_id],
    );
    expect(line[0].n).toBe(1);
  });

  it("rejects a booking that overlaps an existing one", async () => {
    await createBooking("10:00");
    await expect(createBooking("11:00", 60, "Second")).rejects.toThrow(
      /unit_reservations_no_overlap/,
    );
  });

  it("rejects a duration outside the configured bounds", async () => {
    await expect(createBooking("20:00", 30)).rejects.toThrow(/durasi/);
    await expect(createBooking("20:00", 480)).rejects.toThrow(/durasi/);
  });

  it("lets exactly one of two concurrent bookings win", async () => {
    // two independent connections, same slot, fired together
    const a = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    const b = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await Promise.all([a.connect(), b.connect()]);

    const attempt = (c: Client, label: string) =>
      c
        .query(`select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, $6)`, [
          branchId, unitId, `Race ${label}`, phone, at("14:00"), 60,
        ])
        .then(() => "ok" as const)
        .catch((e) => e.message as string);

    try {
      const results = await Promise.all([attempt(a, "A"), attempt(b, "B")]);
      const wins = results.filter((r) => r === "ok");
      const losses = results.filter((r) => r !== "ok");

      expect(wins).toHaveLength(1);
      expect(losses).toHaveLength(1);
      expect(losses[0]).toMatch(/unit_reservations_no_overlap/);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("runs the full lifecycle: confirm, check-in, complete, ready", async () => {
    const booking = await createBooking("16:00", 60, "Lifecycle");

    expect(await db.query(`select public.confirm_booking($1) as s`, [booking.booking_id]).then((r) => r.rows[0].s)).toBe("CONFIRMED");
    expect(await db.query(`select public.check_in($1) as s`, [booking.booking_id]).then((r) => r.rows[0].s)).toBe("IN_USE");
    expect((await db.query(`select status from units where unit_id=$1`, [unitId])).rows[0].status).toBe("IN_USE");

    expect(await db.query(`select public.complete_booking($1) as s`, [booking.booking_id]).then((r) => r.rows[0].s)).toBe("COMPLETED");
    expect((await db.query(`select status, condition from units where unit_id=$1`, [unitId])).rows[0]).toMatchObject({
      status: "IN_ORDER",
      condition: "NEEDS_CLEANING",
    });

    expect(await db.query(`select public.mark_unit_ready($1) as s`, [unitId]).then((r) => r.rows[0].s)).toBe("AVAILABLE");

    const { rows: history } = await db.query(
      `select to_status from unit_status_history where unit_id = $1 and booking_id = $2 order by id`,
      [unitId, booking.booking_id],
    );
    expect(history.map((h) => h.to_status)).toEqual(["BOOKED", "IN_USE", "IN_ORDER"]);
  });

  it("guards the state machine against illegal transitions", async () => {
    const booking = await createBooking("18:00", 60, "Guarded");

    // cannot check in before payment
    await expect(
      db.query(`select public.check_in($1)`, [booking.booking_id]),
    ).rejects.toThrow(/check-in dari status WAITING_PAYMENT/);

    await db.query(`select public.confirm_booking($1)`, [booking.booking_id]);
    // cannot confirm twice
    await expect(
      db.query(`select public.confirm_booking($1)`, [booking.booking_id]),
    ).rejects.toThrow(/dikonfirmasi dari status CONFIRMED/);
  });

  it("releases the slot on cancellation", async () => {
    const booking = await createBooking("22:00", 60, "Cancel Me");
    await db.query(`select public.cancel_booking($1, 'test')`, [booking.booking_id]);

    const { rows: left } = await db.query(
      `select count(*)::int as n from unit_reservations where booking_id = $1`,
      [booking.booking_id],
    );
    expect(left[0].n).toBe(0);

    const { rows: avail } = await db.query(
      `select count(*)::int as n from public.get_available_units($1, $2::timestamptz, $3::timestamptz) where unit_id = $4`,
      [branchId, at("22:00"), at("23:00"), unitId],
    );
    expect(avail[0].n).toBe(1);
  });

  it("reuses the customer record by phone number", async () => {
    const first = await createBooking("08:00", 60, "Reuse Check");
    const second = await createBooking("10:00", 60, "Reuse Check");

    const { rows } = await db.query(
      `select customer_id from bookings where booking_id in ($1, $2)`,
      [first.booking_id, second.booking_id],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].customer_id).toBe(rows[1].customer_id);

    await db.query(`select public.cancel_booking($1)`, [first.booking_id]);
    await db.query(`select public.cancel_booking($1)`, [second.booking_id]);
  });
});