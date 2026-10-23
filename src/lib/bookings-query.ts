import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export const STATUSES = [
  "WAITING_PAYMENT",
  "CONFIRMED",
  "IN_USE",
  "COMPLETED",
  "READY",
  "CANCELLED",
  "EXPIRED",
  "NO_SHOW",
] as const satisfies readonly BookingStatus[];

export const BOOKING_FILTERS =
  "booking_id, booking_code, status, scheduled_start_at, scheduled_end_at, payment_deadline_at, duration_minutes, total_amount, source, units(name), customers(name, phone)";

export type BookingRow = {
  booking_id: string;
  booking_code: string;
  status: BookingStatus;
  scheduled_start_at: string;
  scheduled_end_at: string;
  payment_deadline_at: string | null;
  duration_minutes: number;
  total_amount: number;
  source: string | null;
  units: { name: string } | null;
  customers: { name: string; phone: string } | null;
};

export type BookingFilters = { status?: string; q?: string; date?: string; branchId?: string | null };

/**
 * Rows per page in the admin table. The old page hard-capped at 60 rows with no way
 * past them, so a book with more bookings than that simply hid the older ones — no
 * error, no empty state, just a cashier who could not find a booking that existed.
 */
export const BOOKING_PAGE_SIZE = 25;

/**
 * The CSV export is the one reader that still wants every matching row, so it carries
 * its own cap. 5 000 bookings is already a spreadsheet nobody scrolls, and an
 * unbounded export is a request that can be made to time out; past this the file is a
 * prefix of the filtered set, so the filter form is the way to narrow it.
 */
const EXPORT_LIMIT = 5_000;

export type BookingPage = {
  rows: BookingRow[];
  /** Exact size of the filtered set, not `rows.length`. */
  total: number;
  /** 1-based page actually shown — clamped, so a stale ?page= never renders empty. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** 1-based inclusive range `rows` covers, for "Menampilkan 1–25 dari 340". */
  from: number;
  to: number;
};

/**
 * PostgREST reserved characters would break out of the `.or(...)` expression, and
 * `%` / `_` are ILIKE wildcards — a search box is a trust boundary here, so a
 * customer who typed `%` would otherwise match every row. `+` is kept because
 * phone numbers are searched with it.
 */
function searchTerm(q: string) {
  return q.trim().replace(/[%_,().:\\"]/g, "");
}

/**
 * How many bookings are sitting in the payment queue.
 *
 * Reads the partial index `bookings_deadline_idx (payment_deadline_at) where status
 * = 'WAITING_PAYMENT'`, so this stays cheap as the table grows.
 */
export async function countWaitingPayment(branchId?: string | null): Promise<number> {
  return countByStatus("WAITING_PAYMENT", branchId);
}

/**
 * Exact count for one status — over the whole book, or one branch when a STAFF
 * profile's `branchId` is passed (null = unbound, so no filter).
 *
 * The stat strip used to add up the rows that happened to be on screen, which made
 * every number on it a lie once the book outgrew one page. These are `count: "exact"`
 * head queries — no rows cross the wire, and each status has an index to lean on.
 */
export async function countByStatus(status: BookingStatus, branchId?: string | null): Promise<number> {
  const db = createAdminClient();
  let query = db
    .from("bookings")
    .select("booking_id", { count: "exact", head: true })
    .eq("status", status);
  if (branchId) query = query.eq("branch_id", branchId);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * Turn the search box into a list of customer ids.
 *
 * Two things were wrong with the old one-liner, and neither was visible until something
 * was actually typed into the box:
 *   1. PostgREST cannot filter on an embedded table, so `customers.name.ilike.*` inside
 *      `.or()` is a parse error, not a filter that matches nothing. Every search term
 *      returned HTTP 500.
 *   2. `.or()` takes its predicates unwrapped — supabase-js adds the parentheses, so
 *      passing them in produces `(((` and also fails.
 * Resolving the matching customers first turns the embedded columns into a
 * `customer_id.in.(...)` on the bookings table, which PostgREST does support.
 *
 * Split out from the builder because it is the only step that needs to be async.
 */
async function resolveSearch(q: string | undefined): Promise<{ term: string; ids: string[] }> {
  if (!q) return { term: "", ids: [] };
  const term = searchTerm(q);
  if (!term) return { term: "", ids: [] };

  const db = createAdminClient();
  const { data, error } = await db
    .from("customers")
    .select("customer_id")
    .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
    .limit(200);
  if (error) throw new Error(error.message);

  return { term, ids: (data ?? []).map((c) => c.customer_id) };
}

/**
 * One filter + order chain for the table, the page total and the CSV. They were
 * written separately at first, which is how "Export" and "what you are looking at"
 * drift apart: the export silently kept its own, older idea of the filters.
 *
 * The paging window (`.range()`) or the export cap is applied by the caller, so all
 * three read exactly the same rows.
 *
 * Synchronous on purpose, and never await what it returns. A `PostgrestFilterBuilder`
 * is thenable: awaiting one fires the request and hands back a plain response object,
 * so an `await` here would silently run the *whole* filtered set — no pagination, no
 * cap — before the caller ever got to add one.
 *
 * `count: "exact"` is unconditional for the same reason the caller always ranges: the
 * options object selects the builder overload, and PostgREST computes the count inside
 * the same request, so it costs a rounding error.
 */
function filteredQuery(filters: BookingFilters, search: { term: string; ids: string[] }) {
  const { status, date, branchId } = filters;
  const db = createAdminClient();

  let query = db.from("bookings").select(BOOKING_FILTERS, { count: "exact" });

  // Nobody settled a booking automatically any more, so the payment queue became the
  // cashier's main job. While that filter is on, order by the deadline instead of the
  // session start: the row about to lose its slot belongs on top, and the default
  // (start time desc) buries it under sessions that are already booked.
  const isPaymentQueue = status === "WAITING_PAYMENT";
  query = isPaymentQueue
    ? query.order("payment_deadline_at", { ascending: true, nullsFirst: false })
    : query.order("scheduled_start_at", { ascending: false });

  // Second sort key on purpose. Without it, two bookings that share a start time (or a
  // deadline, in the queue) can come back in a different order on every request, and an
  // unstable sort across pages shows the same booking twice and skips another.
  query = query.order("booking_id", { ascending: false });

  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status as BookingStatus);
  }
  if (date) {
    query = query
      .gte("scheduled_start_at", `${date}T00:00:00+07:00`)
      .lt("scheduled_start_at", `${date}T23:59:59+07:00`);
  }
  if (branchId) {
    query = query.eq("branch_id", branchId);
  }

  // Falling back to the code alone matters: an empty id list would make every
  // booking-code search return nothing, because "SR-XXXXXX" never appears in a
  // customer's name or phone.
  if (search.term) {
    query = search.ids.length
      ? query.or(`booking_code.ilike.%${search.term}%,customer_id.in.(${search.ids.join(",")})`)
      : query.ilike("booking_code", `%${search.term}%`);
  }

  return query;
}

/**
 * Every booking matching the filters — the CSV export's view, not the table's.
 * Capped at EXPORT_LIMIT; the table uses `listBookingsPage` instead.
 */
export async function listBookings(filters: BookingFilters): Promise<BookingRow[]> {
  const query = filteredQuery(filters, await resolveSearch(filters.q));
  const { data, error } = await query.limit(EXPORT_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingRow[];
}

/**
 * One page of the admin table, with the exact size of the filtered set behind it.
 *
 * Count first, then clamp, then read the window. That ordering is not a preference:
 * PostgREST answers a window past the end with HTTP 416 "Requested range not
 * satisfiable", so a stale `?page=9` used to throw here instead of landing on the last
 * page. Two round trips buy a page number that can never fail.
 */
export async function listBookingsPage(filters: BookingFilters, page: number): Promise<BookingPage> {
  const pageSize = BOOKING_PAGE_SIZE;
  const requested = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  const total = await countFiltered(filters);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const effective = Math.min(requested, pageCount);

  const query = filteredQuery(filters, await resolveSearch(filters.q));
  const { data, error } = await query.range((effective - 1) * pageSize, effective * pageSize - 1);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BookingRow[];

  return {
    rows,
    total,
    page: effective,
    pageCount,
    pageSize,
    from: rows.length ? (effective - 1) * pageSize + 1 : 0,
    to: (effective - 1) * pageSize + rows.length,
  };
}

/**
 * Exact size of the filtered set, through the same chain the rows use — one request,
 * one row of payload, no duplicated filter logic to drift.
 */
async function countFiltered(filters: BookingFilters): Promise<number> {
  const query = filteredQuery(filters, await resolveSearch(filters.q));
  const { count, error } = await query.limit(1);
  if (error) throw new Error(error.message);
  return count ?? 0;
}