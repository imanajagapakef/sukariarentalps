import { Suspense } from "react";
import { getBranches, getGames, getSnacks, getUnitsWithFacility } from "@/lib/catalog";
import { BookingForm } from "@/components/booking-form";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; branch?: string }>;
}) {
  const { unit, branch } = await searchParams;
  const [branches, units, snacks, games] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getSnacks(),
    getGames(),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-5xl">Booking</h1>
      <p className="mt-2 text-muted-foreground">Tiga langkah: tempat, waktu, data kamu.</p>
      <Suspense fallback={<p className="mt-8 text-sm text-muted">Memuat form…</p>}>
        <BookingForm
          branches={branches}
          units={units}
          snacks={snacks}
          games={games}
          initialUnit={unit}
          initialBranch={branch}
        />
      </Suspense>
    </div>
  );
}
