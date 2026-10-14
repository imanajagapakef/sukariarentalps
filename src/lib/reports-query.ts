import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

//booking_items di-fetch dari beberapa report dalam satu request; cache per-request
// supaya query-nya sekali saja (key = daftar booking id, diasumsikan stabil per window).
const itemsForBookings = cache(async (idsKey: string) => {
  const ids = idsKey ? idsKey.split(",") : [];
  if (ids.length === 0) return [] as { booking_id: string | null; item_type: string; subtotal: number }[];
  const db = createAdminClient();
  const { data } = await db.from("booking_items").select("booking_id, item_type, subtotal").in("booking_id", ids);
  return data ?? [];
});

function itemsKey(bookings: ReportBooking[]) {
  return bookings.map((b) => b.booking_id).sort().join(",");
}

// Payments for the window, fetched once per request and shared by revenueReport
// and financialJournal (was: two separate payments queries with different shapes).
const paymentsForBookings = cache(async (idsKey: string) => {
  const ids = idsKey ? idsKey.split(",") : [];
  if (ids.length === 0) {
    return [] as {
      payment_id: string;
      booking_id: string | null;
      method: string;
      status: string;
      gross_amount: number;
      paid_at: string | null;
      created_at: string;
    }[];
  }
  const db = createAdminClient();
  const { data } = await db
    .from("payments")
    .select("payment_id, booking_id, method, status, gross_amount, paid_at, created_at")
    .in("booking_id", ids)
    .order("created_at", { ascending: false });
  return data ?? [];
});

type BookingStatus = Database["public"]["Enums"]["booking_status"];

/**
 * Admin Reports & Analytics � Section 1 (Booking Report).
 *
 * Lives outside `catalog.ts` for the reason documented in units-query.ts: the catalog
 * reads through the cookie client (RLS, no service role) and cannot be called from a
 * node test, and this file is covered by tests/admin-harness.ts.
 *
 * Every number here is counted from rows that exist. The design also asks for a
 * "Diskon & Voucher" card and cashier-shift settlement; there is no discount ledger and
 * no shift table, so those are deliberately absent rather than faked.
 */

export type ReportFilters = {
  branch?: string;
  /** Inclusive ISO date, YYYY-MM-DD. */
  from?: string;
  /** Inclusive ISO date, YYYY-MM-DD. */
  to?: string;
};

/** Presets the filter bar offers. `today` is local to the branch (WIB). */
export const PRESETS = [
  { id: "today", label: "Hari Ini", days: 0 },
  { id: "d7", label: "7 Hari Terakhir", days: 6 },
  { id: "d30", label: "30 Hari Terakhir", days: 29 },
] as const;

export type PresetId = (typeof PRESETS)[number]["id"];

/** WIB is UTC+7 with no DST, so a fixed offset is correct and simpler than a tz lib. */
const WIB_OFFSET_HOURS = 7;

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Resolves the preset to a concrete [from, to] window in WIB.
 *
 * Returns null when an explicit range was given, which is the signal that the caller
 * supplied its own dates and the preset is only a starting point.
 */
export function resolveRange(preset: string | undefined, filters: ReportFilters) {
  if (filters.from && filters.to) return { from: filters.from, to: filters.to };

  const match = PRESETS.find((p) => p.id === preset);
  const days = match ? match.days : 29;
  const to = new Date(Date.now() + WIB_OFFSET_HOURS * 3600_000);
  const from = new Date(to.getTime() - days * 86400_000);
  return { from: isoDay(from), to: isoDay(to) };
}

/** Half-open UTC instants covering a WIB day, for `.gte()` / `.lt()`. */
function wibDayBounds(day: string) {
  return {
    gte: `${day}T00:00:00+07:00`,
    lt: `${day}T23:59:59.999999+07:00`,
  };
}

const BOOKING_FIELDS =
  "booking_id, booking_code, status, source, branch_id, unit_id, scheduled_start_at, scheduled_end_at, created_at, duration_minutes, total_amount, customers(name, phone), units(name, branches(short_name, name))";

export type ReportBooking = {
  booking_id: string;
  booking_code: string;
  status: BookingStatus;
  source: string;
  branch_id: string;
  unit_id: string | null;
  scheduled_start_at: string;
  scheduled_end_at: string;
  created_at: string;
  duration_minutes: number;
  total_amount: number;
  customers: { name: string; phone: string } | null;
  units: { name: string; branches: { short_name: string | null; name: string } | null } | null;
};

/**
 * All bookings in the window, branch-filtered.
 *
 * Filtered on `bookings.branch_id` � the column is denormalised onto the booking, so
 * this needs neither an `!inner` embed nor an `.or()`. Both of those are traps here:
 * a branch filter against a plain embed is silently dropped, and an embedded column
 * inside `.or()` is a parse error. That is the bookings-search bug.
 */
async function windowedBookings(filters: ReportFilters): Promise<ReportBooking[]> {
  const db = createAdminClient();
  const { from, to } = resolveRange(undefined, filters);
  const start = wibDayBounds(from);
  const end = wibDayBounds(to);

  let query = db
    .from("bookings")
    .select(BOOKING_FIELDS, { count: "exact" })
    .gte("scheduled_start_at", start.gte)
    .lt("scheduled_start_at", end.lt)
    .limit(2000);

  if (filters.branch) query = query.eq("branch_id", filters.branch);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as ReportBooking[];
}

const STATUS_GROUPS = [
  "CONFIRMED",
  "CHECKED_IN",
  "IN_USE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "NO_SHOW",
] as const satisfies readonly BookingStatus[];

export type BookingReport = {
  total: number;
  byStatus: Record<string, number>;
  bySource: { online: number; walkIn: number };
  /** Ascending by day. */
  daily: { day: string; total: number; online: number; walkIn: number }[];
  peakHour: { hour: number; count: number } | null;
  averagePerDay: number;
};

const WIB_LABEL = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  hour: "2-digit",
  hour12: false,
});

/** Hour of day in WIB, 0-23. */
function wibHour(iso: string) {
  return Number(WIB_LABEL.format(new Date(iso)));
}

/** Calendar day in WIB, YYYY-MM-DD. */
function wibDayKey(iso: string) {
  return new Date(new Date(iso).getTime() + WIB_OFFSET_HOURS * 3600_000).toISOString().slice(0, 10);
}

export function bookingReport(rows: ReportBooking[]): BookingReport {
  const byStatus: Record<string, number> = {};
  for (const s of STATUS_GROUPS) byStatus[s] = 0;
  // DRAFT and WAITING_PAYMENT are not in the design's ring but must still be counted in
  // the total, or "total" and the ring disagree.
  byStatus.WAITING_PAYMENT = 0;
  byStatus.DRAFT = 0;

  const days = new Map<string, { day: string; total: number; online: number; walkIn: number }>();
  const hours = new Array<number>(24).fill(0);
  let online = 0;
  let walkIn = 0;

  for (const b of rows) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    if (b.source === "WALK_IN") walkIn++;
    else online++;

    const key = wibDayKey(b.scheduled_start_at);
    const bucket = days.get(key) ?? { day: key, total: 0, online: 0, walkIn: 0 };
    bucket.total++;
    if (b.source === "WALK_IN") bucket.walkIn++;
    else bucket.online++;
    days.set(key, bucket);

    hours[wibHour(b.scheduled_start_at)]++;
  }

  const peak = hours.reduce((best, count, hour) => (count > best.count ? { hour, count } : best), {
    hour: -1,
    count: 0,
  });

  return {
    total: rows.length,
    byStatus,
    bySource: { online, walkIn },
    daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    peakHour: peak.count > 0 ? peak : null,
    averagePerDay: days.size === 0 ? 0 : rows.length / days.size,
  };
}

/** Most recent bookings in the window, newest session first. */
export async function recentTransactions(filters: ReportFilters, limit = 25) {
  const rows = await windowedBookings(filters);
  return sortBySessionDesc(rows).slice(0, limit);
}

/**
 * The whole window, unsliced, for the report sections.
 *
 * Every section derives from this one query. Loading each section's own data would let
 * Section 1 and Section 2 disagree about which bookings are in scope � the revenue total
 * would then stop matching the booking count beside it.
 */
export async function windowedRows(filters: ReportFilters) {
  return windowedBookings(filters);
}

function sortBySessionDesc(rows: ReportBooking[]) {
  return rows.slice().sort((a, b) => b.scheduled_start_at.localeCompare(a.scheduled_start_at));
}

// --- Section 2: Revenue & financial ------------------------------------------
//
// Money that was actually collected. A PENDING or FAILED payment is an invoice, not
// revenue: counting it would make the net figure a promise. `gross_amount` is the only
// money column on payments � there is no separate discount or refund amount.

/** Statuses whose money reached the till. */
const COLLECTED = new Set<string>(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);

export const CHANNEL_LABEL: Record<string, string> = {
  MIDTRANS_QRIS: "QRIS (Midtrans)",
  MIDTRANS_GOPAY: "GoPay",
  MIDTRANS_SHOPEEPAY: "ShopeePay",
  MIDTRANS_BANK_TRANSFER: "Transfer bank",
  MIDTRANS_CREDIT_CARD: "Kartu kredit",
  QRIS_MANUAL: "QRIS manual",
  TRANSFER_MANUAL: "Transfer manual",
  CASH: "Tunai kasir",
};

export type RevenueReport = {
  gross: number;
  rental: number;
  snack: number;
  refund: number;
  /** gross - refund. Discounts are not tracked, so this is not "after discount". */
  net: number;
  /** False because no discount ledger exists; the page says so rather than showing 0. */
  discountsTracked: false;
  byChannel: { key: string; label: string; amount: number; count: number }[];
  byStatus: { status: string; label: string; amount: number; count: number }[];
  collectedCount: number;
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PAID: "Paid / Settled",
  PENDING: "Menunggu pembayaran",
  FAILED: "Gagal / Kedaluwarsa",
  EXPIRED: "Kedaluwarsa",
  REFUNDED: "Direfund",
  PARTIALLY_REFUNDED: "Refund sebagian",
};

export async function revenueReport(bookings: ReportBooking[]): Promise<RevenueReport> {
  if (bookings.length === 0) {
    return {
      gross: 0, rental: 0, snack: 0, refund: 0, net: 0, discountsTracked: false,
      byChannel: [], byStatus: [], collectedCount: 0,
    };
  }

  const ids = bookings.map((b) => b.booking_id);

  const [payments, items] = await Promise.all([
    paymentsForBookings(ids.slice().sort().join(",")),
    itemsForBookings(itemsKey(bookings)),
  ]);

  // A booking can be paid more than once (an extension creates its own payment), so the
  // status buckets are per payment, not per booking.
  const collected = payments.filter((p) => COLLECTED.has(p.status));
  const gross = collected.reduce((sum, p) => sum + p.gross_amount, 0);
  const refund = collected
    .filter((p) => p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED")
    .reduce((sum, p) => sum + p.gross_amount, 0);

  // Line-item split, but only for bookings whose money was collected � otherwise the
  // rental and snack shares would not add up to the gross beside them.
  const paidBookingIds = new Set(collected.map((p) => p.booking_id).filter(Boolean));
  let rental = 0;
  let snack = 0;
  for (const it of items) {
    if (!it.booking_id || !paidBookingIds.has(it.booking_id)) continue;
    if (it.item_type === "RENTAL") rental += it.subtotal;
    else if (it.item_type === "SNACK") snack += it.subtotal;
  }

  const channels = new Map<string, { amount: number; count: number }>();
  for (const p of collected) {
    const key = p.method ?? "UNKNOWN";
    const bucket = channels.get(key) ?? { amount: 0, count: 0 };
    bucket.amount += p.gross_amount;
    bucket.count++;
    channels.set(key, bucket);
  }

  const statuses = new Map<string, { amount: number; count: number }>();
  for (const p of payments) {
    const bucket = statuses.get(p.status) ?? { amount: 0, count: 0 };
    bucket.amount += p.gross_amount;
    bucket.count++;
    statuses.set(p.status, bucket);
  }

  return {
    gross,
    rental,
    snack,
    refund,
    net: gross - refund,
    discountsTracked: false,
    collectedCount: collected.length,
    byChannel: [...channels]
      .map(([key, v]) => ({ key, label: CHANNEL_LABEL[key] ?? key, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byStatus: [...statuses]
      .map(([status, v]) => ({ status, label: PAYMENT_STATUS_LABEL[status] ?? status, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// --- Section 3: Unit occupancy -------------------------------------------------
//
// "Available hours" is units x 24 x days in the window, which is the design's own
// definition ("Kapasitas 24j x 28"). Everything else is measured against it.

/** Statuses where the session actually ran, so the unit was genuinely occupied. */
const RAN = new Set<string>(["CHECKED_IN", "IN_USE", "COMPLETED"]);
/** Statuses that occupy the unit without the guest playing. */
const OUT_OF_SERVICE = new Set<string>(["MAINTENANCE", "OFFLINE"]);

export type OccupancyReport = {
  unitCount: number;
  byBranch: { branch_id: string; label: string; count: number }[];
  days: number;
  availableHours: number;
  usedHours: number;
  bookedHours: number;
  sanitationHours: number;
  maintenanceHours: number;
  /** usedHours / availableHours, as the design defines it. */
  occupancyRate: number;
  hourly: { hour: number; sessions: number; bookedHours: number }[];
  perUnit: {
    unit_id: string;
    name: string;
    branch: string;
    availableHours: number;
    usedHours: number;
    bookedHours: number;
    sanitationHours: number;
    maintenanceHours: number;
    occupancyRate: number;
  }[];
};

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400_000) + 1);
}

function overlapHours(fromMs: number, toMs: number, rangeFrom: number, rangeTo: number) {
  return Math.max(0, (Math.min(toMs, rangeTo) - Math.max(fromMs, rangeFrom)) / 3600_000);
}

export async function occupancyReport(
  bookings: ReportBooking[],
  filters: ReportFilters,
): Promise<OccupancyReport> {
  const { from, to } = resolveRange(undefined, filters);
  const days = daysBetween(from, to);
  const rangeFrom = Date.parse(`${from}T00:00:00+07:00`);
  const rangeTo = Date.parse(`${to}T23:59:59+07:00`);

  const db = createAdminClient();
  let unitQuery = db
    .from("units")
    .select("unit_id, name, branch_id, status, branches(short_name, name)")
    .order("unit_id");
  if (filters.branch) unitQuery = unitQuery.eq("branch_id", filters.branch);
  const [{ data: units }, { data: history }] = await Promise.all([
    unitQuery,
    // ponytail: 90-day lookback bounds the fetch; transitions that matter for the
    // window (IN_ORDER / maintenance) are almost always recent. A unit stuck in
    // maintenance >90 days before the window start would be undercounted.
    db
      .from("unit_status_history")
      .select("unit_id, to_status, created_at")
      .gte("created_at", new Date(rangeFrom - 90 * 86400000).toISOString())
      .order("created_at"),
  ]);

  const unitRows = units ?? [];
  const perUnitAvailable = days * 24;

  const used = new Map<string, number>();
  const booked = new Map<string, number>();
  const hourly: OccupancyReport["hourly"] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sessions: 0,
    bookedHours: 0,
  }));

  // unit_id rides along on the booking, so no per-booking lookup is needed.
  bookings.forEach((b) => {
    const hours = b.duration_minutes / 60;
    if (RAN.has(b.status)) {
      if (b.unit_id) used.set(b.unit_id, (used.get(b.unit_id) ?? 0) + hours);
    } else if (b.status === "CONFIRMED") {
      if (b.unit_id) booked.set(b.unit_id, (booked.get(b.unit_id) ?? 0) + hours);
    }
    const h = wibHour(b.scheduled_start_at);
    hourly[h].sessions++;
    if (RAN.has(b.status) || b.status === "CONFIRMED") hourly[h].bookedHours += hours;
  });

  // unit_status_history has no ended_at, so each row's status runs until the *next* row
  // for that unit. The final row runs to the end of the window. Intervals are clipped to
  // the window, otherwise a transition last month would add hours to this report.
  const sanitation = new Map<string, number>();
  const maintenance = new Map<string, number>();
  const byUnitHistory = new Map<string, { to: string; at: number }[]>();
  for (const h of history ?? []) {
    const list = byUnitHistory.get(h.unit_id) ?? [];
    list.push({ to: h.to_status, at: Date.parse(h.created_at) });
    byUnitHistory.set(h.unit_id, list);
  }

  for (const [unitId, rowsForUnit] of byUnitHistory) {
    rowsForUnit.forEach((row, i) => {
      const start = row.at;
      const end = i + 1 < rowsForUnit.length ? rowsForUnit[i + 1].at : rangeTo;
      const hours = overlapHours(start, end, rangeFrom, rangeTo);
      if (hours <= 0) return;
      if (row.to === "IN_ORDER") sanitation.set(unitId, (sanitation.get(unitId) ?? 0) + hours);
      else if (OUT_OF_SERVICE.has(row.to)) {
        maintenance.set(unitId, (maintenance.get(unitId) ?? 0) + hours);
      }
    });
  }

  const perUnit = unitRows.map((u) => {
    const branchLabel = u.branches?.short_name ?? u.branches?.name ?? u.branch_id;
    const usedHours = used.get(u.unit_id) ?? 0;
    return {
      unit_id: u.unit_id,
      name: u.name,
      branch: branchLabel,
      availableHours: perUnitAvailable,
      usedHours,
      bookedHours: booked.get(u.unit_id) ?? 0,
      sanitationHours: sanitation.get(u.unit_id) ?? 0,
      maintenanceHours: maintenance.get(u.unit_id) ?? 0,
      occupancyRate: perUnitAvailable === 0 ? 0 : usedHours / perUnitAvailable,
    };
  });

  const byBranchMap = new Map<string, { branch_id: string; label: string; count: number }>();
  for (const u of unitRows) {
    const label = u.branches?.short_name ?? u.branches?.name ?? u.branch_id;
    const b = byBranchMap.get(u.branch_id) ?? { branch_id: u.branch_id, label, count: 0 };
    b.count++;
    byBranchMap.set(u.branch_id, b);
  }

  const availableHours = perUnitAvailable * unitRows.length;
  const usedHours = perUnit.reduce((s, u) => s + u.usedHours, 0);

  return {
    unitCount: unitRows.length,
    byBranch: [...byBranchMap.values()].sort((a, b) => b.count - a.count),
    days,
    availableHours,
    usedHours,
    bookedHours: perUnit.reduce((s, u) => s + u.bookedHours, 0),
    sanitationHours: perUnit.reduce((s, u) => s + u.sanitationHours, 0),
    maintenanceHours: perUnit.reduce((s, u) => s + u.maintenanceHours, 0),
    occupancyRate: availableHours === 0 ? 0 : usedHours / availableHours,
    hourly,
    perUnit: perUnit.sort((a, b) => b.occupancyRate - a.occupancyRate),
  };
}

// --- Section 4: game-request pipeline -----------------------------------------
//
// Not window-filtered: a request is a standing wish, not a session, and dropping
// requests raised before the window would make the pipeline look emptier than it is.

export type GameRequestReport = {
  total: number;
  byStatus: { status: string; label: string; count: number; votes: number }[];
  top: { request_id: string; game_name: string; status: string; vote_count: number; created_at: string }[];
  /** False: the app never records which game a booking played. */
  mostPlayedTracked: false;
};

export const REQUEST_LABEL: Record<string, string> = {
  REQUESTED: "Diajukan",
  UNDER_REVIEW: "Ditinjau",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ADDED: "Sudah ditambahkan",
};

export async function gameRequestReport(limit = 8): Promise<GameRequestReport> {
  const db = createAdminClient();
  const { data } = await db
    .from("game_requests")
    .select("request_id, game_name, status, vote_count, created_at")
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  const counts = new Map<string, { count: number; votes: number }>();
  for (const r of rows) {
    const bucket = counts.get(r.status) ?? { count: 0, votes: 0 };
    bucket.count++;
    bucket.votes += r.vote_count ?? 0;
    counts.set(r.status, bucket);
  }

  return {
    total: rows.length,
    mostPlayedTracked: false,
    byStatus: [...counts]
      .map(([status, v]) => ({ status, label: REQUEST_LABEL[status] ?? status, ...v }))
      .sort((a, b) => b.count - a.count),
    top: rows.slice(0, limit).map((r) => ({
      request_id: r.request_id,
      game_name: r.game_name,
      status: r.status,
      vote_count: r.vote_count ?? 0,
      created_at: r.created_at,
    })),
  };
}

/**
 * One flat row per booking in the window, for CSV export.
 *
 * Lives here rather than in the route so the export, the transactions table and the
 * journal cannot disagree about what a booking cost or whether it was paid � the same
 * reason every report section reads one windowed query.
 */
export type ExportRow = {
  booking_code: string;
  session_at: string;
  guest: string | null;
  phone: string | null;
  branch: string;
  unit: string;
  source: string;
  duration_minutes: number;
  status: BookingStatus;
  invoice: number;
  rental: number;
  snack: number;
  collected: boolean;
  channel: string;
};

export async function rowsForExport(bookings: ReportBooking[]): Promise<ExportRow[]> {
  if (bookings.length === 0) return [];
  const journal = await financialJournal(bookings, Number.MAX_SAFE_INTEGER);

  const paymentByBooking = new Map<string, { collected: boolean; channel: string }>();
  for (const j of journal) {
    const id = j.booking?.booking_id;
    if (!id) continue;
    // A booking can have several payments; it counts as collected if any one settled.
    const seen = paymentByBooking.get(id);
    if (!seen || j.collected) {
      paymentByBooking.set(id, { collected: seen?.collected || j.collected, channel: j.method ?? seen?.channel ?? "" });
    }
  }

  const split = new Map<string, { rental: number; snack: number }>();
  for (const j of journal) {
    const id = j.booking?.booking_id;
    if (id) split.set(id, { rental: j.rental, snack: j.snack });
  }

  return bookings.map((b) => {
    const pay = paymentByBooking.get(b.booking_id);
    const s = split.get(b.booking_id);
    return {
      booking_code: b.booking_code,
      session_at: b.scheduled_start_at,
      guest: b.customers?.name ?? null,
      phone: b.customers?.phone ?? null,
      branch: b.units?.branches?.short_name ?? b.units?.branches?.name ?? b.branch_id,
      unit: b.units?.name ?? "",
      source: b.source,
      duration_minutes: b.duration_minutes,
      status: b.status,
      invoice: b.total_amount,
      rental: s?.rental ?? 0,
      snack: s?.snack ?? 0,
      collected: pay?.collected ?? false,
      channel: pay?.channel ?? "",
    };
  });
}

export type JournalRow = {
  payment_id: string;
  paid_at: string | null;
  status: string;
  method: string | null;
  gross: number;
  booking: ReportBooking | null;
  rental: number;
  snack: number;
  refunded: boolean;
  /** True once the money actually reached the till; drives the row's dimming. */
  collected: boolean;
};

// --- Section 5: Guests and retention ------------------------------------------
//
// "New" means the customer's *first ever* booking falls in this window, which needs
// bookings from before the window too. Reading it off the windowed rows alone would call
// every guest new every time their first booking aged out of the period.

export type TopGuest = {
  customer_id: string;
  name: string;
  phone: string | null;
  favouriteBranch: string;
  totalBookings: number;
  completed: number;
  cancelled: number;
  totalRental: number;
  totalSnacks: number;
  /** Invoiced value, not collected cash � see the ARPU note on the page. */
  netSpending: number;
  lastVisit: string | null;
  isNew: boolean;
};

export type GuestReport = {
  uniqueGuests: number;
  newGuests: number;
  returningGuests: number;
  /** Hours, over sessions that actually ran. */
  averageSessionHours: number;
  /** Average invoiced value per unique guest in the window. */
  arpu: number;
  /** False: there is no membership table, so the design's tiers cannot be shown. */
  tiersTracked: false;
  topGuests: TopGuest[];
};

const NOT_KEPT = new Set<string>(["CANCELLED", "NO_SHOW"]);

export async function guestReport(bookings: ReportBooking[], limit = 10): Promise<GuestReport> {
  const empty: GuestReport = {
    uniqueGuests: 0,
    newGuests: 0,
    returningGuests: 0,
    averageSessionHours: 0,
    arpu: 0,
    tiersTracked: false,
    topGuests: [],
  };
  if (bookings.length === 0) return empty;

  const db = createAdminClient();

  // ReportBooking carries the joined name/phone but not customer_id, so read the ids off
  // the bookings table for exactly this window � one query, not one per booking.
  const { data: windowRows } = await db
    .from("bookings")
    .select("booking_id, customer_id, branch_id, status, duration_minutes, total_amount, scheduled_start_at")
    .in("booking_id", bookings.map((b) => b.booking_id));

  type GuestRow = NonNullable<typeof windowRows>[number];

  const byCustomer = new Map<string, GuestRow[]>();
  const ids = new Set<string>();
  for (const r of windowRows ?? []) {
    if (!r.customer_id) continue;
    ids.add(r.customer_id);
    const list = byCustomer.get(r.customer_id) ?? [];
    list.push(r);
    byCustomer.set(r.customer_id, list);
  }
  if (ids.size === 0) return empty;

  const [{ data: guests }, { data: allTime }, items] = await Promise.all([
    db.from("customers").select("customer_id, name, phone").in("customer_id", [...ids]),
    // Not window-filtered: this is what decides whether a guest is new.
    db.from("bookings").select("customer_id, status, scheduled_start_at, branch_id").in("customer_id", [...ids]),
    itemsForBookings(itemsKey(bookings)),
  ]);

  const splitByBooking = new Map<string, { rental: number; snack: number }>();
  for (const it of items) {
    if (!it.booking_id) continue;
    const b = splitByBooking.get(it.booking_id) ?? { rental: 0, snack: 0 };
    if (it.item_type === "RENTAL") b.rental += it.subtotal;
    else if (it.item_type === "SNACK") b.snack += it.subtotal;
    splitByBooking.set(it.booking_id, b);
  }

  const branchLabel = new Map<string, string>();
  for (const b of bookings) {
    if (b.branch_id && !branchLabel.has(b.branch_id)) {
      branchLabel.set(b.branch_id, b.units?.branches?.short_name ?? b.units?.branches?.name ?? b.branch_id);
    }
  }

  const firstEver = new Map<string, string>();
  const branchTally = new Map<string, Map<string, number>>();
  for (const b of allTime ?? []) {
    if (!b.customer_id) continue;
    const seen = firstEver.get(b.customer_id);
    if (!seen || b.scheduled_start_at < seen) firstEver.set(b.customer_id, b.scheduled_start_at);
    if (NOT_KEPT.has(b.status)) continue;
    const tally = branchTally.get(b.customer_id) ?? new Map<string, number>();
    tally.set(b.branch_id, (tally.get(b.branch_id) ?? 0) + 1);
    branchTally.set(b.customer_id, tally);
  }

  const windowStartIso = bookings
    .map((b) => b.scheduled_start_at)
    .reduce((min, s) => (s < min ? s : min));

  const guestName = new Map((guests ?? []).map((g) => [g.customer_id, g]));

  const topGuests: TopGuest[] = [];
  let newGuests = 0;

  for (const [customerId, rowsForGuest] of byCustomer) {
    const first = firstEver.get(customerId);
    const isNew = first !== undefined && first >= windowStartIso;
    if (isNew) newGuests++;

    let completed = 0;
    let cancelled = 0;
    let rental = 0;
    let snacks = 0;
    let net = 0;
    let lastVisit: string | null = null;

    for (const r of rowsForGuest) {
      if (r.status === "COMPLETED" || r.status === "IN_USE" || r.status === "CHECKED_IN") completed++;
      if (NOT_KEPT.has(r.status)) cancelled++;
      const s = splitByBooking.get(r.booking_id);
      rental += s?.rental ?? 0;
      snacks += s?.snack ?? 0;
      net += r.total_amount;
      if (!lastVisit || r.scheduled_start_at > lastVisit) lastVisit = r.scheduled_start_at;
    }

    const tally = branchTally.get(customerId);
    let favourite = "�";
    let best = -1;
    for (const [bid, n] of tally ?? []) {
      if (n > best) {
        best = n;
        favourite = branchLabel.get(bid) ?? bid;
      }
    }

    topGuests.push({
      customer_id: customerId,
      name: guestName.get(customerId)?.name ?? "�",
      phone: guestName.get(customerId)?.phone ?? null,
      favouriteBranch: favourite,
      totalBookings: rowsForGuest.length,
      completed,
      cancelled,
      totalRental: rental,
      totalSnacks: snacks,
      netSpending: net,
      lastVisit,
      isNew,
    });
  }

  const ranSessions = bookings.filter((b) => RAN.has(b.status));
  const totalHours = ranSessions.reduce((s, b) => s + b.duration_minutes / 60, 0);

  return {
    uniqueGuests: byCustomer.size,
    newGuests,
    returningGuests: byCustomer.size - newGuests,
    averageSessionHours: ranSessions.length === 0 ? 0 : totalHours / ranSessions.length,
    arpu:
      byCustomer.size === 0
        ? 0
        : bookings.reduce((s, b) => s + b.total_amount, 0) / byCustomer.size,
    tiersTracked: false,
    topGuests: topGuests.sort((a, b) => b.netSpending - a.netSpending).slice(0, limit),
  };
}

/** The financial journal: one row per payment, joined to its booking. */
export async function financialJournal(bookings: ReportBooking[], limit = 25): Promise<JournalRow[]> {
  if (bookings.length === 0) return [];
  const byId = new Map(bookings.map((b) => [b.booking_id, b]));

  const [payments, items] = await Promise.all([
    paymentsForBookings(bookings.map((b) => b.booking_id).sort().join(",")),
    itemsForBookings(itemsKey(bookings)),
  ]);

  const split = new Map<string, { rental: number; snack: number }>();
  for (const it of items) {
    if (!it.booking_id) continue;
    const bucket = split.get(it.booking_id) ?? { rental: 0, snack: 0 };
    if (it.item_type === "RENTAL") bucket.rental += it.subtotal;
    else if (it.item_type === "SNACK") bucket.snack += it.subtotal;
    split.set(it.booking_id, bucket);
  }

  return payments.slice(0, limit).map((p) => {
    const s = split.get(p.booking_id ?? "") ?? { rental: 0, snack: 0 };
    return {
      payment_id: p.payment_id,
      paid_at: p.paid_at,
      status: p.status,
      method: p.method,
      gross: p.gross_amount,
      booking: p.booking_id ? byId.get(p.booking_id) ?? null : null,
      rental: s.rental,
      snack: s.snack,
      refunded: p.status === "REFUNDED" || p.status === "PARTIALLY_REFUNDED",
      collected: COLLECTED.has(p.status),
    };
  });
}


