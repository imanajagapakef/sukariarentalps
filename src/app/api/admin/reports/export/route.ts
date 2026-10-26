import type { NextRequest } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/authz";
import { rowsForExport, type ExportRow, type ReportFilters, windowedRows } from "@/lib/reports-query";
import { handleRouteError } from "@/lib/api/response";
import { exportFilename } from "@/lib/csv";
import { xlsxResponse } from "@/lib/xlsx";
import { wibDateTime, wibDay } from "@/lib/wib";

const COLUMNS = [
  { header: "Kode Booking", width: 18, align: "left", value: (r: ExportRow) => r.booking_code },
  { header: "Sesi", width: 18, align: "left", value: (r: ExportRow) => wibDateTime(r.session_at) },
  { header: "Tanggal", width: 12, align: "left", value: (r: ExportRow) => wibDay(new Date(r.session_at)) },
  { header: "Tamu", width: 24, align: "left", value: (r: ExportRow) => r.guest ?? "" },
  { header: "Telepon", width: 18, align: "left", numFmt: "@", value: (r: ExportRow) => r.phone ?? "" },
  { header: "Cabang", width: 16, align: "left", value: (r: ExportRow) => r.branch },
  { header: "Unit", width: 18, align: "left", value: (r: ExportRow) => r.unit },
  { header: "Sumber", width: 12, align: "left", value: (r: ExportRow) => r.source },
  { header: "Durasi (menit)", width: 16, align: "right", numFmt: "#,##0", value: (r: ExportRow) => r.duration_minutes },
  { header: "Status", width: 18, align: "left", value: (r: ExportRow) => r.status },
  { header: "Tagihan", width: 16, align: "right", numFmt: "#,##0", value: (r: ExportRow) => r.invoice },
  { header: "Rental", width: 16, align: "right", numFmt: "#,##0", value: (r: ExportRow) => r.rental },
  { header: "Snack", width: 14, align: "right", numFmt: "#,##0", value: (r: ExportRow) => r.snack },
  { header: "Lunas", width: 10, align: "center", value: (r: ExportRow) => (r.collected ? "Ya" : "Tidak") },
  { header: "Kanal Bayar", width: 20, align: "left", value: (r: ExportRow) => r.channel },
] as const;

const PRESETS = ["today", "d7", "d30"] as const;

/** Maksimal rentang ekspor: satu tahun penuh (termasuk kabisat). */
const MAX_EXPORT_DAYS = 366;

const exportSchema = z
  .object({
    branch: z.string().max(100).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal harus berformat YYYY-MM-DD"),
    preset: z.enum(PRESETS).optional(),
  })
  .refine((data) => data.from <= data.to, {
    message: "Tanggal 'Dari' tidak boleh lebih dari tanggal 'Sampai'",
    path: ["to"],
  })
  .refine((data) => {
    const from = new Date(`${data.from}T00:00:00+07:00`);
    const to = new Date(`${data.to}T00:00:00+07:00`);
    const diffDays = (to.getTime() - from.getTime()) / 86_400_000;
    return diffDays <= MAX_EXPORT_DAYS;
  }, {
    message: `Rentang tanggal maksimal ${MAX_EXPORT_DAYS} hari`,
    path: ["to"],
  });

/**
 * Export laporan operasional. Hanya OWNER/ADMIN — STAFF tidak boleh, sama seperti
 * halaman reports. Filter dan rentang tanggal hidup di nama file, bukan di isi file.
 */
export async function GET(request: NextRequest) {
  try {
    await getStaffUser(["OWNER", "ADMIN"]);

    const params = request.nextUrl.searchParams;
    const param = (key: string) => params.get(key)?.trim() || undefined;
    const filters = exportSchema.parse({
      branch: param("branch"),
      from: param("from"),
      to: param("to"),
      preset: param("preset"),
    });

    const reportFilters: ReportFilters = {
      branch: filters.branch,
      from: filters.from,
      to: filters.to,
    };

    const rows = await rowsForExport(await windowedRows(reportFilters));

    // Rentang dan tanggal ekspor di nama file; baris # Laporan / # Rentang dikeluarkan
    // dari isi file supaya tidak merusak sort, filter, dan pivot di spreadsheet.
    const filename = exportFilename([
      "laporan",
      filters.from,
      filters.to,
      filters.branch,
      wibDay(),
    ], "xlsx");
    return xlsxResponse("Laporan", COLUMNS, rows, filename);
  } catch (error) {
    return handleRouteError(error);
  }
}
