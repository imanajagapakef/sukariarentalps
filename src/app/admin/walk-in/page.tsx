import { getBranches, getPromoOfferings, getUnitsWithFacility } from "@/lib/catalog";
import { getStaffUser } from "@/lib/authz";
import { EmptyState } from "@/components/empty-state";
import { WalkInForm } from "@/components/admin/walk-in-form";

export const dynamic = "force-dynamic";

export default async function AdminWalkInPage() {
  // Promo offerings come along because most promos are redeemed at the counter: the
  // cashier should be able to apply one without leaving this page.
  const [branches, units, promoOfferings] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getPromoOfferings(),
  ]);

  // Every active role can staff the counter, but the server already 403s walk-ins
  // outside a STAFF profile's own branch. The picker should never offer a branch
  // whose every submit is a guaranteed failure.
  const me = await getStaffUser().catch(() => null);
  if (!me) {
    // The admin layout already refuses signed-out traffic, so this is a safety
    // net rather than a state the design expects to show; refuse clearly anyway.
    return (
      <div className="max-w-2xl">
        <h1 className="font-display text-2xl uppercase">Walk-in</h1>
        <div className="mt-6">
          <EmptyState
            title="Sesi tidak aktif"
            description="Muat ulang halaman untuk melanjutkan."
          />
        </div>
      </div>
    );
  }

  // null = OWNER/ADMIN, free picker. "" = a STAFF profile without a placement:
  // refuse up front instead of rendering a form.
  const lockedBranchId = me.role === "STAFF" ? me.branch_id ?? "" : null;
  if (lockedBranchId === "") {
    return (
      <div className="max-w-2xl">
        <h1 className="font-display text-2xl uppercase">Walk-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Customer datang langsung. Booking + bayar tunai/QRIS manual → langsung CONFIRMED.
        </p>
        <div className="mt-6">
          <EmptyState
            title="Belum ada cabang"
            description="Profilmu belum dipasangkan ke satu cabang pun, jadi halaman walk-in tidak bisa dibuka. Hubungi owner untuk penempatan cabang."
          />
        </div>
      </div>
    );
  }

  const visibleBranches =
    lockedBranchId === null ? branches : branches.filter((b) => b.branch_id === lockedBranchId);
  const visibleUnits =
    lockedBranchId === null ? units : units.filter((u) => u.branch_id === lockedBranchId);

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl uppercase">Walk-in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Customer datang langsung. Booking + bayar tunai/QRIS manual → langsung CONFIRMED.
      </p>
      <WalkInForm
        branchLocked={lockedBranchId !== null}
        branches={visibleBranches.map((b) => ({ id: b.branch_id, name: b.name }))}
        units={visibleUnits
          .filter((u) => u.facility_types?.category === "RENTAL")
          .map((u) => ({
            id: u.unit_id,
            name: u.name,
            branchId: u.branch_id,
            status: u.status,
            // Eligibility is per room type, so the form cannot list a promo without
            // knowing which type of room the chosen unit is.
            facilityTypeId: u.facility_type_id,
          }))}
        promoOfferings={promoOfferings}
      />
    </div>
  );
}
