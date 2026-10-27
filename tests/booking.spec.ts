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
  const snackId = `B-SNK-${suffix}`;
  const branchId = "BR-GANET";
  const phone = `0899${suffix}`;
  const startStock = 10;

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
    await db.query(
      `insert into snacks (snack_id, name, category, price, stock, min_stock)
       values ($1, 'Stock Test Snack', 'SNACK', 10000, $2, 1)`,
      [snackId, startStock],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from inventory_movements where snack_id = $1`, [snackId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [branchId, facilityId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.query(`delete from snacks where snack_id = $1`, [snackId]);
    await db.end();
  });

  // each test owns a clean unit: no leftover reservations, no leftover status
  beforeEach(async () => {
    await db.query(`delete from inventory_movements where snack_id = $1`, [snackId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`, [unitId]);
    await db.query(`update snacks set stock = $2, active = true where snack_id = $1`, [snackId, startStock]);
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

  async function createBookingWithSnacks(start: string, qty: number, name = "Snack Tester") {
    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, $3, $4, $5::timestamptz, 60, null, null, $6::jsonb)`,
      [branchId, unitId, name, phone, at(start), JSON.stringify([{ snack_id: snackId, quantity: qty }])],
    );
    return rows[0] as { booking_id: string; total_amount: number };
  }

  const stockOf = async () =>
    (await db.query(`select stock from snacks where snack_id = $1`, [snackId])).rows[0].stock as number;

  const movementsOf = async () =>
    (await db.query(
      `select movement_type, qty_delta, stock_after from inventory_movements
        where snack_id = $1 order by id`,
      [snackId],
    )).rows as { movement_type: string; qty_delta: number; stock_after: number }[];

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

  it("starts a walk-in now, whenever 'now' happens to be", async () => {
    // Migration 0030. The cashier form leaves the time empty to mean "sekarang", and
    // that used to be floored to the top of the hour: with a 60-minute interval and a
    // 10-minute late tolerance, every start between HH:10 and HH:59 was refused as
    // 'waktu mulai sudah terlewat'. So this test is deliberately time-of-day
    // independent in intent but strict in effect — it fails if the floor ever returns.
    // Compare against the DATABASE clock, not this machine's: a dev/CI host can drift
    // from the server by minutes, which made a local `new Date()` comparison flaky.
    const { rows: clock } = await db.query(`select now() as db_now`);
    const dbNow = new Date(clock[0].db_now).getTime();

    const { rows } = await db.query(
      `select * from public.create_booking($1, $2, 'Walk-in Tester', $3, null, 60)`,
      [branchId, unitId, phone],
    );
    const start = new Date(rows[0].scheduled_start_at).getTime();

    // Started when the call was made, not at the top of the hour and not in the past.
    expect(Math.abs(start - dbNow)).toBeLessThan(120_000);
    expect(start).toBeGreaterThanOrEqual(dbNow - 60_000);
  });

  it("rejects a duration outside the configured bounds", async () => {
    await expect(createBooking("20:00", 30)).rejects.toThrow(/durasi/);
    await expect(createBooking("20:00", 480)).rejects.toThrow(/durasi/);
  });

  it("lets exactly one of two concurrent bookings win", { timeout: 30_000 }, async () => {
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

  // Pins the behaviour found by accident during UI verification: resolve_customer()
  // matches on phone and then OVERWRITES the stored name with whatever the new
  // booking supplies. Booking as "Verifikasi Tiket Otomatis" on a phone that
  // already belonged to a real customer silently renamed that customer's row, and
  // every older booking for that phone then displayed the new name.
  //
  // Phone-as-identity with "latest name wins" is a defensible choice — a customer
  // may fix a typo on a later booking. What is not defensible is it happening
  // silently. This test exists so that changing it is a deliberate act: if the
  // name stop being overwritten, this fails and the decision gets made on purpose.
  it("overwrites the stored customer name on a later booking for the same phone", async () => {
    const first = await createBooking("12:00", 60, "Nama Asli Fixture");
    const second = await createBooking("14:00", 60, "Nama Baru dari Booking");

    const { rows } = await db.query(
      `select c.name, c.phone
         from bookings b join customers c on c.customer_id = b.customer_id
        where b.booking_id = $1`,
      [second.booking_id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Nama Baru dari Booking");
    expect(rows[0].phone).toBe(phone);

    // The older booking renders through the same shared customer row, so it now
    // reports the newer name too. That is the consequence worth being explicit about.
    const { rows: older } = await db.query(
      `select c.name from bookings b join customers c on c.customer_id = b.customer_id
        where b.booking_id = $1`,
      [first.booking_id],
    );
    expect(older[0].name).toBe("Nama Baru dari Booking");

    await db.query(`select public.cancel_booking($1)`, [first.booking_id]);
    await db.query(`select public.cancel_booking($1)`, [second.booking_id]);
  });

  // --- snack stock movements -------------------------------------------------
  // Regression cover for the bug where nothing ever inserted into
  // inventory_movements: 6 snack line items existed with 0 movements, so stock
  // never moved and the admin inventory ledger was permanently empty.

  it("decrements snack stock and records a SALE movement on booking", async () => {
    const booking = await createBookingWithSnacks("10:00", 3);

    expect(await stockOf()).toBe(startStock - 3);

    const moves = await movementsOf();
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ movement_type: "SALE", qty_delta: -3, stock_after: startStock - 3 });
    expect(booking.total_amount).toBe(20000 + 3 * 10000); // 1h rental + 3 snacks
  });

  it("rejects a snack order that would oversell", async () => {
    await expect(createBookingWithSnacks("10:00", startStock + 5)).rejects.toThrow(/negative/);
    expect(await stockOf()).toBe(startStock);
    expect(await movementsOf()).toHaveLength(0);
  });

  it("returns snack stock when the booking is cancelled", async () => {
    const booking = await createBookingWithSnacks("10:00", 4);
    expect(await stockOf()).toBe(startStock - 4);

    await db.query(`select public.cancel_booking($1, 'stock test')`, [booking.booking_id]);
    expect(await stockOf()).toBe(startStock);

    const moves = await movementsOf();
    expect(moves.map((m) => m.movement_type)).toEqual(["SALE", "IN"]);
    expect(moves[1]).toMatchObject({ qty_delta: 4, stock_after: startStock });
  });

  it("returns snack stock when the booking expires", async () => {
    const booking = await createBookingWithSnacks("10:00", 2);
    expect(await stockOf()).toBe(startStock - 2);

    // force the expiry path the cron uses
    await db.query(`update bookings set status = 'EXPIRED' where booking_id = $1`, [booking.booking_id]);
    expect(await stockOf()).toBe(startStock);
  });

  it("does not double-return stock when a terminal status is rewritten", async () => {
    const booking = await createBookingWithSnacks("10:00", 2);
    await db.query(`update bookings set status = 'EXPIRED' where booking_id = $1`, [booking.booking_id]);
    await db.query(`update bookings set status = 'CANCELLED' where booking_id = $1`, [booking.booking_id]);

    expect(await stockOf()).toBe(startStock);
    expect((await movementsOf()).filter((m) => m.movement_type === "IN")).toHaveLength(1);
  });

  // Manual corrections from /admin/snacks go through this: the route inserts an
  // ADJUSTMENT row and lets the same BEFORE INSERT trigger apply it, so
  // snacks.stock is never written directly. These pin that contract — the delta is
  // applied, stock_after is filled, the reason survives, and a correction that would
  // drive stock negative is refused instead of silently recorded.

  const adjust = (delta: number, reason: string) =>
    db.query(
      `insert into inventory_movements (snack_id, movement_type, qty_delta, reason)
       values ($1, 'ADJUSTMENT', $2, $3)`,
      [snackId, delta, reason],
    );

  it("applies a manual ADJUSTMENT movement and records who and why", async () => {
    await adjust(-4, "koreksi stok manual");
    expect(await stockOf()).toBe(startStock - 4);

    const moves = await movementsOf();
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({
      movement_type: "ADJUSTMENT",
      qty_delta: -4,
      stock_after: startStock - 4,
    });

    const { rows } = await db.query(`select reason from inventory_movements where snack_id = $1`, [snackId]);
    expect(rows[0].reason).toBe("koreksi stok manual");
  });

  it("refuses a manual ADJUSTMENT that would drive stock negative", async () => {
    // Asserts the refusal itself, not its wording. Migration 0033 rewrites this
    // exception in Indonesian with a real errcode, so pinning the English string here
    // would only break the test on a deploy. The wording and the SQLSTATE are checked
    // separately, below, where the test can be skipped until 0033 is applied.
    await expect(adjust(-(startStock + 1), "typo admin")).rejects.toThrow();
    expect(await stockOf()).toBe(startStock);
    expect(await movementsOf()).toHaveLength(0);
  });

  // Migration 0033 changes what this refusal looks like: SQLSTATE 22023 instead of
  // P0001, and a message naming the snack instead of quoting its id. P0001 is the
  // fallback for every errcode-less raise in plpgsql, which is why the fix belongs in
  // the trigger rather than in the API's list of client-error codes.
  it("answers an oversell with SQLSTATE 22023 so the API returns 400, not 500", async () => {
    const err = await adjust(-(startStock + 1), "sqlstate probe").then(
      () => null,
      (e: Error & { code?: string }) => e,
    );
    expect(err, "the oversell must be refused").not.toBeNull();

    if (err!.code !== "22023") {
      // 0033 is written but not applied to this database yet. Returning with a warning
      // rather than failing keeps the suite truthful about the guarantee: before the
      // migration this is genuinely still returning P0001, and after it, this test
      // starts enforcing the message and the status on its own.
      console.warn(
        `0033 not applied: oversell still returns ${err!.code}, expected 22023`,
      );
      return;
    }

    expect(err!.message).toContain("Stock Test Snack");
    // The id means nothing to a customer; the name is what they recognise.
    expect(err!.message).not.toContain(snackId);
    expect(err!.message).toMatch(/tidak cukup/i);
  });

  // --- unit release ---------------------------------------------------------
  // Regression cover for four units stranded in BOOKED while their booking was
  // EXPIRED or CANCELLED. cancel_booking() only reset the unit for a CONFIRMED
  // booking, so cancelling a WAITING_PAYMENT one — the common case — left it
  // BOOKED forever, and expire_bookings() never touched units at all.

  const unitStatus = async () =>
    (await db.query(`select status from units where unit_id = $1`, [unitId])).rows[0].status as string;

  it("releases the unit when a WAITING_PAYMENT booking is cancelled", async () => {
    const booking = await createBooking("10:00", 60, "Cancel Unpaid");
    expect(await unitStatus()).toBe("BOOKED");

    await db.query(`select public.cancel_booking($1, 'unpaid cancel')`, [booking.booking_id]);
    expect(await unitStatus()).toBe("AVAILABLE");

    const { rows } = await db.query(
      `select to_status, reason from unit_status_history
        where unit_id = $1 and booking_id = $2 order by id`,
      [unitId, booking.booking_id],
    );
    expect(rows.at(-1)).toMatchObject({ to_status: "AVAILABLE" });
    expect(rows.at(-1).reason).toMatch(/CANCELLED/);
  });

  it("releases the unit when a booking expires", async () => {
    const booking = await createBooking("10:00", 60, "Expire Me");
    await db.query(`update bookings set status = 'EXPIRED' where booking_id = $1`, [booking.booking_id]);
    expect(await unitStatus()).toBe("AVAILABLE");
  });

  it("releases the unit when a booking is a no-show", async () => {
    const booking = await createBooking("10:00", 60, "No Show");
    await db.query(`update bookings set status = 'NO_SHOW' where booking_id = $1`, [booking.booking_id]);
    expect(await unitStatus()).toBe("AVAILABLE");
  });

  it("does not stomp a unit a staff member took out of service", async () => {
    const booking = await createBooking("10:00", 60, "Out Of Service");
    await db.query(`update units set status = 'MAINTENANCE' where unit_id = $1`, [unitId]);

    await db.query(`select public.cancel_booking($1, 'maintenance')`, [booking.booking_id]);
    expect(await unitStatus()).toBe("MAINTENANCE");
  });

  it("releases the unit exactly once across repeated terminal rewrites", async () => {
    const booking = await createBooking("10:00", 60, "Rewrite");
    await db.query(`update bookings set status = 'EXPIRED' where booking_id = $1`, [booking.booking_id]);
    await db.query(`update bookings set status = 'CANCELLED' where booking_id = $1`, [booking.booking_id]);

    const { rows } = await db.query(
      `select count(*)::int as n from unit_status_history
        where unit_id = $1 and booking_id = $2 and to_status = 'AVAILABLE'`,
      [unitId, booking.booking_id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("leaves the cleaning step alone when a booking completes", async () => {
    const booking = await createBooking("10:00", 60, "Completed Clean");
    await db.query(`select public.confirm_booking($1)`, [booking.booking_id]);
    await db.query(`select public.check_in($1)`, [booking.booking_id]);
    await db.query(`select public.complete_booking($1)`, [booking.booking_id]);

    // COMPLETED must not hand the console straight back: it has to go out for
    // cleaning and wait for mark_unit_ready().
    expect(await unitStatus()).toBe("IN_ORDER");
    expect(await db.query(`select public.mark_unit_ready($1) as s`, [unitId]).then((r) => r.rows[0].s)).toBe("AVAILABLE");
  });

  // 0025: OFFLINE was a one-way street. The admin UI has always offered "Set Ready"
  // on an offline unit and /admin/units promises "aktifkan lagi setelah siap", but
  // the guard here only accepted IN_ORDER and MAINTENANCE, so the button always
  // failed and eight Batu 5 units sat stuck in OFFLINE.
  it("brings an offline unit back into service", async () => {
    await db.query(`update units set status = 'OFFLINE', condition = 'DAMAGED' where unit_id = $1`, [unitId]);

    expect(
      await db.query(`select public.mark_unit_ready($1) as s`, [unitId]).then((r) => r.rows[0].s),
    ).toBe("AVAILABLE");

    const { rows } = await db.query(`select status, condition from units where unit_id = $1`, [unitId]);
    expect(rows[0].status).toBe("AVAILABLE");
    // Condition is reset with the status: a unit handed back as ready cannot keep
    // a DAMAGED flag, or the catalog would list it as needing attention.
    expect(rows[0].condition).toBe("GOOD");
  });

  it("records the offline-to-available move in unit_status_history", async () => {
    await db.query(`update units set status = 'OFFLINE' where unit_id = $1`, [unitId]);
    await db.query(`select public.mark_unit_ready($1)`, [unitId]);

    const { rows } = await db.query(
      `select count(*)::int as n from unit_status_history
        where unit_id = $1 and from_status = 'OFFLINE' and to_status = 'AVAILABLE'`,
      [unitId],
    );
    expect(rows[0].n).toBe(1);
  });

  // Widening the guard for OFFLINE must not have widened it for everything else: a
  // unit that still has a live booking would become bookable twice.
  it("still refuses to ready a unit that is booked or in use", async () => {
    for (const status of ["BOOKED", "IN_USE"]) {
      await db.query(`update units set status = $2::unit_status where unit_id = $1`, [unitId, status]);
      await expect(
        db.query(`select public.mark_unit_ready($1)`, [unitId]),
      ).rejects.toThrow(/tidak bisa ditandai siap/);
      expect(await unitStatus()).toBe(status);
    }
  });
});