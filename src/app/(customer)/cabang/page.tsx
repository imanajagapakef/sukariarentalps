import Link from "next/link";
import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { groupByBranch } from "@/lib/branch-availability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CabangHeroAnimation } from "@/components/cabang-hero-animation";

export const revalidate = 300;

export default async function CabangPage() {
  const [branches, units] = await Promise.all([getBranches(), getUnitsWithFacility()]);
  const availability = groupByBranch(units);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Cabang</h1>
        </div>
        <CabangHeroAnimation className="h-24 w-full md:h-44 md:w-[480px] shrink-0" />
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {branches.map((b) => {
          const stats = availability.get(b.branch_id);
          const total = stats?.total ?? 0;
          const free = stats?.available ?? 0;

          return (
            <div
              key={b.branch_id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card p-6"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-xl uppercase">{b.name}</h2>
                <Badge variant={free > 0 ? "default" : "secondary"}>
                  {free > 0 ? `${free} kosong` : "Penuh"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{b.address}</p>

              {total > 0 && (
                <div className="mt-3 rounded-lg bg-muted/40 p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-3xl text-primary">{free}</span>
                    <span className="text-sm text-muted-foreground">
                      dari {total} unit tersedia sekarang
                    </span>
                  </div>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {stats?.tiers.map((tier) => (
                      <div key={tier.name} className="flex gap-1">
                        <dt className="text-muted-foreground">{tier.name}</dt>
                        <dd>
                          {tier.available}/{tier.total}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Jam</dt>
                  <dd>{b.operating_hours}</dd>
                </div>
                {b.phone && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Telp</dt>
                    <dd>{b.phone}</dd>
                  </div>
                )}
                {b.google_rating != null && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Google</dt>
                    <dd>
                      {b.google_rating} ★{" "}
                      <span className="text-muted-foreground">({b.google_review_count})</span>
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-auto flex gap-2 pt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/cabang/${b.branch_id}`}>Lihat Unit</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/booking?branch=${b.branch_id}`}>Booking</Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
