import { describe, expect, it } from "vitest";
import {
  SLOT_PRESETS,
  isSlotPreset,
  pickSlotStart,
  presetDay,
  wibMinutes,
} from "@/lib/slot-preset";

/** 2026-10-02 is a Friday. 20:00 WIB == 13:00Z the same day. */
const slot = (hhmm: string, state = "AVAILABLE") => ({
  slot_start: `2026-10-02T${hhmm}:00+07:00`,
  state,
});

describe("isSlotPreset", () => {
  it("accepts the three presets the widget sends", () => {
    expect(isSlotPreset("evening")).toBe(true);
    expect(isSlotPreset("midnight")).toBe(true);
    expect(isSlotPreset("tomorrow")).toBe(true);
  });

  it("rejects 'now' and junk, which the widget may or may not send", () => {
    // The widget omits `slot` for "Main Sekarang", but a hand-edited URL could
    // carry it and must not crash the page.
    expect(isSlotPreset(undefined)).toBe(false);
    expect(isSlotPreset("now")).toBe(false);
    expect(isSlotPreset("")).toBe(false);
    expect(isSlotPreset("constructor")).toBe(false);
    expect(isSlotPreset("toString")).toBe(false);
  });
});

describe("wibMinutes", () => {
  it("reads the WIB wall clock, not UTC", () => {
    // 13:00Z is 20:00 in Jakarta (UTC+7).
    expect(wibMinutes("2026-10-02T13:00:00Z")).toBe(20 * 60);
    expect(wibMinutes("2026-10-02T07:00:00Z")).toBe(14 * 60);
    expect(wibMinutes("2026-10-02T16:00:00Z")).toBe(23 * 60);
  });
});

describe("presetDay", () => {
  it("keeps same-day presets on today and pushes tomorrow forward one day", () => {
    const now = new Date("2026-10-02T10:00:00+07:00");
    expect(presetDay("evening", now)).toBe("2026-10-02");
    expect(presetDay("midnight", now)).toBe("2026-10-02");
    expect(presetDay("tomorrow", now)).toBe("2026-10-03");
  });

  it("uses WIB, so a late-evening UTC instant does not roll back a day", () => {
    // 2026-10-02T17:00Z is already 2026-10-03 00:00 in Jakarta.
    const lateUtc = new Date("2026-10-02T17:00:00Z");
    expect(presetDay("tomorrow", lateUtc)).toBe("2026-10-04");
  });
});

describe("pickSlotStart", () => {
  it("returns the exact target slot when it is free", () => {
    const grid = [slot("18:00"), slot("19:30"), slot("20:00"), slot("20:30"), slot("23:00")];
    expect(pickSlotStart(grid, "evening")).toBe("2026-10-02T20:00:00+07:00");
    expect(pickSlotStart(grid, "midnight")).toBe("2026-10-02T23:00:00+07:00");
  });

  it("falls back to the earliest free slot at or after the target", () => {
    // 20:00 is taken; the grid steps by 30 minutes so 20:30 is the next chance.
    const grid = [slot("18:00"), slot("19:30"), slot("20:00", "BOOKED"), slot("20:30")];
    expect(pickSlotStart(grid, "evening")).toBe("2026-10-02T20:30:00+07:00");
  });

  it("returns null when nothing free remains after the target", () => {
    const grid = [slot("18:00"), slot("19:00", "BOOKED")];
    expect(pickSlotStart(grid, "evening")).toBeNull();
  });

  it("returns null for a fully booked grid rather than picking a taken slot", () => {
    const grid = [slot("19:00", "BOOKED"), slot("20:00", "BOOKED"), slot("20:30", "IN_USE")];
    expect(pickSlotStart(grid, "evening")).toBeNull();
  });

  it("returns null on an empty grid", () => {
    expect(pickSlotStart([], "evening")).toBeNull();
  });

  it("does not mutate the caller's grid order", () => {
    const grid = [slot("21:00"), slot("20:00"), slot("22:00")];
    const copy = [...grid];
    pickSlotStart(grid, "evening");
    expect(grid).toEqual(copy);
  });
});

describe("SLOT_PRESETS", () => {
  it("matches the times the widget advertises", () => {
    // Labels say "Malam Ini (20:00 WIB)", "Begadang Pass (23:00 WIB)",
    // "Besok Siang (14:00 WIB)". If these drift, the copy lies.
    expect(SLOT_PRESETS.evening).toEqual({ dayOffset: 0, hour: 20, minute: 0 });
    expect(SLOT_PRESETS.midnight).toEqual({ dayOffset: 0, hour: 23, minute: 0 });
    expect(SLOT_PRESETS.tomorrow).toEqual({ dayOffset: 1, hour: 14, minute: 0 });
  });
});