import { Suspense } from "react";
import { getBranches, getGames, getSnacks, getUnitsWithFacility } from "@/lib/catalog";
import { BookingForm } from "@/components/booking-form";
import { BookingHeroAnimation } from "@/components/booking-hero-animation";

export const revalidate = 300;

export default async function BookingPage({
  searchParams,
}: {
  // `type` and `slot` are what the home-page instant-booking widget sends; they
  // used to be dropped on the floor here.
  searchParams: Promise<{ unit?: string; branch?: string; type?: string; slot?: string }>;
}) {
  const { unit, branch, type, slot } = await searchParams;
  const [branches, units, snacks, games] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getSnacks(),
    getGames(),
  ]);

  // Only the fields the form renders are serialized into the RSC payload.
  const formBranches = branches.map((b) => ({ branch_id: b.branch_id, name: b.short_name ?? b.name }));
  const formUnits = units.map((u) => ({
    unit_id: u.unit_id,
    name: u.name,
    status: u.status,
    branch_id: u.branch_id,
    facility_type_id: u.facility_type_id,
    facility_types: u.facility_types
      ? { name: u.facility_types.name, category: u.facility_types.category }
      : null,
  }));
  const formSnacks = snacks.map((s) => ({ snack_id: s.snack_id, name: s.name, price: s.price, stock: s.stock, min_stock: s.min_stock }));
  const formGames = games.map((g) => ({
    game_id: g.game_id,
    name: g.name,
    game_availability: g.game_availability.map((a) => ({ branch_id: a.branch_id, available: a.available })),
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Booking</h1>
          <p className="mt-2 text-muted-foreground">Tiga langkah: tempat, waktu, data kamu.</p>
        </div>
        <BookingHeroAnimation className="h-24 w-full md:h-44 md:w-[480px] shrink-0" />
      </div>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Memuat form…</p>}>
        <BookingForm
          branches={formBranches}
          units={formUnits}
          snacks={formSnacks}
          games={formGames}
          initialUnit={unit}
          initialBranch={branch}
          initialType={type}
          initialSlot={slot}
        />
      </Suspense>
    </div>
  );
}
