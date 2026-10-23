import { Suspense } from "react";
import type { Metadata } from "next";
import { getBranches, getGames, getPromoOfferings, getSnacks, getUnitsWithFacility } from "@/lib/catalog";
import { BookingForm } from "@/components/booking-form";
import { BookingHeroAnimation } from "@/components/booking-hero-animation";

export const metadata: Metadata = {
  title: "Booking",
  description: "Pesan sesi PS di SukaRia Rental PS — pilih tempat, waktu, lalu isi data kamu.",
};

// No `export const revalidate` here on purpose. Reading `searchParams` (below) makes this
// route dynamic, so a route-level revalidate window never applied to it in the first
// place. Data freshness is decided where the reads happen: `lib/catalog.ts`, which keeps
// branches on the 300 s fetch cache and reads unit status, stock and games live.

/** Shape of the Suspense fallback: same silhouette as the real form (stepper row,
 *  then a card with a heading, one field, and a unit grid) so the layout does not jump
 *  when the server work resolves. */
function BookingSkeleton() {
  return (
    <div className="mt-8 space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Memuat form booking…</span>
      <div className="flex gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10" aria-hidden>
        <div className="h-5 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-11 w-full animate-pulse rounded-lg bg-muted" />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function BookingPage({
  searchParams,
}: {
  // `type` and `slot` are what the home-page instant-booking widget sends; they
  // used to be dropped on the floor here. `promo` and `duration` come from clicking a
  // package on /promo, so the form opens already pinned to what that promo covers.
  searchParams: Promise<{
    unit?: string;
    branch?: string;
    type?: string;
    slot?: string;
    promo?: string;
    duration?: string;
  }>;
}) {
  const { unit, branch, type, slot, promo, duration } = await searchParams;
  const [branches, units, snacks, games, promoOfferings] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getSnacks(),
    // Fresh, not the 300 s browse cache: `game_availability` decides which games this
    // branch can offer, and offering one that was just switched off is the exact bug
    // the instant-booking widget cannot recover from.
    getGames({ revalidate: 0 }),
    getPromoOfferings(),
  ]);

  // A hand-edited URL should not be able to put the form in a state it cannot recover
  // from, so an unparseable duration is dropped rather than passed on as NaN. This bound
  // is only the first line of defence: the branch's own rules (min/max/interval) are not
  // known until the form has fetched them, so BookingForm checks the value against
  // `durationOptions(cfg)` once cfg lands.
  const requestedDuration = duration ? Number(duration) : NaN;
  const initialDuration =
    Number.isFinite(requestedDuration) && requestedDuration > 0 && requestedDuration <= 1440
      ? requestedDuration
      : undefined;

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
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      {/* No `mt-*` on this row: the container above already spaces it, and a second
          margin here just pushed the heading out of line with the rest of the page. */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Booking</h1>
          <p className="mt-2 text-muted-foreground">Tiga langkah: tempat, waktu, data kamu.</p>
        </div>
        {/* Decoration only, so it is dropped on phones where it competes with the form
            for the first screen instead of framing it. */}
        <BookingHeroAnimation className="hidden h-24 w-full shrink-0 md:block md:h-36 md:w-90" />
      </div>
      <Suspense fallback={<BookingSkeleton />}>
        <BookingForm
          branches={formBranches}
          units={formUnits}
          snacks={formSnacks}
          games={formGames}
          initialUnit={unit}
          initialBranch={branch}
          initialType={type}
          initialSlot={slot}
          promoOfferings={promoOfferings}
          initialPromo={promo}
          initialDuration={initialDuration}
        />
      </Suspense>
    </div>
  );
}
