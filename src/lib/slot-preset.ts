/**
 * Time-slot presets for the instant-booking widget (D6).
 *
 * The widget on the home page lets a visitor pick "Malam Ini (20:00 WIB)" and
 * jumps to /booking?slot=evening, but /booking read only `unit` and `branch`,
 * so that choice was silently thrown away. This module is the missing half.
 *
 * Pure and import-free so a node test can call it. Note that `fmtTime` renders
 * "20.00" with a dot (id-ID short time), so these helpers compare minutes since
 * midnight rather than matching on formatted strings.
 */

export const SLOT_PRESETS = {
  /** Main Sekarang carries no preset: the widget omits `slot` for it. */
  evening: { dayOffset: 0, hour: 20, minute: 0 },
  midnight: { dayOffset: 0, hour: 23, minute: 0 },
  tomorrow: { dayOffset: 1, hour: 14, minute: 0 },
} as const;

export type SlotPreset = keyof typeof SLOT_PRESETS;

export function isSlotPreset(value: string | undefined): value is SlotPreset {
  // Object.hasOwn, not `in`: `in` walks the prototype chain, so a hand-edited
  // /booking?slot=constructor or =toString would pass the guard and then read
  // undefined out of SLOT_PRESETS.
  return typeof value === "string" && Object.hasOwn(SLOT_PRESETS, value);
}

const WIB = "Asia/Jakarta";

const timeParts = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: WIB,
});

const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: WIB,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Minutes since WIB midnight for an instant. */
export function wibMinutes(iso: string): number {
  const parts = timeParts.formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

/** The YYYY-MM-DD (WIB) a preset points at, `dayOffset` days from `now`. */
export function presetDay(preset: SlotPreset, now: Date = new Date()): string {
  const { dayOffset } = SLOT_PRESETS[preset];
  const shifted = new Date(now.getTime() + dayOffset * 86_400_000);
  return isoDay.format(shifted);
}

/**
 * The slot to preselect for a preset, or null to preselect nothing.
 *
 * Prefers the exact target time, then falls back to the earliest free slot at
 * or after it. Falling back rather than failing matters: the grid is built on a
 * 30-minute interval, so a preset can legitimately have no slot on the minute
 * even when the unit is free that evening.
 */
export function pickSlotStart(
  slots: readonly { slot_start: string; state: string }[],
  preset: SlotPreset,
): string | null {
  const open = slots.filter((s) => s.state === "AVAILABLE");
  if (open.length === 0) return null;

  const { hour, minute } = SLOT_PRESETS[preset];
  const target = hour * 60 + minute;

  const exact = open.find((s) => wibMinutes(s.slot_start) === target);
  if (exact) return exact.slot_start;

  const later = open
    .filter((s) => wibMinutes(s.slot_start) >= target)
    .sort((a, b) => wibMinutes(a.slot_start) - wibMinutes(b.slot_start));
  return later[0]?.slot_start ?? null;
}