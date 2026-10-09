import { describe, expect, it } from "vitest";
import { formatRemaining } from "@/lib/countdown";

const at = (h: number, m: number, s: number) => (h * 3600 + m * 60 + s) * 1000;

describe("formatRemaining", () => {
  it("zero-pads all three fields", () => {
    expect(formatRemaining(at(2, 5, 3))).toBe("02:05:03");
  });

  it("includes the hours, which is the whole point of the HH:MM:SS change", () => {
    // The old MM:SS format rendered this as "90:00".
    expect(formatRemaining(at(1, 30, 0))).toBe("01:30:00");
    expect(formatRemaining(at(9, 5, 0))).toBe("09:05:00");
  });

  it("pads a sub-ten value rather than showing one digit", () => {
    expect(formatRemaining(at(0, 0, 7))).toBe("00:00:07");
    expect(formatRemaining(at(0, 9, 0))).toBe("00:09:00");
  });

  it("clamps at zero instead of counting into negatives", () => {
    expect(formatRemaining(-1)).toBe("00:00:00");
    expect(formatRemaining(-9_999_999)).toBe("00:00:00");
    expect(formatRemaining(0)).toBe("00:00:00");
  });

  it("does not wrap hours at 24, since a booking is never that far out", () => {
    expect(formatRemaining(at(25, 0, 0))).toBe("25:00:00");
  });

  it("truncates rather than rounding, so it never shows a second early", () => {
    // 1.9s remaining must read 00:00:01, never 00:00:02.
    expect(formatRemaining(1999)).toBe("00:00:01");
    expect(formatRemaining(1000)).toBe("00:00:01");
    expect(formatRemaining(999)).toBe("00:00:00");
  });
});