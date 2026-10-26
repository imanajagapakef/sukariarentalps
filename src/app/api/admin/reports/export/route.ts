import type { NextRequest } from "next/server";
import { z } from "zod";
import { getStaffUser } from "@/lib/authz";
import { rowsForExport, type ExportRow, type ReportFilters, windowedRows } from "@/lib/reports-query";
import { handleRouteError } from "@/lib/api/response";
import { csvFilename, csvNumber, csvPhone, csvResponse, csvText, toCsv } from "@/lib/csv";
import { wibDateTime, wibDay } from "@/lib/wib";

const COLUMNS = [
  "Kode Booking",
  "Sesi",
  "Tanggal",
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

function toRow(r: ExportRow): string[] {
  return [
    csvText(r.booking_code),
    csvText(wibDateTime(r.session_at)),
    csvText(wibDay(new Date(r.session_at))),
    csvText(r.guest),
    csvPhone(r.phone),
    csvText(r.branch),
    csvText(r.unit),
    csvText(r.source),
    csvNumber(r.duration_minutes),
    csvText(r.status),
    csvNumber(r.invoice),
    csvNumber(r.rental),
    csvNumber(r.snack),
    // Boolean jadi teks readable, bukan angka.
    csvText(r.collected ? "Ya" : "Tidak"),
    csvText(r.channel),
  ];
}

/**
 * Export laporan operasional. Hanya OWNER/ADMIN — STAFF tidak boleh, sama seperti
 * halaman reports. Filter dan rentang tanggal hidup di nama file, bukan di isi CSV.
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
    // dari isi CSV supaya tidak merusak sort, filter, dan pivot di spreadsheet.
    const filename = csvFilename([
      "laporan",
      filters.from,
      filters.to,
      filters.branch,
      wibDay(),
    ]);
    return csvResponse(toCsv(COLUMNS, rows.map(toRow)), filename);
  } catch (error) {
    return handleRouteError(error);
  }
}
