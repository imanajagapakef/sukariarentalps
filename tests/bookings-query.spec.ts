import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { listBookings } from "@/lib/bookings-query";
import { createAdminClient } from "@/lib/supabase/admin";

const connectionString = process.env.TEST_DATABASE_URL;
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// listBookings builds PostgREST filter strings, and PostgREST is only reachable over
// HTTP — a pg client cannot exercise it, which is exactly why the booking search box
// sat broken (HTTP 500 on every term) with a green test suite. This drives the real
// function against the real PostgREST so a filter-syntax regression fails here.
const describeLive = connectionString && hasSupabase ? describe : describe.skip;

describeLive("admin bookings query", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const branchId = "BR-B5";
  const phone = `0898${suffix}`;
  // Customer names are attacker-controllable, so this stands in for the worst case a
  // search box can be handed: filter syntax and a formula prefix at once.
  const hostileName = `=),(${suffix}`;

  let db: Client;
  let bookingId: string;
  let bookingCode: string;
  let unitId: string;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();

    const { rows: unitRows } = await db.query(
      `select u.unit_id
         from units u
         join booking_config bc on bc.branch_id = u.branch_id
        where u.branch_id = $1 and u.status = 'AVAILABLE'
        limit 1`,
      [branchId],
    );
    unitId = unitRows[0].unit_id;

    const created = await db.query(
      `select booking_id, booking_code from public.create_booking($1, $2, $3, $4, $5::timestamptz, 60)`,
      [branchId, unitId, hostileName, phone, new Date(Date.now() + 864e5).toISOString()],
    );
    bookingId = created.rows[0].booking_id;
    bookingCode = created.rows[0].booking_code;
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from unit_reservations where booking_id = $1`, [bookingId]);
    await db.query(`delete from booking_items where booking_id = $1`, [bookingId]);
    await db.query(`delete from unit_status_history where booking_id = $1`, [bookingId]);
    await db.query(`delete from bookings where booking_id = $1`, [bookingId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`,
      [unitId],
    );
    await db.end();
  });

  it("returns the unfiltered book without throwing", async () => {
    await expect(listBookings({})).resolves.toBeInstanceOf(Array);
  });

  it("finds a booking by exact code", async () => {
    const rows = await listBookings({ q: bookingCode });
    expect(rows.map((r) => r.booking_id)).toContain(bookingId);
  });

  it("finds a booking by a partial code", async () => {
    // The code predicate has to stand on its own: an SR-XXXXXX never appears in a
    // customer's name or phone, so returning [] when no customer matched silently
    // broke every code search.
    const rows = await listBookings({ q: bookingCode.slice(3) });
    expect(rows.map((r) => r.booking_id)).toContain(bookingId);
  });

  it("finds a booking by customer phone", async () => {
    const rows = await listBookings({ q: phone });
    expect(rows.map((r) => r.booking_id)).toContain(bookingId);
  });

  it("finds a booking by customer name, even when the name is filter syntax", async () => {
    const rows = await listBookings({ q: suffix });
    expect(rows.map((r) => r.booking_id)).toContain(bookingId);
  });

  it("strips PostgREST metacharacters but keeps the searchable part", async () => {
    // Before escaping, this broke out of the .or() expression and 500'd. The
    // metacharacters have to go while `FYJEJM` still has to find the booking.
    const rows = await listBookings({ q: `%),(${'%'}${bookingCode.slice(3)}` });
    expect(rows.map((r) => r.booking_id)).toContain(bookingId);
  });

  it("treats a term that is only wildcards or syntax as an empty search", async () => {
    // Not an error and not a narrowed result: `%` and `%)` both sanitise away, so
    // the same path as a blank box applies. Asserting a specific count here would be
    // racy — vitest runs files in parallel and booking.spec.ts adds rows between any
    // two queries — so this pins the stable half: no throw, and not an empty page.
    for (const term of ["%", "%)", "(,", "_"]) {
      const rows = await listBookings({ q: term });
      expect(rows.length, `term ${JSON.stringify(term)}`).toBeGreaterThan(0);
    }
  });

  it("returns nothing for a term that matches no customer", async () => {
    expect(await listBookings({ q: `zzz${suffix}` })).toEqual([]);
  });

  it("combines q with a status filter", async () => {
    const rows = await listBookings({ q: bookingCode, status: "WAITING_PAYMENT" });
    expect(rows.map((r) => r.booking_id)).toContain(bookingId);

    const wrong = await listBookings({ q: bookingCode, status: "COMPLETED" });
    expect(wrong).toEqual([]);
  });

  it("ignores a status value that is not in the enum", async () => {
    await expect(listBookings({ status: "NOT_A_STATUS" })).resolves.toBeInstanceOf(Array);
  });

  it("returns the columns the table and the CSV both read", async () => {
    const [row] = await listBookings({ q: bookingCode });
    expect(row).toMatchObject({
      booking_id: expect.any(String),
      booking_code: expect.any(String),
      status: expect.any(String),
      scheduled_start_at: expect.any(String),
      scheduled_end_at: expect.any(String),
      duration_minutes: expect.any(Number),
      total_amount: expect.any(Number),
    });
    // The embedded shapes the JSX dereferences, so a broken embed surfaces here
    // rather than as `Cannot read properties of null` in the table.
    expect(row.customers).toMatchObject({ name: expect.any(String), phone });
    expect(row.units).toMatchObject({ name: expect.any(String) });
  });
});

// Guards the assumption the whole file rests on: listBookings is reachable from a
// plain node test. If someone adds a `server-only` import to the client it imports,
// these tests silently skip instead of failing.
describe("admin bookings query testability", () => {
  it("createAdminClient is constructible in a node test", () => {
    if (!hasSupabase) return;
    expect(() => createAdminClient()).not.toThrow();
  });
});
