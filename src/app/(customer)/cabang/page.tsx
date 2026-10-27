import { PageHero } from "@/components/page-hero";
import { MapPin, Monitor, Store, Zap } from "lucide-react";
import { StatCards } from "@/components/stat-cards";
import Link from "next/link";
import Image from "next/image";
import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { getBranchPhotos } from "@/lib/branch-photos";
import { groupByBranch } from "@/lib/branch-availability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CabangHeroAnimation } from "@/components/cabang-hero-animation";

export const revalidate = 300;

export default async function CabangPage() {
  const [branches, units, photosByBranch] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getBranchPhotos(),
  ]);
  const availability = groupByBranch(units);
  const totalUnits = [...availability.values()].reduce((s, v) => s + v.total, 0);
  const totalFree = [...availability.values()].reduce((s, v) => s + v.available, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <PageHero
        className="mt-6"
        eyebrow={{ icon: Store, label: `${branches.length} cabang` }}
        title="Cabang"
        titleIcon={MapPin}
        description="Lihat unit yang lagi kosong, jam buka, dan rute tiap cabang."
        aside={<CabangHeroAnimation className="h-24 w-full md:h-44 md:w-120 shrink-0" />}
      />
      <StatCards
        cards={[
          { label: "Cabang aktif", value: branches.length, icon: Store, hint: "lokasi siap dikunjungi" },
          {
            label: "Unit kosong",
            value: totalFree,
            tone: totalFree > 0 ? "primary" : "muted",
            icon: Zap,
            hint: "bisa langsung main",
          },
          { label: "Total unit", value: totalUnits, icon: Monitor, hint: "seluruh armada" },
        ]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {branches.map((b) => {
          const stats = availability.get(b.branch_id);
          const total = stats?.total ?? 0;
          const free = stats?.available ?? 0;
          const cover =
            photosByBranch.get(b.branch_id)?.[0]?.image_url ?? b.image_url ?? undefined;

          return (
            <div
              key={b.branch_id}
              className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
            >
              {/* First gallery photo is the cover; falls back to the legacy single
                  image_url so a branch that only has the old one still looks right. */}
              {cover && (
                <Link href={`/cabang/${b.branch_id}`} className="relative block aspect-16/9 bg-muted">
                  <Image
                    src={cover}
                    alt={b.name}
                    fill
                    sizes="(max-width: 640px) 100vw, 380px"
                    className="object-cover transition-transform duration-500 hover:scale-105"
                  />
                </Link>
              )}
              <div className="flex flex-1 flex-col gap-2 p-6">
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
