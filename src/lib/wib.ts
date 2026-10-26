/**
 * Calendar math in Asia/Jakarta, independent of the server's own timezone. The venue
 * runs overnight, so a booking at 00:30 WIB is still "yesterday" in UTC, and slicing an
 * ISO string for the date puts it on the wrong day.
 */

const WIB_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23, not hour12:false: the latter prints midnight as "24" on some engines.
  hourCycle: "h23",
});

function parts(date: Date): Record<string, string> {
  return Object.fromEntries(WIB_PARTS.formatToParts(date).map((p) => [p.type, p.value]));
}

/** "2026-10-27 00:30", which spreadsheets parse as a sortable date and time. Empty if unparseable. */
export function wibDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** "2026-10-27": today in WIB unless a date is given. */
export function wibDay(date: Date = new Date()): string {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
