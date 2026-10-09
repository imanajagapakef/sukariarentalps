import { NextResponse, type NextRequest } from "next/server";
import { getStaffUser } from "@/lib/authz";
import { rowsForExport, windowedRows, type ReportFilters } from "@/lib/reports-query";
import { handleRouteError } from "@/lib/api/response";
import { fmtDateTime } from "@/lib/format";

const COLUMNS = [
  "Kode Booking",
  "Sesi",
  "Tamu",
  "Telepon",
  "Cabang",
  "Unit",
  "Sumber",
  "Durasi (menit)",
  "Status",
  "Tagihan",
  "Rental",
  "Snack",
  "Lunas",
  "Kanal Bayar",
];

/**
 * A leading =, +, - or @ makes Excel/LibreOffice treat the cell as a formula, and guest
 * names and phone numbers are attacker-controllable — a guest called `=cmd|...` would
 * otherwise run when staff opened the file. Prefix with an apostrophe; it is invisible in
 * the cell. Same guard as /api/admin/bookings/export.
 */
function cell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** OWNER/ADMIN only, matching the page — otherwise the CSV becomes a way around the gate. */
export async function GET(request: NextRequest) {
  try {
    await getStaffUser(["OWNER", "ADMIN"]);

    const p = request.nextUrl.searchParams;
    const filters: ReportFilters = {
      branch: p.get("branch") ?? undefined,
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
    };

    const rows = await rowsForExport(await windowedRows(filters));

    const csv = [
      COLUMNS.join(","),
      ...rows.map((r) =>
        [
          r.booking_code,
          fmtDateTime(r.session_at),
          r.guest,
          r.phone,
          r.branch,
          r.unit,
          r.source,
          r.duration_minutes,
          r.status,
          // Plain numbers, never the Rp formatter: the column has to stay summable.
          r.invoice,
          r.rental,
          r.snack,
          r.collected,
          r.channel,
        ]
          .map(cell)
          .join(","),
      ),
    ].join("\r\n");

    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="laporan-${filters.from ?? "awal"}-${filters.to ?? "akhir"}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}