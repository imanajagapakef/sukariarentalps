import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, getStaffUser } from "@/lib/authz";
import { listBookings, type BookingRow } from "@/lib/bookings-query";
import { handleRouteError } from "@/lib/api/response";
import { csvFilename, csvNumber, csvPhone, csvResponse, csvText, toCsv } from "@/lib/csv";
import { wibDateTime, wibDay } from "@/lib/wib";

/** One entry per cell in toRow(), in the same order. toCsv throws if the two drift apart. */
const COLUMNS = [
  "Kode",
  "Status",
  "Customer",
  "Telepon",
  "Unit",
  "Mulai (WIB)",
  "Selesai (WIB)",
  "Durasi (menit)",
  "Total (Rp)",
  "Sumber",
] as const;

// ZodError is mapped to 422 by handleRouteError, so a hand-edited URL gets a clear
// refusal instead of reaching the query or the response headers.
const filtersSchema = z.object({
  status: z.string().max(40).optional(),
  q: z.string().max(100).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD")
    .optional(),
});

function toRow(b: BookingRow): string[] {
  return [
    csvText(b.booking_code),
    csvText(b.status),
    csvText(b.customers?.name),
    csvPhone(b.customers?.phone),
    csvText(b.units?.name),
    // WIB, "YYYY-MM-DD HH:mm": sortable in a spreadsheet and correct for a 00:30 start.
    csvText(wibDateTime(b.scheduled_start_at)),
    csvText(wibDateTime(b.scheduled_end_at)),
    csvNumber(b.duration_minutes),
    // Plain number, not the Rp formatter: the column has to stay sortable and summable.
    csvNumber(b.total_amount),
    csvText(b.source),
  ];
}

/**
 * Honours the same ?status= &q= &date= filters as the table it was clicked from.
 *
 * Paging deliberately does not travel: `listBookings` returns every matching row (up
 * to its own cap), because a CSV cut off at the table's page size would look like the
 * whole book and quietly be a page of it.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getStaffUser();
    // fail-closed tripwire: STAFF scoping rides on branch_id. A null branch on a STAFF
    // row (DB-impossible after migration 0034) would export every branch's bookings.
    if (profile.role === "STAFF" && !profile.branch_id) {
      throw new AuthError("Akun staff belum terikat cabang", 403);
    }

    const params = request.nextUrl.searchParams;
    const param = (key: string) => params.get(key)?.trim() || undefined;
    const filters = filtersSchema.parse({
      status: param("status"),
      q: param("q"),
      date: param("date"),
    });

    // A STAFF profile exports only its own branch; null (OWNER/ADMIN) = every branch.
    const rows = await listBookings({ ...filters, branchId: profile.branch_id });

    // Filters and export date live in the filename, not in the file: rows inside the CSV
    // would break sorting, filtering and pivots, and an unescaped `q` could inject one.
    const filename = csvFilename(["bookings", filters.date ?? "semua", filters.status, wibDay()]);
    return csvResponse(toCsv(COLUMNS, rows.map(toRow)), filename);
  } catch (error) {
    return handleRouteError(error);
  }
}
