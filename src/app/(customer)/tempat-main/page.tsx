import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { EmptyState } from "@/components/empty-state";
import { LiveUnits } from "@/components/live-units";
import { StationCard } from "@/components/kit/station-card";
import { TempatMainHeroAnimation } from "@/components/tempat-main-hero-animation";
import { createClient } from "@/lib/supabase/server";
import { getNextFreeMap } from "@/lib/next-free";

export const dynamic = "force-dynamic";

export default async function TempatMainPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const [branches, units] = await Promise.all([getBranches(), getUnitsWithFacility()]);
  const shown = branch ? units.filter((u) => u.branch_id === branch) : units;

  const db = await createClient();
  const nextFree = await getNextFreeMap(db, shown);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <LiveUnits />
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Tempat Main</h1>
          <p className="mt-2 flex items-center gap-2 text-muted-foreground">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Status langsung per unit. Hijau = bisa langsung gas.
          </p>
        </div>
        <TempatMainHeroAnimation className="h-24 w-full md:h-44 md:w-[480px] shrink-0" />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <a
          href="/tempat-main"
          className={`rounded-full border px-4 py-1.5 text-sm ${!branch ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
        >
          Semua Cabang
        </a>
        {branches.map((b) => (
          <a
            key={b.branch_id}
            href={`/tempat-main?branch=${b.branch_id}`}
            className={`rounded-full border px-4 py-1.5 text-sm ${branch === b.branch_id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            {b.short_name ?? b.name}
          </a>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Belum ada unit" description="Coba pilih cabang lain." />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((u) => (
            <StationCard key={u.unit_id} unit={u} nextFree={nextFree.get(u.unit_id)} />
          ))}
        </div>
      )}
    </div>
  );
}
