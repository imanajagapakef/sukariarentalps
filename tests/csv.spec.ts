import { describe, expect, it } from "vitest";
import { CSV_BOM, csvFilename, csvNumber, csvPhone, csvText, toCsv } from "@/lib/csv";
import { wibDateTime, wibDay } from "@/lib/wib";

describe("csvText", () => {
  it("leaves plain text alone and blanks null/undefined", () => {
    expect(csvText("Andi")).toBe("Andi");
    expect(csvText(null)).toBe("");
    expect(csvText(undefined)).toBe("");
  });

  it("quotes commas, quotes and newlines", () => {
    expect(csvText("a,b")).toBe('"a,b"');
    expect(csvText('say "hi"')).toBe('"say ""hi"""');
    expect(csvText("a\nb")).toBe('"a\nb"');
  });

  it.each(["=SUM(A1)", "+1", "-1", "@x", "\tx", "\rx"])("guards a leading formula character: %j", (v) => {
    expect(csvText(v).replace(/^"|"$/g, "")).toBe(`'${v}`);
  });

  it("guards first, then quotes", () => {
    expect(csvText("=1,2")).toBe(`"'=1,2"`);
  });
});

describe("csvNumber", () => {
  it("keeps negatives numeric instead of guarding them", () => {
    expect(csvNumber(-5000)).toBe("-5000");
    expect(csvNumber(75000)).toBe("75000");
    expect(csvNumber("75000")).toBe("75000");
  });

  it("is empty for missing or non-finite values", () => {
    expect(csvNumber(null)).toBe("");
    expect(csvNumber(undefined)).toBe("");
    expect(csvNumber("")).toBe("");
    expect(csvNumber(Number.NaN)).toBe("");
    expect(csvNumber("abc")).toBe("");
  });
});

describe("csvPhone", () => {
  it("forces text so Excel keeps the leading zero and the plus", () => {
    expect(csvPhone("08123456789")).toBe('"=""08123456789"""');
    expect(csvPhone("+62 812-3456-789")).toBe('"=""+62 812-3456-789"""');
  });

  it("falls back to the guarded text cell for anything that is not a phone", () => {
    expect(csvPhone("=cmd|'/c calc'!A1")).toBe("'=cmd|'/c calc'!A1");
    expect(csvPhone('08"1')).toBe('"08""1"');
  });

  it("is empty when missing", () => {
    expect(csvPhone(null)).toBe("");
    expect(csvPhone("  ")).toBe("");
  });
});

describe("toCsv", () => {
  it("writes BOM, sep hint, header and CRLF rows", () => {
    const out = toCsv(["A", "B"], [["1", "2"]]);
    expect(out.startsWith(`${CSV_BOM}sep=,\r\nA,B\r\n1,2`)).toBe(true);
    expect(out.endsWith("\r\n")).toBe(true);
  });

  it("can drop the Excel hint", () => {
    expect(toCsv(["A"], [["1"]], { excelHint: false })).toBe(`${CSV_BOM}A\r\n1\r\n`);
  });

  it("refuses a row whose width does not match the header", () => {
    expect(() => toCsv(["A", "B"], [["1"]])).toThrow(/baris 1 punya 1 kolom/);
  });
});

describe("csvFilename", () => {
  it("joins clean parts and drops empty ones", () => {
    expect(csvFilename(["bookings", "2026-10-26", undefined, "CONFIRMED"])).toBe(
      "bookings_2026-10-26_confirmed.csv",
    );
  });

  it("cannot carry quotes, slashes or line breaks into a header", () => {
    const name = csvFilename(['x"/../a b', "y\r\nSet-Cookie: a=1"]);
    expect(name).toMatch(/^[a-z0-9_.-]+$/);
  });

  it("falls back when nothing is left", () => {
    expect(csvFilename([undefined, "///"])).toBe("export.csv");
  });
});

describe("reports export column width", () => {
  // Judul asli dari reports/export — 15 kolom, bukan 22. Tes ini menjaga agar
  // setiap baris nilai selalu sama lebar dengan header, mencegah bergesernya kolom.
  const REPORT_COLUMNS = [
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

  it("terima baris yang lebarnya sama dengan header", () => {
    const goodRow = Array(REPORT_COLUMNS.length).fill("x");
    expect(() => toCsv(REPORT_COLUMNS, [goodRow])).not.toThrow();
  });

  it("tolak baris yang lebih pendek dari header", () => {
    const shortRow = Array(REPORT_COLUMNS.length - 1).fill("x");
    expect(() => toCsv(REPORT_COLUMNS, [shortRow])).toThrow(/kolom/);
  });

  it("tolak baris yang lebih panjang dari header", () => {
    const longRow = Array(REPORT_COLUMNS.length + 1).fill("x");
    expect(() => toCsv(REPORT_COLUMNS, [longRow])).toThrow(/kolom/);
  });
});

describe("wib", () => {
  it("puts a 00:30 WIB start on the WIB date, not the UTC one", () => {
    expect(wibDateTime("2026-10-26T17:30:00Z")).toBe("2026-10-27 00:30");
    expect(wibDateTime("2026-10-26T16:59:00Z")).toBe("2026-10-26 23:59");
  });

  it("is empty for missing or unparseable input", () => {
    expect(wibDateTime(null)).toBe("");
    expect(wibDateTime("bukan tanggal")).toBe("");
  });

  it("wibDay follows WIB", () => {
    expect(wibDay(new Date("2026-10-26T17:30:00Z"))).toBe("2026-10-27");
  });
});
