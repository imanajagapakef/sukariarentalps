/**
 * Per-branch unit availability for /cabang.
 *
 * A pure function with no imports on purpose: the page needs one grouped number per
 * branch, and a node test can call this without pulling in the Supabase server client
 * that catalog.ts loads at module scope.
 */
export type UnitAvailabilityInput = {
  branch_id: string;
  status: string;
  facility_types: { name: string } | null;
};

/** Only AVAILABLE is bookable now; BOOKED/IN_USE/IN_ORDER/MAINTENANCE/OFFLINE are not. */
export const BOOKABLE_STATUS = "AVAILABLE";

export type TierAvailability = {
  name: string;
  total: number;
  available: number;
};

export type BranchAvailability = {
  total: number;
  available: number;
  /** Sorted by name so the card renders the same way every request. */
  tiers: TierAvailability[];
};

export function branchAvailability(units: UnitAvailabilityInput[]): BranchAvailability {
  const tiers = new Map<string, TierAvailability>();

  for (const unit of units) {
    const name = unit.facility_types?.name ?? "Lainnya";
    const tier = tiers.get(name) ?? { name, total: 0, available: 0 };
    tier.total += 1;
    if (unit.status === BOOKABLE_STATUS) tier.available += 1;
    tiers.set(name, tier);
  }

  const sorted = [...tiers.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    total: units.length,
    available: sorted.reduce((sum, tier) => sum + tier.available, 0),
    tiers: sorted,
  };
}

/** Split a unit list into one bucket per branch, skipping branches with no units. */
export function groupByBranch(
  units: UnitAvailabilityInput[],
): Map<string, BranchAvailability> {
  const byBranch = new Map<string, UnitAvailabilityInput[]>();
  for (const unit of units) {
    const bucket = byBranch.get(unit.branch_id);
    if (bucket) bucket.push(unit);
    else byBranch.set(unit.branch_id, [unit]);
  }

  return new Map(
    [...byBranch.entries()].map(([branchId, rows]) => [branchId, branchAvailability(rows)]),
  );
}