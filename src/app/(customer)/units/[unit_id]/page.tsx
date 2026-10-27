import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Gauge, MapPin, Monitor, Users, Wallet } from "lucide-react";
import { StatCards } from "@/components/stat-cards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBranches, getMinHourlyRates } from "@/lib/catalog";
import { facilityCopy } from "@/lib/facility-copy";
import { fmtTime, rp } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { UnitStatusPill } from "@/components/status-pill";
import { CountdownBadge } from "@/components/kit/countdown-badge";
import { PlatformPill } from "@/components/kit/platform-pill";
import { Cover } from "@/components/cover";
import { cn } from "@/lib/utils";

export const revalidate = 20;

type Props = { params: Promise<{ unit_id: string }> };

const STATUS_TEXT: Record<string, string> = {
  AVAILABLE: "Siap main",
  IN_USE: "Lagi dipakai",
  BOOKED: "Sudah dipesan",
  MAINTENANCE: "Maintenance",
  OFFLINE: "Offline",
};

// Dot + chip colours per status. Anything unknown falls back to the muted look.
const STATUS_TONE: Record<string, { chip: string; dot: string }> = {
  AVAILABLE: { chip: "bg-emerald-400/15 text-emerald-500 ring-emerald-400/30", dot: "bg-emerald-400" },
  IN_USE: { chip: "bg-amber-400/15 text-amber-500 ring-amber-400/30", dot: "bg-amber-400" },
  BOOKED: { chip: "bg-amber-400/15 text-amber-500 ring-amber-400/30", dot: "bg-amber-400" },
};
const TONE_FALLBACK = { chip: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground/60" };

/** "NEEDS_REPAIR" -> "Needs repair". The condition column is free text from the DB. */
function humanize(v: string): string {
  const s = v.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function generateMetadata({ params }: Props) {
  const { unit_id } = await params;
  const { data } = await createAdminClient({ revalidate: 20 })
    .from("units")
    .select("name, facility_types(name), branches(name, short_name)")
    .eq("unit_id", unit_id)
    .maybeSingle()
    .then((r) => r, () => ({ data: null }));
  if (!data) return { title: "Unit tidak ditemukan" };
  const where = data.branches?.short_name ?? data.branches?.name;
  return {
    title: `${data.name}${where ? ` — ${where}` : ""} — Klub Sukaria`,
    description: `Cek status dan tarif ${data.name}${data.facility_types?.name ? ` (${data.facility_types.name})` : ""} lalu booking langsung.`,
  };
}

/**
 * Unit detail.
 *
 * Keyed on unit_id rather than a name slug: names repeat across branches
 * (both Batu 5 and Ganet have a "VIP 02"), so a name-based route would be
 * ambiguous. unit_id is the primary key and is already what the booking links
 * carry.
 */
export default async function UnitDetailPage({ params }: Props) {
  const { unit_id } = await params;
  const db = createAdminClient({ revalidate: 20 });

  const { data: unit, error } = await db
    .from("units")
    .select(
      "unit_id, image_url, name, status, condition, branch_id, facility_type_id, branches(name, short_name, address), facility_types(code, name, platform, category)",
    )
    .eq("unit_id", unit_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!unit) notFound();

  const bookable = unit.status !== "MAINTENANCE" && unit.status !== "OFFLINE";
  const available = unit.status === "AVAILABLE";

  // Three independent reads, so one round trip instead of two in series. `next_available`
  // is skipped for a unit that is free now or out of service (no useful answer either
  // way), and both it and the sibling lookup degrade to empty instead of taking the whole
  // page down: they are garnish on a page whose core data already loaded.
  const [branches, rates, free, others] = await Promise.all([
    getBranches(),
    getMinHourlyRates(),
    !available && bookable
      ? db
          .rpc("next_available", { p_unit_id: unit.unit_id, p_from: new Date().toISOString() })
          .then((r) => (r.data as string | null) ?? null, () => null)
      : Promise.resolve(null),
    // Same outlet, same kind of machine, free right now: the answer to "this one is busy".
    db
      .from("units")
      .select("unit_id, name, image_url")
      .eq("branch_id", unit.branch_id)
      .eq("facility_type_id", unit.facility_type_id)
      .eq("status", "AVAILABLE")
      .neq("unit_id", unit.unit_id)
      .limit(4)
      .then((r) => r.data ?? [], () => []),
  ]);
  const branch = branches.find((b) => b.branch_id === unit.branch_id);

  const code = unit.facility_types?.code ?? "";
  const copy = facilityCopy(code, {
    tag: unit.facility_types?.name ?? "Unit Konsol",
    players: "Multi Player",
    desc: "Unit konsol dengan setup standar.",
    cta: "Booking Unit",
  });
  const rate = rates[unit.facility_type_id];
  const statusText = STATUS_TEXT[unit.status] ?? unit.status;
  const tone = STATUS_TONE[unit.status] ?? TONE_FALLBACK;
  const bookingHref = `/booking?unit=${unit.unit_id}&branch=${unit.branch_id}`;
  const branchName = branch ? (branch.short_name ?? branch.name) : unit.branch_id;

  return (
    <div className={cn("relative mx-auto max-w-5xl px-4 py-10 md:px-8", bookable && "pb-28 lg:pb-10")}>
      {/* Ambient glow, tinted by status: green when you can play now. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-x-0 -top-6 -z-10 h-72",
          available
            ? "bg-[radial-gradient(45rem_14rem_at_30%_0%,theme(colors.primary/18%),transparent)]"
            : "bg-[radial-gradient(45rem_14rem_at_30%_0%,theme(colors.primary/8%),transparent)]",
        )}
      />

      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Tempat Main", href: "/tempat-main" },
          ...(branch ? [{ label: branch.short_name ?? branch.name, href: `/cabang/${branch.branch_id}` }] : []),
          { label: unit.name },
        ]}
      />

      <StatCards
        cards={[
          {
            label: "Status",
            value: statusText,
            tone: available ? "primary" : unit.status === "IN_USE" || unit.status === "BOOKED" ? "warning" : "muted",
            icon: Monitor,
            hint: available ? "bisa langsung gas" : "cek jadwal",
          },
          {
            label: "Tarif / jam",
            value: rate != null ? rp(rate) : "—",
            tone: "primary",
            icon: Wallet,
            hint: "harga dasar per jam",
          },
          { label: "Kapasitas", value: copy.players, icon: Users, hint: "pemain" },
          {
            label: "Cabang",
            value: branch?.short_name ?? branch?.name ?? "—",
            icon: MapPin,
            href: branch ? `/cabang/${branch.branch_id}` : undefined,
            hint: branch?.operating_hours ?? undefined,
          },
        ]}
      />

      <div className="mt-8 flex flex-col gap-8 lg:flex-row">
        <div className="min-w-0 flex-1">
          {unit.image_url ? (
            <div className="group relative mb-6 overflow-hidden rounded-xl border border-border shadow-lg shadow-primary/10">
              <div className="transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none">
                <Cover
                  seed={unit.unit_id}
                  src={unit.image_url}
                  label={unit.name}
                  alt={`${unit.name} — ${unit.facility_types?.name ?? "unit"}`}
                  priority
                  className="aspect-3/2 w-full"
                />
              </div>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent" />
              {/* Status on the photo itself, so the first thing seen is "can I play". */}
              <span
                className={cn(
                  "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ring-1 backdrop-blur-sm",
                  tone.chip,
                )}
              >
                <span aria-hidden className="relative flex size-2">
                  {available && (
                    <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none", tone.dot)} />
                  )}
                  <span className={cn("relative inline-flex size-2 rounded-full", tone.dot)} />
                </span>
                {statusText}
              </span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/40 bg-primary/12 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              {copy.tag}
            </span>
            <PlatformPill platform={unit.facility_types?.platform ?? ""} />
          </div>

          <h1 className="font-display mt-3 text-4xl uppercase leading-none md:text-6xl">{unit.name}</h1>
          <p className="mt-2 text-muted-foreground">{unit.facility_types?.name}</p>

          <p className="mt-4 max-w-2xl text-on-surface-variant">{copy.desc}</p>

          {rate != null && (
            <div className="mt-6 inline-flex items-baseline gap-2 rounded-xl bg-gradient-to-r from-primary/15 to-transparent px-4 py-3 ring-1 ring-primary/25">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">Mulai</span>
              <span className="font-display text-3xl uppercase text-primary">{rp(rate)}</span>
              <span className="text-sm text-muted-foreground">/jam</span>
            </div>
          )}

          {/* Capacity and location already sit in the stat row above, so repeating them
              here was dead weight. `condition` was selected but never shown; it earns
              the slot instead. */}
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            <Fact label="Kondisi unit" value={unit.condition ? humanize(String(unit.condition)) : "Standar"} icon={Gauge} />
            <Fact label="Lokasi" value={branchName} icon={MapPin} />
          </dl>
        </div>

        <aside
          className={cn(
            "h-fit w-full rounded-xl border p-5 shadow-arcade-sm lg:sticky lg:top-24 lg:w-80",
            available ? "border-primary/40 bg-primary/5" : "border-border bg-card",
          )}
        >
          <UnitStatusPill status={unit.status} />

          <p className="mt-3 text-sm text-muted-foreground">
            {available ? (
              <span className="text-primary">Siap main sekarang</span>
            ) : free ? (
              <>
                Kosong pukul <span className="text-foreground">{fmtTime(free)}</span>
              </>
            ) : bookable ? (
              "Jadwal untuk hari ini sudah penuh"
            ) : null}
          </p>
          {free && !available && (
            <div className="mt-2">
              <CountdownBadge endsAt={free} expiredLabel="SIAP SEKARANG" />
            </div>
          )}

          {bookable ? (
            <Button asChild size="lg" className="group/cta mt-5 w-full shadow-arcade">
              <Link href={bookingHref}>
                {copy.cta}{" "}
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover/cta:translate-x-1 motion-reduce:transition-none" />
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

      {others.length > 0 && (
        <section className="mt-12" aria-labelledby="unit-lain">
          <p className="font-display text-xs uppercase tracking-widest text-primary">
            {available ? "Mabar bareng" : "Jangan nunggu"}
          </p>
          <h2 id="unit-lain" className="font-display mt-1 text-xl uppercase md:text-2xl">
            {available ? "Unit Serupa yang Juga Kosong" : "Unit Serupa yang Siap Sekarang"}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {others.map((o) => (
              <Link key={o.unit_id} href={`/tempat-main/${o.unit_id}`} className="group min-w-0">
                <div className="overflow-hidden rounded-lg border border-border transition duration-300 group-hover:-translate-y-1 group-hover:border-primary group-hover:shadow-lg group-hover:shadow-primary/10 motion-reduce:transition-none">
                  <Cover seed={o.unit_id} src={o.image_url} label={o.name} className="aspect-3/2 w-full" />
                </div>
                <p className="font-display mt-1.5 flex items-center gap-1.5 truncate text-xs uppercase group-hover:text-primary">
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {o.name}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

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

      {/* Phones: the booking card sits below the fold, so keep the action in thumb reach. */}
      {bookable && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-background/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md lg:hidden">
          <div className="min-w-0 flex-1">
            <p className="font-display truncate text-sm uppercase">{unit.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {rate != null ? `${rp(rate)}/jam · ` : ""}
              {statusText}
            </p>
          </div>
          <Button asChild>
            <Link href={bookingHref}>
              {copy.cta} <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: Readonly<{
  label: string;
  value: string;
  icon: typeof Users;
}>) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden className="size-3.5 text-primary" />
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}