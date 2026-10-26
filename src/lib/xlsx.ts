/**
 * Pure XLSX helpers shared by every export route. No Next, no Supabase, no React, so a
 * node test can drive them directly (tests/xlsx.spec.ts).
 *
 * Every column is defined once: header, width, alignment, number format, and a value
 * extractor. Values are handed to ExcelJS as ready-typed cells (string or number), so
 * text stays text and numbers stay numbers — no apostrophe tricks or formula hacks.
 */

import ExcelJS from "exceljs";

export type XlsxColumn<T> = {
  header: string;
  width: number;
  value: (row: T) => string | number | null;
  numFmt?: string;
  align?: "left" | "right" | "center";
};

export async function xlsxResponse<T>(
  sheetName: string,
  columns: readonly XlsxColumn<T>[],
  rows: readonly T[],
  filename: string, // harus berasal dari exportFilename(parts, "xlsx")
): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = columns.map((c) => ({
    header: c.header,
    width: c.width,
    style: {
      numFmt: c.numFmt,
      alignment: {
        vertical: "middle",
        horizontal: c.align ?? "left",
        indent: c.align === "center" ? 0 : 1,
        wrapText: false,
      },
    },
  }));

  for (const r of rows) ws.addRow(columns.map((c) => c.value(r)));

  const header = ws.getRow(1);
  header.height = 24;
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  header.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Staff data with phone numbers: never cached by the browser or a proxy.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
