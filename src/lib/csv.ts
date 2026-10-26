/**
 * Pure CSV helpers shared by every export route. No Next, no Supabase, no React, so a
 * node test can drive them directly (tests/csv.spec.ts).
 *
 * Every cell is encoded by exactly one of csvText / csvNumber / csvPhone, then handed to
 * toCsv as a ready string. Encoding at the call site is what keeps numbers numeric and
 * text injection-safe in the same row.
 */

export type CsvValue = string | number | boolean | null | undefined;

/** Written as an escape on purpose: a literal U+FEFF is invisible and editors strip it. */
export const CSV_BOM = "\uFEFF";

/**
 * Pins the delimiter for Excel locales whose list separator is `;` (id-ID), where a
 * comma CSV otherwise opens as one column. Other tools (Sheets, LibreOffice import)
 * show it as a stray first row, so toCsv lets callers turn it off.
 */
const EXCEL_SEP_HINT = "sep=,";

/** OWASP's list of formula triggers: = + - @ and tab / carriage return. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Phone numbers as validated by phoneRegex: digits, one optional leading +, spaces, - and ( ). */
const PHONE_SAFE = /^[+\d][\d\s\-()]{5,19}$/;

function quote(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Text cell. A leading formula character gets an apostrophe, because names and other
 * free text are attacker-controllable: a booking named `=cmd|...` must not run when
 * staff open the export. Do NOT use this for numbers (it would turn -5000 into text).
 */
export function csvText(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return quote(FORMULA_START.test(s) ? `'${s}` : s);
}

/** Numeric cell: stays a number so the column sorts and sums. Anything else is empty. */
export function csvNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? String(n) : "";
}

/**
 * Phone cell, forced to text. Excel drops the leading zero of 0812... and reads +62...
 * as a formula, so a plain cell corrupts the very number staff need to call. The
 * `="..."` form shows the value as typed. It is only emitted for strings that pass
 * PHONE_SAFE (no quotes, no letters), so it cannot carry an injection; anything else
 * falls back to csvText and its apostrophe guard.
 */
export function csvPhone(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  if (!s) return "";
  return PHONE_SAFE.test(s) ? quote(`="${s}"`) : csvText(s);
}

/**
 * Builds the whole file: BOM, optional `sep=,` hint, header, rows, CRLF line ends.
 * `rows` must already be encoded cells. A row whose width differs from the header
 * throws instead of shifting every column after it.
 */
export function toCsv(
  columns: readonly string[],
  rows: readonly (readonly string[])[],
  options: { excelHint?: boolean } = {},
): string {
  rows.forEach((r, i) => {
    if (r.length !== columns.length) {
      throw new Error(`CSV: baris ${i + 1} punya ${r.length} kolom, header ${columns.length}.`);
    }
  });
  const lines = [columns.map(csvText).join(","), ...rows.map((r) => r.join(","))];
  if (options.excelHint ?? true) lines.unshift(EXCEL_SEP_HINT);
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

/**
 * Sanitizes filename parts to [a-z0-9_-] and appends an extension, so nothing from a
 * query string can break out of the quotes in Content-Disposition or smuggle a header line.
 */
export function exportFilename(parts: ReadonlyArray<string | undefined>, ext: string): string {
  const clean = parts
    .map((p) =>
      (p ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40),
    )
    .filter(Boolean);
  return `${clean.join("_") || "export"}.${ext}`;
}

/** Filename built only from [a-z0-9_-], so nothing from a query string can break out of
 * the quotes in Content-Disposition or smuggle a header line. */
export function csvFilename(parts: ReadonlyArray<string | undefined>): string {
  return exportFilename(parts, "csv");
}

/** `filename` must come from csvFilename. */
export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Staff data with phone numbers: never cached by the browser or a proxy.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
