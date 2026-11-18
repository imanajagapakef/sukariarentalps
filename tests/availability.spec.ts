import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Availability engine integration tests.
 *
 * These run against the real database because the guarantees under test are
 * database-level: the GiST exclusion constraint, generated codes, triggers and
 * the cron function. Mocking Postgres here would test nothing worth testing.
 *
 * Setup: copy .env.test.example to .env.test and set TEST_DATABASE_URL to the
 * Supabase pooler connection string, then `npm test`.
 */
describeDb("availability engine", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unitId = `T-UNIT-${suffix}`;
  const facilityId = `T-FAC-${suffix}`;
  const branchId = `BR-GANET`;
  const customerId = `T-CUS-${suffix}`;
  const day = "2030-06-01";

  let db: Client;

  const at = (time: string) => `${day} ${time}+07`;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();

    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Test Facility', 'PS5', 'RENTAL')
       on conflict (facility_type_id) do nothing`,
      [facilityId, `TF-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name)
       values ($1, $2, $3, 'Test Unit')
       on conflict (unit_id) do nothing`,
      [unitId, branchId, facilityId],
    );
    await db.query(
      `insert into customers (customer_id, name, phone)
       values ($1, 'Test Customer', '62800000000')
       on conflict (customer_id) do nothing`,
      [customerId],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where customer_id = $1`, [customerId]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.end();
  });

  async function createBooking(
    id: string,
    code: string,
    start: string,
    end: string,
    status = "CONFIRMED",
    deadline: string | null = null,
  ) {
    await db.query(
      `insert into bookings
         (booking_id, booking_code, branch_id, unit_id, customer_id, status,
          scheduled_start_at, scheduled_end_at, duration_minutes, payment_deadline_at)
       values ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz,
               extract(epoch from ($8::timestamptz - $7::timestamptz)) / 60, $9::timestamptz)`,
      [id, code, branchId, unitId, customerId, status, at(start), at(end), deadline ? at(deadline) : null],
    );
  }

  async function reserve(_id: string | null, kind: string, start: string, end: string, bookingId: string | null) {
    await db.query(
      `insert into unit_reservations (unit_id, booking_id, kind, period)
       values ($1, $2, $3, tstzrange($4::timestamptz, $5::timestamptz, '[)'))`,
      [unitId, bookingId, kind, at(start), at(end)],
    );
  }

  it("accepts a first reservation", async () => {
    await createBooking(`T-BK1-${suffix}`, `SR-T1${suffix.slice(0, 3)}`, "10:00", "12:00");
    await reserve(`T-BK1-${suffix}`, "BOOKING", "10:00", "12:00", `T-BK1-${suffix}`);

    const { rows } = await db.query(
      `select count(*)::int as n from unit_reservations where unit_id = $1`,
      [unitId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("rejects an overlapping reservation at the database level", async () => {
    await expect(reserve(null, "BLOCK", "11:00", "13:00", null)).rejects.toThrow(
      /unit_reservations_no_overlap/,
    );
  });

  it("reports the right next_available after a booking", async () => {
    const { rows } = await db.query(
      `select public.next_available($1, $2::timestamptz) as next_free`,
      [unitId, at("10:30")],
    );
    expect(new Date(rows[0].next_free).toISOString()).toBe(
      new Date(at("12:00")).toISOString(),
    );
  });

  it("includes the cleaning buffer before the next bookable slot", async () => {
    await createBooking(`T-BK2-${suffix}`, `SR-T2${suffix.slice(0, 3)}`, "12:00", "14:00");
    await reserve(`T-BK2-${suffix}`, "BOOKING", "12:00", "14:00", `T-BK2-${suffix}`);
    await reserve(`T-BK2-${suffix}`, "CLEANING", "14:00", "14:10", `T-BK2-${suffix}`);

    const { rows } = await db.query(
      `select public.next_available($1, $2::timestamptz) as next_free`,
      [unitId, at("10:30")],
    );
    expect(new Date(rows[0].next_free).toISOString()).toBe(
      new Date(at("14:10")).toISOString(),
    );
  });

  it("allows a booking immediately after the cleaning buffer", async () => {
    const { rows } = await db.query(
      `select count(*)::int as n
         from public.get_available_units($1, $2::timestamptz, $3::timestamptz)
        where unit_id = $4`,
      [branchId, at("14:10"), at("16:10"), unitId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("blocks a booking that eats into the cleaning buffer", async () => {
    const { rows } = await db.query(
      `select count(*)::int as n
         from public.get_available_units($1, $2::timestamptz, $3::timestamptz)
        where unit_id = $4`,
      [branchId, at("14:00"), at("16:00"), unitId],
    );
    expect(rows[0].n).toBe(0);
  });

  it("caps extension at the next reservation", async () => {
    const { rows } = await db.query(
      `select public.latest_extendable($1) as boundary`,
      [`T-BK1-${suffix}`],
    );
    // BK1 ends 12:00, BK2 starts 12:00 -> no room to extend
    expect(new Date(rows[0].boundary).toISOString()).toBe(
      new Date(at("12:00")).toISOString(),
    );
  });

  it("lets the last booking extend to its own end when nothing follows", async () => {
    const { rows } = await db.query(
      `select public.latest_extendable($1) as boundary`,
      [`T-BK2-${suffix}`],
    );
    // 0045: tidak ada reservasi berikutnya -> NULL (unit bebas), bukan jam
    // selesai booking itu sendiri yang dulu dibaca halaman sebagai "ruang 0".
    expect(rows[0].boundary).toBeNull();
  });

  it("reports the busy range and kind so the picker can show who occupies a slot and when it frees up", async () => {
    const { rows } = await db.query(
      `select slot_start, state, busy_from, busy_until, busy_kind
         from public.slot_availability($1, $2, $3::date, 60)
        where slot_start >= $4::timestamptz and slot_start < $5::timestamptz
        order by slot_start`,
      [branchId, unitId, day, at("10:00"), at("15:00")],
    );

    const byTime = Object.fromEntries(
      rows.map((r) => [new Date(r.slot_start).toISOString(), r]),
    );
    const at10 = byTime[new Date(at("10:00")).toISOString()];
    const at12 = byTime[new Date(at("12:00")).toISOString()];
    const at14 = byTime[new Date(at("14:00")).toISOString()];

    expect(at10.state).toBe("BOOKED");
    expect(at10.busy_kind).toBe("BOOKING");
    expect(new Date(at10.busy_from).toISOString()).toBe(new Date(at("10:00")).toISOString());
    expect(new Date(at10.busy_until).toISOString()).toBe(new Date(at("12:00")).toISOString());

    // Blok berikutnya (BK2) punya rentang sendiri, bukan menyambung BK1.
    expect(at12.state).toBe("BOOKED");
    expect(new Date(at12.busy_from).toISOString()).toBe(new Date(at("12:00")).toISOString());
    expect(new Date(at12.busy_until).toISOString()).toBe(new Date(at("14:00")).toISOString());

    // Jendela pembersihan punya kind dan batas sendiri, supaya pemilih jam bisa
    // membedakan "dipesan" dari "dibersihkan".
    expect(at14.state).toBe("CLEANING");
    expect(at14.busy_kind).toBe("CLEANING");
    expect(new Date(at14.busy_from).toISOString()).toBe(new Date(at("14:00")).toISOString());
    expect(new Date(at14.busy_until).toISOString()).toBe(new Date(at("14:10")).toISOString());
  });

  it("prices an exact package and a package-plus-hourly remainder", async () => {
    const { rows } = await db.query(
      `select public.calculate_price('BR-GANET', 'FAC-VIP', 120) as exact,
              public.calculate_price('BR-GANET', 'FAC-VIP', 180) as remainder`,
    );
    expect(rows[0].exact).toBe(60000);    // 2h VIP package
    expect(rows[0].remainder).toBe(95000); // 2h package (60000) + 1h hourly (35000)
  });

  it("expires an unpaid booking and releases the slot", async () => {
    await createBooking(
      `T-BK3-${suffix}`,
      `SR-T3${suffix.slice(0, 3)}`,
      "20:00",
      "22:00",
      "WAITING_PAYMENT",
      null,
    );
    await db.query(
      `update bookings set payment_deadline_at = now() - interval '1 minute'
        where booking_id = $1`,
      [`T-BK3-${suffix}`],
    );
    await reserve(`T-BK3-${suffix}`, "BOOKING", "20:00", "22:00", `T-BK3-${suffix}`);

    const expired = await db.query(`select public.expire_bookings() as n`);
    expect(expired.rows[0].n).toBeGreaterThanOrEqual(1);

    const after = await db.query(
      `select b.status,
              (select count(*)::int from unit_reservations r where r.booking_id = b.booking_id) as reservations
         from bookings b where b.booking_id = $1`,
      [`T-BK3-${suffix}`],
    );
    expect(after.rows[0].status).toBe("EXPIRED");
    expect(after.rows[0].reservations).toBe(0);
  });

  it("keeps stock in sync through the inventory ledger", async () => {
    const snackId = `T-SNK-${suffix}`;
    await db.query(
      `insert into snacks (snack_id, name, category, price, stock, min_stock)
       values ($1, 'Test Snack', 'SNACK', 10000, 10, 2)`,
      [snackId],
    );

    await db.query(
      `insert into inventory_movements (snack_id, movement_type, qty_delta)
       values ($1, 'OUT', -3)`,
      [snackId],
    );

    const { rows } = await db.query(`select stock from snacks where snack_id = $1`, [snackId]);
    expect(rows[0].stock).toBe(7);

    await expect(
      db.query(
        `insert into inventory_movements (snack_id, movement_type, qty_delta)
         values ($1, 'OUT', -100)`,
        [snackId],
      ),
    ).rejects.toThrow(/negative/);

    await db.query(`delete from inventory_movements where snack_id = $1`, [snackId]);
    await db.query(`delete from snacks where snack_id = $1`, [snackId]);
  });
});