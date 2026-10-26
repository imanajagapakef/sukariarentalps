import { describe, expect, it } from "vitest";
import { xlsxResponse } from "@/lib/xlsx";
import { exportFilename } from "@/lib/csv";
import { ValueType } from "exceljs";

describe("xlsxResponse", () => {
  const columns = [
    { header: "Kode", width: 16, align: "left", value: (r: { code: string }) => r.code },
    { header: "Telepon", width: 18, align: "left", numFmt: "@", value: (r: { code: string }) => r.code },
    { header: "Jumlah", width: 12, align: "right", numFmt: "#,##0", value: (r: { code: string }) => 150000 },
  ] as const;

  it("membuat buffer xlsx yang bisa dibaca balik", async () => {
    const rows = [{ code: "SR-001" }, { code: "SR-002" }];
    const res = await xlsxResponse("Test", columns, rows, exportFilename(["test", "2026-10-26"], "xlsx"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain("test_2026-10-26.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  });

  it("header beku dan autofilter aktif", async () => {
    const rows = [{ code: "SR-001" }];
    const res = await xlsxResponse("Test", columns, rows, "test.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    expect(ws.views[0]?.state).toBe("frozen");
    expect(ws.views[0]?.ySplit).toBe(1);
    expect(ws.autoFilter).toBeTruthy();
  });

  it("telepon sebagai string dengan nol depan utuh", async () => {
    const rows = [{ code: "08123456789" }];
    const res = await xlsxResponse("Test", columns, rows, "test.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    const cell = ws.getRow(2).getCell(2);
    expect(cell.type).toBe(ValueType.String);
    expect(cell.value).toBe("08123456789");
    expect(cell.numFmt).toBe("@");
  });

  it("angka tetap numeric dengan numFmt #,##0", async () => {
    const rows = [{ code: "SR-001" }];
    const res = await xlsxResponse("Test", columns, rows, "test.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    const cell = ws.getRow(2).getCell(3);
    expect(cell.type).toBe(ValueType.Number);
    expect(cell.value).toBe(150000);
    expect(cell.numFmt).toBe("#,##0");
  });

  it("teks yang diawali formula tetap string, tidak dieksekusi", async () => {
    const hostileColumns = [
      { header: "Nama", width: 20, align: "left", value: (r: { name: string }) => r.name },
    ] as const;
    const rows = [{ name: "=cmd|'/c calc'!A1" }];
    const res = await xlsxResponse("Test", hostileColumns, rows, "test.xlsx");
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new (require("exceljs")).Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet(1);
    const cell = ws.getRow(2).getCell(1);
    expect(cell.type).toBe(ValueType.String);
    expect(cell.value).toBe("=cmd|'/c calc'!A1");
  });

  it("exportFilename menghasilkan nama aman untuk xlsx", () => {
    expect(exportFilename(["laporan", "2026-01-01", "2026-12-31", "BR-GANET", "2026-10-27"], "xlsx")).toBe(
      "laporan_2026-01-01_2026-12-31_br-ganet_2026-10-27.xlsx",
    );
    expect(exportFilename(['x"/../a b', "y\r\nSet-Cookie: a=1"], "xlsx")).toMatch(/^[a-z0-9_.-]+\.xlsx$/);
    expect(exportFilename([undefined, "///"], "xlsx")).toBe("export.xlsx");
  });
});
