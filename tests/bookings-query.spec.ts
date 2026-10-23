import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { BOOKING_PAGE_SIZE, countWaitingPayment, listBookings, listBookingsPage } from "@/lib/bookings-query";
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

  it("carries the payment deadline the cashier queue column renders", async () => {
    const [row] = await listBookings({ q: bookingCode });
    // The "Batas Bayar" column dereferences this on every WAITING_PAYMENT row.
    expect(row.payment_deadline_at).toEqual(expect.any(String));
  });

  it("orders the payment queue by deadline, not by session start", async () => {
    // Nothing settles automatically any more, so the row closest to losing its slot
    // has to be first. The default order (scheduled_start_at desc) buries it.
    await db.query(`update bookings set payment_deadline_at = now() + interval '2 hours' where booking_id = $1`, [
      bookingId,
    ]);
    const far = await listBookings({ status: "WAITING_PAYMENT", q: bookingCode });
    expect(far.map((r) => r.booking_id)).toContain(bookingId);

    // Pull this booking's deadline behind everything else and it must come first.
    const other = await db.query(
      `update bookings set payment_deadline_at = now() + interval '1 hour'
       where booking_id = $1 returning payment_deadline_at`,
      [bookingId],
    );
    const all = await listBookings({ status: "WAITING_PAYMENT" });
    const deadlines = all
      .filter((r) => r.payment_deadline_at)
      .map((r) => Date.parse(r.payment_deadline_at as string));
    const sorted = [...deadlines].sort((a, b) => a - b);
    expect(deadlines).toEqual(sorted);

    // And the row under test is genuinely the nearest deadline in the set.
    expect(all[0]?.booking_id).toBe(bookingId);
    expect(other.rows[0].payment_deadline_at).not.toBeNull();
  });

  it("counts the payment queue for the nav badge", async () => {
    // Read the count on both sides of the list. vitest runs files in parallel and
    // booking.spec.ts inserts rows mid-run, so a single count can disagree with the
    // list by one row for reasons that have nothing to do with this page.
    const before = await countWaitingPayment();
    const rows = await listBookings({ status: "WAITING_PAYMENT" });
    const after = await countWaitingPayment();
    expect(before).toBeGreaterThanOrEqual(1);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    // The badge and the table must agree about what is in the queue, or the number
    // promises work the page cannot show.
    expect(before).toBeGreaterThanOrEqual(Math.min(rows.length, after));
  });

  it("returns one capped page plus the exact size of the filtered set", async () => {
    // The old page capped at 60 rows with no way past them, so a longer book silently
    // hid its older bookings. `total` is what makes them reachable.
    const page = await listBookingsPage({}, 1);
    expect(page.rows.length).toBeLessThanOrEqual(BOOKING_PAGE_SIZE);
    expect(page.total).toBeGreaterThanOrEqual(page.rows.length);
    expect(page.page).toBe(1);
    expect(page.pageCount).toBe(Math.max(1, Math.ceil(page.total / BOOKING_PAGE_SIZE)));
    expect(page.from).toBe(page.rows.length ? 1 : 0);
    expect(page.to).toBe(page.rows.length);
  });

  it("clamps a stale ?page= instead of rendering an empty table", async () => {
    // A filter that narrows the set, or a deleted booking, leaves ?page=9 pointing past
    // the end. The old shape had no pages at all; this is the regression that shape
    // invites — "halaman 9 dari 4" above zero rows.
    const far = await listBookingsPage({}, 9999);
    expect(far.page).toBe(far.pageCount);
    if (far.total > 0) {
      expect(far.rows.length).toBeGreaterThan(0);
      expect(far.to).toBeLessThanOrEqual(far.total);
    }
  });

  it("keeps the search filter inside the page", async () => {
    const page = await listBookingsPage({ q: bookingCode }, 1);
    expect(page.rows.map((r) => r.booking_id)).toContain(bookingId);
    expect(page.total).toBeGreaterThanOrEqual(1);
    expect(page.rows.length).toBeLessThanOrEqual(BOOKING_PAGE_SIZE);
  });

  it("exports the whole filtered set, not just the first page", async () => {
    // The CSV and the table read the same filters, so paging the table must not quietly
    // become the export's ceiling as well.
    const page = await listBookingsPage({}, 1);
    const all = await listBookings({});
    expect(all.length).toBeGreaterThanOrEqual(page.rows.length);
    if (page.total > BOOKING_PAGE_SIZE) {
      expect(all.length).toBeGreaterThan(BOOKING_PAGE_SIZE);
    }
    // Everything on the page has to be in the export. Safe under parallel inserts: a
    // row added between the two reads can only make the export longer.
    for (const row of page.rows) {
      expect(all.some((r) => r.booking_id === row.booking_id)).toBe(true);
    }
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
