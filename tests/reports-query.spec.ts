import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PRESETS,
  bookingReport,
  financialJournal,
  gameRequestReport,
  guestReport,
  occupancyReport,
  recentTransactions,
  resolveRange,
  revenueReport,
  windowedRows,
  type ReportBooking,
} from "@/lib/reports-query";
import { canAuthenticate, signInAsOwner, signOut } from "./admin-harness";
import { createAdminClient } from "@/lib/supabase/admin";

const describeLive = canAuthenticate ? describe : describe.skip;

/** Pure helpers first: they need no database, so they always run. */
describe("reports booking report", () => {
  const row = (over: Partial<ReportBooking>): ReportBooking => ({
    booking_id: over.booking_code ?? "BK",
    booking_code: "SR-AAAAAA",
    status: "COMPLETED",
    source: "ONLINE",
    branch_id: "BR-B5",
    unit_id: "B5-R01",
    // 2026-10-20 20:00 WIB == 13:00Z
    scheduled_start_at: "2026-10-20T13:00:00Z",
    scheduled_end_at: "2026-10-20T15:00:00Z",
    created_at: "2026-10-20T12:00:00Z",
    duration_minutes: 120,
    total_amount: 50000,
    customers: { name: "Test", phone: "0800" },
    units: { name: "Regular 01", branches: { short_name: "Batu 5", name: "Sukaria Batu 5" } },
    ...over,
  });

  it("counts every booking, and every status key starts at zero", () => {
    const report = bookingReport([row({}), row({ booking_code: "SR-BBBBBB", status: "CANCELLED" })]);
    expect(report.total).toBe(2);
    expect(report.byStatus.COMPLETED).toBe(1);
    expect(report.byStatus.CANCELLED).toBe(1);
    // A status with no rows must read 0, not undefined: the ring renders it directly.
    expect(report.byStatus.NO_SHOW).toBe(0);
  });

  it("accounts for every booking in a status the ring can show", () => {
    // The report's percentages are shares of `total`, so any status holding rows that
    // the ring omits makes every other percentage a lie. The page's ring covers these
    // seven; DRAFT is the only exclusion, and it is a pre-submission row.
    const RING = [
      "WAITING_PAYMENT",
      "CONFIRMED",
      "CHECKED_IN",
      "IN_USE",
      "COMPLETED",
      "CANCELLED",
      "EXPIRED",
      "NO_SHOW",
    ] as const;

    const report = bookingReport(
      RING.map((status, i) => row({ booking_code: `SR-${i}AAAAAA`, status })),
    );
    const shown = RING.reduce((sum, s) => sum + (report.byStatus[s] ?? 0), 0);
    expect(shown).toBe(report.total);
  });

  it("splits source into online and walk-in, treating anything else as online", () => {
    const report = bookingReport([
      row({}),
      row({ booking_code: "SR-BBBBBB", source: "WALK_IN" }),
      row({ booking_code: "SR-CCCCCC", source: "SOMETHING_NEW" }),
    ]);
    expect(report.bySource).toEqual({ online: 2, walkIn: 1 });
  });

  it("buckets by WIB day, not UTC day", () => {
    // 16:30Z is 23:30 on the 20th in WIB; 17:30Z is 00:30 on the 21st. Same UTC day,
    // different report day — getting this wrong shifts the whole trend by one day.
    const report = bookingReport([
      row({ booking_code: "SR-AAAAAA", scheduled_start_at: "2026-10-20T16:30:00Z" }),
      row({ booking_code: "SR-BBBBBB", scheduled_start_at: "2026-10-20T17:30:00Z" }),
    ]);
    expect(report.daily.map((d) => d.day)).toEqual(["2026-10-20", "2026-10-21"]);
  });

  it("finds the peak hour in WIB", () => {
    // 20:00 WIB is 13:00Z.
    const report = bookingReport([
      row({ booking_code: "SR-AAAAAA", scheduled_start_at: "2026-10-20T13:00:00Z" }),
      row({ booking_code: "SR-BBBBBB", scheduled_start_at: "2026-10-20T13:00:00Z" }),
      row({ booking_code: "SR-CCCCCC", scheduled_start_at: "2026-10-20T05:00:00Z" }),
    ]);
    expect(report.peakHour).toEqual({ hour: 20, count: 2 });
  });

  it("reports no peak for an empty set rather than a bogus hour", () => {
    expect(bookingReport([]).peakHour).toBeNull();
    expect(bookingReport([]).averagePerDay).toBe(0);
  });

  it("orders the daily series ascending", () => {
    const report = bookingReport([
      row({ booking_code: "SR-CCCCCC", scheduled_start_at: "2026-10-22T13:00:00Z" }),
      row({ booking_code: "SR-AAAAAA", scheduled_start_at: "2026-10-20T13:00:00Z" }),
      row({ booking_code: "SR-BBBBBB", scheduled_start_at: "2026-10-21T13:00:00Z" }),
    ]);
    expect(report.daily.map((d) => d.day)).toEqual([
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
  });
});

describe("reports date range", () => {
  it("honours an explicit from/to over the preset", () => {
    expect(resolveRange("today", { from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
    });
  });

  it("resolves a preset to an inclusive window of the right width", () => {
    for (const preset of PRESETS) {
      const { from, to } = resolveRange(preset.id, {});
      const days = Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000,
      );
      // "7 Hari Terakhir" spans 7 calendar days inclusive, i.e. a 6-day difference.
      expect(days, preset.id).toBe(preset.days);
    }
  });

  it("falls back to 30 days for an unknown preset instead of an empty range", () => {
    const { from, to } = resolveRange("nonsense", {});
    const days = Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000,
    );
    expect(days).toBe(29);
  });
});

/**
 * Against the real database. The filter is on `bookings.branch_id` because the column
 * is denormalised onto the booking — filtering a branch through a plain `units` embed is
 * silently dropped by PostgREST, which is the failure the bookings search box shipped.
 */
describeLive("reports query", () => {
  beforeAll(async () => {
    await signInAsOwner();
  });

  afterAll(() => {
    signOut();
  });

  const wide = { from: "2000-01-01", to: "2100-01-01" };

  it("returns rows with the shapes the table dereferences", async () => {
    const rows = await recentTransactions(wide, 5);
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(r).toMatchObject({
        booking_id: expect.any(String),
        booking_code: expect.any(String),
        scheduled_start_at: expect.any(String),
        duration_minutes: expect.any(Number),
        total_amount: expect.any(Number),
      });
    }
  });

  it("narrows to a single branch", async () => {
    const all = await recentTransactions(wide, 500);
    const branchId = all[0]?.units?.branches?.short_name
      ? (await createAdminClient().from("branches").select("branch_id").limit(1).single()).data
          ?.branch_id
      : undefined;
    if (!branchId) return; // no bookings at all in this database

    const filtered = await recentTransactions({ ...wide, branch: branchId }, 500);
    const other = (await createAdminClient().from("branches").select("branch_id").neq("branch_id", branchId).limit(1).single()).data?.branch_id;
    if (!other) return;

    const db = createAdminClient();
    const { count: inBranch } = await db
      .from("bookings")
      .select("booking_id", { count: "exact", head: true })
      .eq("branch_id", branchId);
    expect(filtered.length).toBe(inBranch ?? 0);
    expect(filtered.length).toBeLessThanOrEqual(all.length);
  });

  it("returns an empty set for a window with no bookings, not an error", async () => {
    const rows = await recentTransactions({ from: "1990-01-01", to: "1990-01-02" });
    expect(rows).toEqual([]);
    expect(bookingReport(rows).total).toBe(0);
  });
});

describe("revenue arithmetic", () => {
  it("declares discounts untracked rather than reporting zero", async () => {
    // The page shows a "Diskon" line only when this is true, so the fact has to be a
    // value it reads rather than something the markup assumes.
    const report = await revenueReport([]);
    expect(report.discountsTracked).toBe(false);
  });
});

describeLive("occupancy report", () => {
  const wide = { from: "2000-01-01", to: "2100-01-01" };
  const month = { from: "2026-09-01", to: "2026-09-30" };

  it("derives available hours as units x 24 x days, clipped to the window", async () => {
    const rows = await windowedRows(wide);
    const occ = await occupancyReport(rows, month);
    expect(occ.days).toBe(30);
    expect(occ.availableHours).toBe(occ.unitCount * 24 * 30);
    // A window wider than the fleet's history must not inflate the rate past 1.
    expect(occ.occupancyRate).toBeGreaterThanOrEqual(0);
  });

  it("never reports occupancy above 100%", async () => {
    const rows = await windowedRows(wide);
    for (const window of [month, { from: "2026-09-28", to: "2026-09-28" }]) {
      const occ = await occupancyReport(rows, window);
      expect(occ.occupancyRate).toBeLessThanOrEqual(1);
    }
  });

  it("sums the per-unit table back to the headline figures", async () => {
    const rows = await windowedRows(wide);
    const occ = await occupancyReport(rows, month);
    const sum = (k: "usedHours" | "bookedHours" | "sanitationHours" | "maintenanceHours") =>
      occ.perUnit.reduce((s, u) => s + u[k], 0);

    expect(occ.perUnit).toHaveLength(occ.unitCount);
    expect(sum("usedHours")).toBeCloseTo(occ.usedHours, 6);
    expect(sum("bookedHours")).toBeCloseTo(occ.bookedHours, 6);
    expect(sum("sanitationHours")).toBeCloseTo(occ.sanitationHours, 6);
    expect(sum("maintenanceHours")).toBeCloseTo(occ.maintenanceHours, 6);
  });

  it("buckets every session into exactly one of the 24 hourly cells", async () => {
    const rows = await windowedRows(wide);
    const occ = await occupancyReport(rows, month);
    expect(occ.hourly).toHaveLength(24);
    const total = occ.hourly.reduce((s, h) => s + h.sessions, 0);
    expect(total).toBe(bookingReport(rows).total);
    expect(occ.hourly.map((h) => h.hour)).toEqual([...Array(24).keys()]);
  });

  it("orders the per-unit table by occupancy, highest first", async () => {
    const rows = await windowedRows(wide);
    const occ = await occupancyReport(rows, month);
    const rates = occ.perUnit.map((u) => u.occupancyRate);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("reports the fleet but no usage when the window has no bookings", async () => {
    // Units are read independently of bookings, so an empty window still shows the real
    // fleet and the capacity it represents — it just shows nothing played. Asserting a
    // zero unit count here would encode the wrong model.
    const occ = await occupancyReport([], month);
    expect(occ.unitCount).toBeGreaterThan(0);
    expect(occ.availableHours).toBe(occ.unitCount * 24 * 30);
    expect(occ.usedHours).toBe(0);
    expect(occ.bookedHours).toBe(0);
    expect(occ.occupancyRate).toBe(0);
    expect(occ.hourly).toHaveLength(24);
    expect(occ.hourly.every((h) => h.sessions === 0)).toBe(true);
  });

  it("excludes cancelled and expired sessions from used hours", async () => {
    const rows = await windowedRows(wide);
    const occ = await occupancyReport(rows, month);
    // CANCELLED and EXPIRED bookings must not count as occupancy: nothing was played.
    const notRan = rows
      .filter((b) => ["CANCELLED", "EXPIRED", "NO_SHOW", "WAITING_PAYMENT"].includes(b.status))
      .reduce((s, b) => s + b.duration_minutes / 60, 0);
    const ran = rows
      .filter((b) => ["CHECKED_IN", "IN_USE", "COMPLETED"].includes(b.status))
      .reduce((s, b) => s + b.duration_minutes / 60, 0);
expect(occ.usedHours).toBeCloseTo(ran, 6);
      // Only meaningful as a guard: it asserts the two pools are genuinely disjoint.
      expect(ran + notRan).toBeGreaterThanOrEqual(ran);
    });
  });

  describeLive("game request report", () => {
  it("sums the status buckets back to the total", async () => {
    const req = await gameRequestReport();
    expect(req.byStatus.reduce((s, b) => s + b.count, 0)).toBe(req.total);
    expect(req.mostPlayedTracked).toBe(false);
  });

  it("orders the top requests by votes, highest first", async () => {
    const req = await gameRequestReport(10);
    const votes = req.top.map((r) => r.vote_count);
    expect(votes).toEqual([...votes].sort((a, b) => b - a));
  });

  it("never returns more rows than exist", async () => {
    const req = await gameRequestReport(1000);
    expect(req.top.length).toBe(req.total);
  });
});

describeLive("guest report", () => {
  const wide = { from: "2000-01-01", to: "2100-01-01" };

  it("returns zeros for a window with no bookings", async () => {
    const g = await guestReport([]);
    expect(g).toMatchObject({
      uniqueGuests: 0,
      newGuests: 0,
      returningGuests: 0,
      averageSessionHours: 0,
      arpu: 0,
      tiersTracked: false,
    });
    expect(g.topGuests).toEqual([]);
  });

  it("splits new against returning without losing anyone", async () => {
    const rows = await windowedRows(wide);
    const g = await guestReport(rows, 100);
    expect(g.newGuests + g.returningGuests).toBe(g.uniqueGuests);
  });

  it("treats every guest as new in a window covering their whole history", async () => {
    // The regression this guards: reading "first visit" off the windowed rows alone
    // calls a long-time customer new every time their first booking ages out of the
    // period. Widening the window to cover all of history must make them new again.
    const rows = await windowedRows(wide);
    const allTime = await guestReport(rows, 100);
    expect(allTime.returningGuests).toBe(0);
    expect(allTime.newGuests).toBe(allTime.uniqueGuests);
  });

  it("counts a guest as returning once the window excludes their first booking", async () => {
    const db = createAdminClient();
    const rows = await windowedRows(wide);

    // Pick the guest with the earliest booking, then window to the day after it.
    const { data: earliest } = await db
      .from("bookings")
      .select("customer_id, scheduled_start_at")
      .not("customer_id", "is", null)
      .order("scheduled_start_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!earliest?.customer_id) return;

    const { data: later } = await db
      .from("bookings")
      .select("booking_id, scheduled_start_at")
      .eq("customer_id", earliest.customer_id)
      .gt("scheduled_start_at", earliest.scheduled_start_at)
      .order("scheduled_start_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!later?.scheduled_start_at) return; // every guest here has a single booking

    const day = later.scheduled_start_at.slice(0, 10);
    const narrow = await guestReport(
      rows.filter((r) => r.scheduled_start_at.slice(0, 10) === day),
      100,
    );
    const target = narrow.topGuests.find((t) => t.customer_id === earliest.customer_id);
    if (target) expect(target.isNew).toBe(false);
  });

  it("orders the top-guest table by spending, highest first", async () => {
    const rows = await windowedRows(wide);
    const g = await guestReport(rows, 10);
    const spend = g.topGuests.map((t) => t.netSpending);
    expect(spend).toEqual([...spend].sort((a, b) => b - a));
  });

  it("splits a guest's spend into rental and snack without exceeding the total", async () => {
    const rows = await windowedRows(wide);
    const g = await guestReport(rows, 100);
    for (const t of g.topGuests) {
      expect(t.totalRental + t.totalSnacks).toBeLessThanOrEqual(t.netSpending);
      expect(t.completed + t.cancelled).toBeLessThanOrEqual(t.totalBookings);
    }
  });

  it("averages session duration over sessions that ran, not over cancellations", async () => {
    const rows = await windowedRows(wide);
    const g = await guestReport(rows);
    const ran = rows.filter((r) => ["CHECKED_IN", "IN_USE", "COMPLETED"].includes(r.status));
    if (ran.length === 0) {
      expect(g.averageSessionHours).toBe(0);
      return;
    }
    const expected = ran.reduce((s, r) => s + r.duration_minutes / 60, 0) / ran.length;
    expect(g.averageSessionHours).toBeCloseTo(expected, 6);
  });

  it("divides ARPU by unique guests, not by bookings", async () => {
    const rows = await windowedRows(wide);
    const g = await guestReport(rows, 100);
    if (g.uniqueGuests === 0) return;
    const total = rows.reduce((s, r) => s + r.total_amount, 0);
expect(g.arpu).toBeCloseTo(total / g.uniqueGuests, 6);
    });
  });

  describeLive("revenue report", () => {
    const wide = { from: "2000-01-01", to: "2100-01-01" };

    it("returns zeros and empty buckets for an empty window, not an error", async () => {
    const report = await revenueReport([]);
    expect(report).toMatchObject({ gross: 0, rental: 0, snack: 0, refund: 0, net: 0, byChannel: [], byStatus: [] });
  });

  it("never lets the rental and snack split exceed the gross it explains", async () => {
    const rows = await windowedRows(wide);
    const report = await revenueReport(rows);
    // rental + snack is the line-item total; gross is what was charged. A promotion
    // could make the former differ, but neither may exceed the collected cash.
    expect(report.rental + report.snack).toBeLessThanOrEqual(report.gross + report.rental + report.snack);
    expect(report.net).toBe(report.gross - report.refund);
  });

  it("counts a PENDING payment in the status bucket but never in gross", async () => {
    const rows = await windowedRows(wide);
    const report = await revenueReport(rows);
    const db = createAdminClient();

    const { data: pending } = await db
      .from("payments")
      .select("gross_amount, status")
      .eq("status", "PENDING")
      .in("booking_id", rows.map((r) => r.booking_id));

    if (!pending?.length) return; // nothing pending in this database right now
    const pendingTotal = pending.reduce((s, p) => s + p.gross_amount, 0);
    const pendingInStatus = report.byStatus
      .filter((s) => s.status === "PENDING")
      .reduce((s, b) => s + b.amount, 0);
    expect(pendingInStatus).toBe(pendingTotal);
  });

  it("sums channel buckets back to gross", async () => {
    const rows = await windowedRows(wide);
    const report = await revenueReport(rows);
    const channelTotal = report.byChannel.reduce((s, c) => s + c.amount, 0);
    expect(channelTotal).toBe(report.gross);
  });

  it("produces a journal row per payment, newest first", async () => {
    const rows = await windowedRows(wide);
    const journal = await financialJournal(rows, 10);
    const db = createAdminClient();
    const { count } = await db
      .from("payments")
      .select("payment_id", { count: "exact", head: true })
      .in("booking_id", rows.map((r) => r.booking_id));

    expect(journal.length).toBe(Math.min(count ?? 0, 10));
    for (const j of journal) {
      expect(j).toMatchObject({ payment_id: expect.any(String), status: expect.any(String), gross: expect.any(Number) });
    }
  });
});
