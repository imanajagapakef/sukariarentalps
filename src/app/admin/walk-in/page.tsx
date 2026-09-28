import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { WalkInForm } from "@/components/admin/walk-in-form";

export const dynamic = "force-dynamic";

export default async function AdminWalkInPage() {
  const [branches, units] = await Promise.all([getBranches(), getUnitsWithFacility()]);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl uppercase">Walk-in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customer datang langsung. Booking + bayar tunai/QRIS manual → langsung CONFIRMED.
      </p>
      <WalkInForm
        branches={branches.map((b) => ({ id: b.branch_id, name: b.name }))}
        units={units
          .filter((u) => u.facility_types?.category === "RENTAL")
          .map((u) => ({ id: u.unit_id, name: u.name, branchId: u.branch_id, status: u.status }))}
      />
    </div>
  );
}
