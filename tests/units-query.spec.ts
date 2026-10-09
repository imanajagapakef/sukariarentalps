import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { listUnits, UNIT_SORTS, UNIT_STATUSES } from "@/lib/units-query";

const connectionString = process.env.TEST_DATABASE_URL;
const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Same reason as bookings-query.spec.ts: listUnits builds PostgREST filter and order
// strings, and a pg client cannot exercise those. A first draft of the /admin/bookings
// search shipped broken for exactly this reason.
const describeLive = connectionString && hasSupabase ? describe : describe.skip;

describeLive("admin units query", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const branchId = "BR-B5";
  const facilityId = "FAC-REGULAR";
  // Deliberately named like filter syntax, because this name lands in an .or().
  const hostileName = `=),(${suffix}`;

  let db: Client;
  let unitId: string;
  let otherUnitId: string;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();

    // Deliberately NOT AVAILABLE. bookings-query.spec.ts borrows a real AVAILABLE unit
    // at this branch to create a booking on, and if it picks one of these the booking's
    // unit_id FK makes this file's cleanup fail — which surfaces as a suite-level
    // error only when the whole suite runs, never in isolation.
    const { rows } = await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name, condition, status)
       values ($1, $2, $3, $4, 'GOOD', 'MAINTENANCE'),
              ($5, $2, $3, 'Filter Test Plain', 'GOOD', 'IN_ORDER')
       returning unit_id`,
      [`B-UA-${suffix}`, branchId, facilityId, hostileName, `B-UB-${suffix}`],
    );
    unitId = rows[0].unit_id;
    otherUnitId = rows[1].unit_id;
  });

  afterAll(async () => {
    if (!db) return;
    // Belt and braces: also drop anything that could reference these units, so a
    // future change that makes one borrowable fails loudly here instead of silently
    // leaking two rows into the fleet.
    await db.query(`delete from bookings where unit_id in ($1, $2)`, [unitId, otherUnitId]);
    await db.query(`delete from unit_reservations where unit_id in ($1, $2)`, [unitId, otherUnitId]);
    await db.query(`delete from unit_status_history where unit_id in ($1, $2)`, [unitId, otherUnitId]);
    await db.query(`delete from units where unit_id in ($1, $2)`, [unitId, otherUnitId]);
    await db.end();
  });

  it("returns the whole fleet without throwing", async () => {
    await expect(listUnits({})).resolves.toBeInstanceOf(Array);
  });

  it("finds a unit by code", async () => {
    const rows = await listUnits({ q: unitId });
    expect(rows.map((u) => u.unit_id)).toContain(unitId);
  });

  it("finds a unit by name, even when the name is filter syntax", async () => {
    const rows = await listUnits({ q: suffix });
    expect(rows.map((u) => u.unit_id)).toContain(unitId);
  });

  it("does not throw on PostgREST metacharacters", async () => {
    // Before escaping this broke out of the .or() expression. Unlike bookings, a term
    // that sanitises to nothing must not silently mean "match everything".
    const rows = await listUnits({ q: "%)" });
    expect(Array.isArray(rows)).toBe(true);
  });

  it("filters by branch", async () => {
    const rows = await listUnits({ branch: branchId });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((u) => u.branch_id === branchId)).toBe(true);
  });

  it("filters by status", async () => {
    const rows = await listUnits({ status: "MAINTENANCE" });
    // unitId is the MAINTENANCE one; otherUnitId is IN_ORDER and must not leak in.
    expect(rows.map((u) => u.unit_id)).toContain(unitId);
    expect(rows.map((u) => u.unit_id)).not.toContain(otherUnitId);
    expect(rows.every((u) => u.status === "MAINTENANCE")).toBe(true);
  });

  it("filters by a second status independently", async () => {
    const rows = await listUnits({ status: "IN_ORDER" });
    expect(rows.map((u) => u.unit_id)).toContain(otherUnitId);
    expect(rows.every((u) => u.status === "IN_ORDER")).toBe(true);
  });

  it("combines branch, status and q", async () => {
    const rows = await listUnits({ branch: branchId, status: "MAINTENANCE", q: suffix });
    expect(rows.map((u) => u.unit_id)).toContain(unitId);
  });

  it("ignores a status that is not in the enum instead of erroring", async () => {
    const rows = await listUnits({ status: "NOT_A_STATUS" });
    expect(rows.length).toBeGreaterThan(1);
  });

  it("ignores a sort column that is not whitelisted instead of injecting it", async () => {
    // `sort` is interpolated into .order(), so an unrecognised value must fall back
    // rather than reach PostgREST.
    const rows = await listUnits({ sort: "unit_id); drop table units;--" });
    expect(rows.length).toBeGreaterThan(1);
  });

  it("orders ascending and descending on a whitelisted column", async () => {
    const asc = await listUnits({ sort: "name", dir: "asc" });
    const desc = await listUnits({ sort: "name", dir: "desc" });
    expect(asc.length).toBeGreaterThan(2);
    // The direction is honoured: a different row comes first.
    expect(desc[0].name).not.toBe(asc[0].name);

    // `listUnits` always tiebreaks on unit_id ascending, so rows sharing a name keep
    // the same relative order in both directions — desc is NOT a pure reverse. That is
    // deliberate (a stable secondary key is what keeps pagination from reshuffling
    // equal rows), so it is pinned here instead of being left to chance.
    const counts = new Map<string, number>();
    for (const u of asc) counts.set(u.name, (counts.get(u.name) ?? 0) + 1);
    const tiedName = [...counts].find(([, n]) => n > 1)?.[0];
    expect(tiedName, "expected at least one duplicated unit name").toBeTruthy();

    const tiedAsc = asc.filter((u) => u.name === tiedName).map((u) => u.unit_id);
    const tiedDesc = desc.filter((u) => u.name === tiedName).map((u) => u.unit_id);
    expect(tiedAsc).toEqual([...tiedAsc].sort());
    expect(tiedDesc).toEqual(tiedAsc);
  });

  it("orders by every column the UI offers as a sort header", async () => {
    for (const column of UNIT_SORTS) {
      await expect(listUnits({ sort: column })).resolves.toBeInstanceOf(Array);
    }
  });

  it("exposes a status option for every value of the enum", async () => {
    // The status filter is built from this list; a value missing here is a status a
    // staff member cannot filter for.
    expect([...UNIT_STATUSES].sort()).toEqual(
      ["AVAILABLE", "BOOKED", "IN_USE", "IN_ORDER", "MAINTENANCE", "OFFLINE"].sort(),
    );
  });

  it("returns the embedded shapes the table dereferences", async () => {
    const [row] = await listUnits({ q: unitId });
    expect(row).toMatchObject({
      unit_id: expect.any(String),
      name: expect.any(String),
      status: expect.any(String),
      condition: expect.any(String),
      branch_id: expect.any(String),
    });
    expect(row.branches).toMatchObject({ name: expect.any(String) });
    expect(row.facility_types).toMatchObject({ name: expect.any(String) });
  });
});
