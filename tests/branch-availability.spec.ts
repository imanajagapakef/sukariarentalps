import { describe, expect, it } from "vitest";
import {
  BOOKABLE_STATUS,
  branchAvailability,
  groupByBranch,
  type UnitAvailabilityInput,
} from "@/lib/branch-availability";

const unit = (
  branch_id: string,
  status: string,
  facility: string | null = "Regular",
): UnitAvailabilityInput => ({
  branch_id,
  status,
  facility_types: facility === null ? null : { name: facility },
});

describe("branch availability", () => {
  it("counts only AVAILABLE as bookable", () => {
    const rows = [
      unit("B1", BOOKABLE_STATUS),
      unit("B1", "BOOKED"),
      unit("B1", "IN_USE"),
      unit("B1", "MAINTENANCE"),
      unit("B1", "OFFLINE"),
    ];
    const result = branchAvailability(rows);
    expect(result.total).toBe(5);
    expect(result.available).toBe(1);
  });

  it("breaks availability down per facility type", () => {
    const rows = [
      unit("B1", BOOKABLE_STATUS, "Regular"),
      unit("B1", "BOOKED", "Regular"),
      unit("B1", BOOKABLE_STATUS, "Regular"),
      unit("B1", "BOOKED", "Regular"),
      unit("B1", "BOOKED", "Regular"),
      unit("B1", BOOKABLE_STATUS, "Capsule"),
      unit("B1", "BOOKED", "Capsule"),
    ];
    expect(branchAvailability(rows).tiers).toEqual([
      { name: "Capsule", total: 2, available: 1 },
      { name: "Regular", total: 5, available: 2 },
    ]);
  });

  it("sorts tiers by name so the card renders the same way every request", () => {
    const rows = [unit("B1", BOOKABLE_STATUS, "VIP"), unit("B1", BOOKABLE_STATUS, "Capsule")];
    expect(branchAvailability(rows).tiers.map((t) => t.name)).toEqual(["Capsule", "VIP"]);
  });

  it("buckets a unit with no facility type instead of dropping it", () => {
    const result = branchAvailability([unit("B1", BOOKABLE_STATUS, null)]);
    expect(result.tiers).toEqual([{ name: "Lainnya", total: 1, available: 1 }]);
    expect(result.total).toBe(1);
  });

  it("reports zeroes rather than throwing for a branch with no units", () => {
    const result = branchAvailability([]);
    expect(result).toEqual({ total: 0, available: 0, tiers: [] });
  });

  it("splits units into one bucket per branch and omits empty branches", () => {
    const result = groupByBranch([
      unit("B1", BOOKABLE_STATUS, "Regular"),
      unit("B1", "BOOKED", "Regular"),
      unit("B2", BOOKABLE_STATUS, "VIP"),
      unit("B2", BOOKABLE_STATUS, "VIP"),
    ]);
    expect([...result.keys()]).toEqual(["B1", "B2"]);
    expect(result.get("B1")).toEqual({
      total: 2,
      available: 1,
      tiers: [{ name: "Regular", total: 2, available: 1 }],
    });
    expect(result.get("B2")?.available).toBe(2);
  });
});