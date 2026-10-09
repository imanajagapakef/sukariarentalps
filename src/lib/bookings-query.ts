import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export const STATUSES = [
  "WAITING_PAYMENT",
  "CONFIRMED",
  "IN_USE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "NO_SHOW",
] as const satisfies readonly BookingStatus[];

export const BOOKING_FILTERS =
  "booking_id, booking_code, status, scheduled_start_at, scheduled_end_at, duration_minutes, total_amount, source, units(name), customers(name, phone)";

export type BookingRow = {
  booking_id: string;
  booking_code: string;
  status: BookingStatus;
  scheduled_start_at: string;
  scheduled_end_at: string;
  duration_minutes: number;
  total_amount: number;
  source: string | null;
  units: { name: string } | null;
  customers: { name: string; phone: string } | null;
};

export type BookingFilters = { status?: string; q?: string; date?: string };

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
 * One builder for the table and the CSV export. They were written separately at
 * first, which is how "Export" and "what you are looking at" drift apart: the
 * export silently kept its own, older idea of the filters.
 */
export async function listBookings(filters: BookingFilters) {
  const { status, q, date } = filters;
  const db = createAdminClient();

  let query = db
    .from("bookings")
    .select(BOOKING_FILTERS)
    .order("scheduled_start_at", { ascending: false })
    .limit(60);

  if (status && (STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status as BookingStatus);
  }
  if (date) {
    query = query
      .gte("scheduled_start_at", `${date}T00:00:00+07:00`)
      .lt("scheduled_start_at", `${date}T23:59:59+07:00`);
  }

  if (q) {
    const term = searchTerm(q);
    // Two things were wrong with the old one-liner, and neither was visible until
    // something was actually typed into the box:
    //   1. PostgREST cannot filter on an embedded table, so `customers.name.ilike.*`
    //      inside `.or()` is a parse error, not a filter that matches nothing.
    //      Every search term returned HTTP 500.
    //   2. `.or()` takes its predicates unwrapped — supabase-js adds the parentheses,
    //      so passing them in produces `(((` and also fails.
    // Resolving the matching customers first turns the embedded columns into an
    // `customer_id.in.(...)` on the bookings table, which PostgREST does support.
    if (term) {
      const { data: matches, error: customerError } = await db
        .from("customers")
        .select("customer_id")
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(200);
      if (customerError) throw new Error(customerError.message);

      const ids = (matches ?? []).map((c) => c.customer_id);
      // Falling back to the code alone matters: returning [] when no customer
      // matched would make every booking-code search silently return nothing,
      // because "SR-XXXXXX" never appears in a customer's name or phone.
      query = ids.length
        ? query.or(`booking_code.ilike.%${term}%,customer_id.in.(${ids.join(",")})`)
        : query.ilike("booking_code", `%${term}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as BookingRow[];
}
