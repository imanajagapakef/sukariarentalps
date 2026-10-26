import type { NextRequest } from "next/server";
import { z } from "zod";
import { AuthError, getStaffUser } from "@/lib/authz";
import { listBookings, type BookingRow } from "@/lib/bookings-query";
import { handleRouteError } from "@/lib/api/response";
import { exportFilename } from "@/lib/csv";
import { xlsxResponse } from "@/lib/xlsx";
import { wibDateTime, wibDay } from "@/lib/wib";

/** One entry per cell in toRow(), in the same order. Width must match COLUMNS below. */
const COLUMNS = [
  { header: "Kode", width: 16, align: "left", value: (b: BookingRow) => b.booking_code },
  { header: "Status", width: 18, align: "left", value: (b: BookingRow) => b.status },
  { header: "Customer", width: 24, align: "left", value: (b: BookingRow) => b.customers?.name ?? "" },
  { header: "Telepon", width: 18, align: "left", numFmt: "@", value: (b: BookingRow) => b.customers?.phone ?? "" },
  { header: "Unit", width: 18, align: "left", value: (b: BookingRow) => b.units?.name ?? "" },
  { header: "Mulai (WIB)", width: 18, align: "left", value: (b: BookingRow) => wibDateTime(b.scheduled_start_at) },
  { header: "Selesai (WIB)", width: 18, align: "left", value: (b: BookingRow) => wibDateTime(b.scheduled_end_at) },
  { header: "Durasi (menit)", width: 16, align: "right", numFmt: "#,##0", value: (b: BookingRow) => b.duration_minutes },
  { header: "Total (Rp)", width: 16, align: "right", numFmt: "#,##0", value: (b: BookingRow) => b.total_amount },
  { header: "Sumber", width: 14, align: "left", value: (b: BookingRow) => b.source ?? "" },
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

    // Filters and export date live in the filename, not in the file: rows inside the file
    // would break sorting, filtering and pivots, and an unescaped `q` could inject one.
    const filename = exportFilename(["bookings", filters.date ?? "semua", filters.status, wibDay()], "xlsx");
    return xlsxResponse("Bookings", COLUMNS, rows, filename);
  } catch (error) {
    return handleRouteError(error);
  }
}
