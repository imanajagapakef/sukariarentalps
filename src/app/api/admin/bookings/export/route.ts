import { NextResponse, type NextRequest } from "next/server";
import { AuthError, getStaffUser } from "@/lib/authz";
import { listBookings, type BookingRow } from "@/lib/bookings-query";
import { handleRouteError } from "@/lib/api/response";
import { fmtDateTime } from "@/lib/format";

const COLUMNS = [
  "Kode",
  "Status",
  "Customer",
  "Telepon",
  "Unit",
  "Mulai",
  "Selesai",
  "Durasi (mnt)",
  "Total",
  "Sumber",
];

/**
 * A leading =, +, - or @ makes Excel/LibreOffice treat the cell as a formula, and
 * customer names and phone numbers are attacker-controllable — a booking named
 * `=cmd|...` would otherwise run when staff opened the export. Prefixing with an
 * apostrophe is the standard fix and is invisible in the cell.
 */
function cell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function row(b: BookingRow): string {
  return [
    b.booking_code,
    b.status,
    b.customers?.name,
    b.customers?.phone,
    b.units?.name,
    fmtDateTime(b.scheduled_start_at),
    fmtDateTime(b.scheduled_end_at),
    b.duration_minutes,
    // Plain number, not the Rp formatter: the column has to stay sortable and
    // summable in a spreadsheet.
    b.total_amount,
    b.source,
  ]
    .map(cell)
    .join(",");
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
    // fail-closed tripwire: STAFF scoping rides on branch_id — a null branch on
    // a STAFF row (DB-impossible after migration 0034) would export every
    // branch's bookings through the CSV.
    if (profile.role === "STAFF" && !profile.branch_id) {
      throw new AuthError("Akun staff belum terikat cabang", 403);
    }
    const params = request.nextUrl.searchParams;
    // A STAFF profile exports only its own branch; null (OWNER/ADMIN) = every branch.
    const rows = await listBookings({
      status: params.get("status") ?? undefined,
      q: params.get("q") ?? undefined,
      date: params.get("date") ?? undefined,
      branchId: profile.branch_id,
    });

    const csv = [COLUMNS.join(","), ...rows.map(row)].join("\r\n");
    const stamp = (params.get("date") || new Date().toISOString().slice(0, 10)) as string;

    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        // Without this a filename in a Content-Disposition is attacker-guessable
        // from the date alone, and the Excel cache would serve a stale export.
        "Content-Disposition": `attachment; filename="bookings-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
