import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getBranches, getMinHourlyRates } from "@/lib/catalog";
import { facilityCopy } from "@/lib/facility-copy";
import { fmtTime, rp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { UnitStatusPill } from "@/components/status-pill";
import { CountdownBadge } from "@/components/kit/countdown-badge";
import { PlatformPill } from "@/components/kit/platform-pill";
import { Cover } from "@/components/cover";

export const dynamic = "force-dynamic";

/**
 * Unit detail.
 *
 * Keyed on unit_id rather than a name slug: names repeat across branches
 * (both Batu 5 and Ganet have a "VIP 02"), so a name-based route would be
 * ambiguous. unit_id is the primary key and is already what the booking links
 * carry.
 */
export default async function UnitDetailPage({ params }: { params: Promise<{ unit_id: string }> }) {
  const { unit_id } = await params;
  const db = await createClient();

  const { data: unit, error } = await db
    .from("units")
    .select(
      "unit_id, image_url, name, status, condition, branch_id, facility_type_id, branches(name, short_name, address), facility_types(code, name, platform, category)",
    )
    .eq("unit_id", unit_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!unit) notFound();

  const [branches, rates] = await Promise.all([getBranches(), getMinHourlyRates()]);
  const branch = branches.find((b) => b.branch_id === unit.branch_id);

  const free =
    unit.status === "AVAILABLE"
      ? null
      : (
          await db.rpc("next_available", { p_unit_id: unit.unit_id, p_from: new Date().toISOString() })
        ).data ?? null;

  const code = unit.facility_types?.code ?? "";
  const copy = facilityCopy(code, {
    tag: unit.facility_types?.name ?? "Unit Konsol",
    players: "Multi Player",
    desc: "Unit konsol dengan setup standar.",
    cta: "Booking Unit",
  });
  const rate = rates[unit.facility_type_id];
  const bookable = unit.status !== "MAINTENANCE" && unit.status !== "OFFLINE";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-foreground">Home</Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/tempat-main" className="hover:text-foreground">Tempat Main</Link>
          </li>
          <li aria-hidden>/</li>
          {branch && (
            <>
              <li>
                <Link href={`/cabang/${branch.branch_id}`} className="hover:text-foreground">
                  {branch.short_name ?? branch.name}
                </Link>
              </li>
              <li aria-hidden>/</li>
            </>
          )}
          <li aria-current="page" className="text-foreground">{unit.name}</li>
        </ol>
      </nav>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          {unit.image_url && (
            <Cover
              seed={unit.unit_id}
              src={unit.image_url}
              label={unit.name}
              alt={`${unit.name} — ${unit.facility_types?.name ?? "unit"}`}
              priority
              className="mb-6 aspect-[3/2] w-full rounded-xl border border-border"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/40 bg-primary/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              {copy.tag}
            </span>
            <PlatformPill platform={unit.facility_types?.platform ?? ""} />
          </div>

          <h1 className="font-display mt-3 text-4xl uppercase leading-none md:text-5xl">{unit.name}</h1>
          <p className="mt-2 text-muted-foreground">{unit.facility_types?.name}</p>

          <p className="mt-4 max-w-2xl text-on-surface-variant">{copy.desc}</p>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <Fact label="Kapasitas" value={copy.players} icon={Users} />
            <Fact
              label="Lokasi"
              value={branch ? (branch.short_name ?? branch.name) : unit.branch_id}
              icon={MapPin}
            />
          </dl>

          {rate != null && (
            <p className="mt-4 text-sm">
              Mulai{" "}
              <span className="font-display text-xl uppercase text-primary">{rp(rate)}</span>
              <span className="text-muted-foreground">/jam</span>
            </p>
          )}
        </div>

        <aside className="h-fit w-full rounded-xl border border-border bg-card p-5 lg:w-80 lg:sticky lg:top-24">
          <UnitStatusPill status={unit.status} />

          <p className="mt-3 text-sm text-muted-foreground">
            {unit.status === "AVAILABLE" ? (
              <span className="text-primary">Siap main sekarang</span>
            ) : free ? (
              <>
                Kosong pukul <span className="text-foreground">{fmtTime(free)}</span>
              </>
            ) : (
              "Jadwal untuk hari ini sudah penuh"
            )}
          </p>
          {free && unit.status !== "AVAILABLE" && (
            <div className="mt-2">
              <CountdownBadge endsAt={free} expiredLabel="SIAP SEKARANG" />
            </div>
          )}

          {bookable ? (
            <Button asChild className="mt-5 w-full shadow-arcade">
              <Link href={`/booking?unit=${unit.unit_id}&branch=${unit.branch_id}`}>
                {copy.cta} <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          ) : (
            <p className="mt-5 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              Unit ini sedang tidak dioperasikan. Coba unit lain di{" "}
              <Link href="/tempat-main" className="underline">
                Tempat Main
              </Link>
              .
            </p>
          )}

          {branch?.address && (
            <p className="mt-4 text-xs text-muted-foreground">
              {branch.address} · {branch.operating_hours}
            </p>
          )}

          <div className="mt-4 border-t border-border pt-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Kode unit</p>
            <p className="font-display text-sm uppercase">{unit.unit_id}</p>
          </div>
        </aside>
      </div>

      <div className="mt-12 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/tempat-main">Lihat Semua Unit</Link>
        </Button>
        {branch && (
          <Button asChild variant="outline">
            <Link href={`/cabang/${branch.branch_id}`}>Lihat Cabang {branch.short_name ?? branch.name}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden className="size-3.5" />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
