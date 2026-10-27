import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import { CircleCheck, Gamepad2, Lock, Ticket, UserPlus, Wrench, Zap } from "lucide-react";
import { getBranches, getPromoOfferings, getUnitsWithFacility } from "@/lib/catalog";
import { getStaffUser } from "@/lib/authz";
import { EmptyState } from "@/components/empty-state";
import { StatCards } from "@/components/stat-cards";
import { WalkInForm } from "@/components/admin/walk-in-form";

export const dynamic = "force-dynamic";

const SUBTITLE = "Customer datang langsung. Booking + bayar tunai/QRIS manual → langsung CONFIRMED.";

export default async function AdminWalkInPage() {
  // Every active role can staff the counter, but the server already 403s walk-ins
  // outside a STAFF profile's own branch. The picker should never offer a branch
  // whose every submit is a guaranteed failure.
  //
  // Checked BEFORE the catalog reads: a signed-out or unplaced profile used to pay for
  // three queries whose result it was about to throw away.
  const me = await getStaffUser().catch(() => null);
  if (!me) {
    // The admin layout already refuses signed-out traffic, so this is a safety
    // net rather than a state the design expects to show; refuse clearly anyway.
    return (
      <div className="max-w-2xl">
        <h1 className="font-display text-2xl uppercase">Walk-in</h1>
        <div className="mt-6">
          <EmptyState title="Sesi tidak aktif" description="Muat ulang halaman untuk melanjutkan." />
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
        <p className="mt-1 text-sm text-muted-foreground">{SUBTITLE}</p>
        <div className="mt-6">
          <EmptyState
            title="Belum ada cabang"
            description="Profilmu belum dipasangkan ke satu cabang pun, jadi halaman walk-in tidak bisa dibuka. Hubungi owner untuk penempatan cabang."
          />
        </div>
      </div>
    );
  }

  // Promo offerings come along because most promos are redeemed at the counter: the
  // cashier should be able to apply one without leaving this page.
  const [branches, units, promoOfferings] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getPromoOfferings(),
  ]);

  const visibleBranches =
    lockedBranchId === null ? branches : branches.filter((b) => b.branch_id === lockedBranchId);
  const rentalUnits = (lockedBranchId === null ? units : units.filter((u) => u.branch_id === lockedBranchId)).filter(
    (u) => u.facility_types?.category === "RENTAL",
  );

  /* ---- ringkasan armada yang bisa dipakai di counter (tanpa query baru) ---- */
  const count = (s: string) => rentalUnits.filter((u) => u.status === s).length;
  const free = count("AVAILABLE");
  const inUse = count("IN_USE");
  const booked = count("BOOKED");
  const down = count("MAINTENANCE") + count("OFFLINE");
  const usable = Math.max(0, rentalUnits.length - down);
  const freePct = usable ? Math.round((free / usable) * 100) : 0;

  return (
    <div className="max-w-5xl space-y-6">
      {/* ============================ HERO ============================ */}
      <PageHero
        size="admin"
        eyebrow={{
          label: (
            <>
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Counter
              {lockedBranchId !== null && visibleBranches[0] && (
                <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                  <Lock aria-hidden className="size-3" /> {visibleBranches[0].name}
                </span>
              )}
            </>
          ),
        }}
        title={
          <>
            Walk-in <span className="text-primary">🎮</span>
          </>
        }
        titleIcon={UserPlus}
        description={SUBTITLE}
        actions={
          <>
            <Link
              href="/admin/bookings"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <Ticket aria-hidden className="size-4" /> Lihat bookings
            </Link>
            <Link
              href="/admin/units"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <Gamepad2 aria-hidden className="size-4" /> Kelola unit
            </Link>
          </>
        }
        aside={
          <div className="w-full sm:w-72">
            <div className="flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Unit siap sekarang</p>
              <p className="font-display text-5xl leading-none tabular-nums text-primary">
                {free}
                <span className="text-2xl text-muted-foreground">/{usable}</span>
              </p>
            </div>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={usable}
              aria-valuenow={free}
              aria-label={`${free} dari ${usable} unit siap dipakai`}
              className="mt-3 h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${freePct}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {free === 0 && usable > 0
                ? "Semua unit terpakai atau dipesan — pakai jadwal mulai nanti."
                : `${freePct}% armada kosong`}
            </p>
          </div>
        }
      />

      {/* ============================= KPI ============================ */}
      <StatCards
        className="mt-0!"
        cards={[
          { label: "Siap dipakai", value: free, tone: "primary", icon: CircleCheck, hint: "bisa langsung main" },
          { label: "Sedang dipakai", value: inUse, icon: Zap, hint: "lagi main" },
          { label: "Dipesan", value: booked, icon: Ticket, hint: "sudah ada booking" },
          {
            label: "Tidak tersedia",
            value: down,
            tone: down > 0 ? "warning" : "muted",
            icon: Wrench,
            hint: down > 0 ? "maintenance / offline" : "semua unit sehat",
          },
        ]}
      />

      {visibleBranches.length === 0 || rentalUnits.length === 0 ? (
        <EmptyState
          title="Belum ada unit rental"
          description="Tidak ada unit rental di cabang yang bisa kamu akses, jadi walk-in belum bisa dibuat."
          actionHref={{ label: "Kelola unit", href: "/admin/units" }}
        />
      ) : (
        <WalkInForm
          branchLocked={lockedBranchId !== null}
          branches={visibleBranches.map((b) => ({ id: b.branch_id, name: b.name }))}
          units={rentalUnits.map((u) => ({
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
      )}
    </div>
  );
}