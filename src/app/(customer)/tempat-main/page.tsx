import Link from "next/link";
import { PageHero } from "@/components/page-hero";
import { Monitor, Store, Zap } from "lucide-react";
import { StatCards } from "@/components/stat-cards";
import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { EmptyState } from "@/components/empty-state";
import { LiveUnits } from "@/components/live-units";
import { StationCard } from "@/components/kit/station-card";
import { TempatMainHeroAnimation } from "@/components/tempat-main-hero-animation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNextFreeMapByBranch } from "@/lib/next-free";
import { cn } from "@/lib/utils";

// Data cache 20 detik. `?branch=` makes the route render per request, but the fetch
// cache still covers every PostgREST call, which is the part that costs 40-70 ms.
export const revalidate = 20;

const CHIP_BASE = "shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors";
const CHIP_ON = "border-primary bg-primary/10 font-semibold text-primary";
const CHIP_OFF = "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground";

// Free machines first, then the ones about to be: the page is a "where can I play" list,
// so the answer should be at the top instead of wherever the DB happened to put it.
const STATUS_RANK: Record<string, number> = { AVAILABLE: 0, IN_USE: 1, BOOKED: 2 };
const rank = (status: string) => STATUS_RANK[status] ?? 3;

export default async function TempatMainPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string; ready?: string }>;
}) {
  const { branch, ready } = await searchParams;
  const db = createAdminClient({ revalidate: 20 });
  // One wave. The RPC resolves the busy units itself, so nothing here has to wait for
  // the catalogue; it used to be a second round trip on the slowest public route.
  const [branches, units, nextFree] = await Promise.all([
    getBranches(),
    getUnitsWithFacility(),
    getNextFreeMapByBranch(db, null),
  ]);

  // An unknown ?branch= used to render an empty list with no chip highlighted and no way
  // to tell why. Drop it and fall back to every outlet.
  const branchId = branch && branches.some((b) => b.branch_id === branch) ? branch : undefined;
  const readyOnly = ready === "1";

  const inBranch = branchId ? units.filter((u) => u.branch_id === branchId) : units;
  const available = inBranch.filter((u) => u.status === "AVAILABLE").length;
  const inUse = inBranch.filter((u) => u.status === "IN_USE").length;
  const other = inBranch.length - available - inUse;

  const shown = (readyOnly ? inBranch.filter((u) => u.status === "AVAILABLE") : inBranch)
    .map((u, i) => ({ u, i }))
    // index as tiebreak: Array.sort is stable today, but this keeps the order explicit
    .sort((a, b) => rank(a.u.status) - rank(b.u.status) || a.i - b.i)
    .map(({ u }) => u);

  const readyByBranch = new Map<string, number>();
  for (const u of units) {
    if (u.status === "AVAILABLE") readyByBranch.set(u.branch_id, (readyByBranch.get(u.branch_id) ?? 0) + 1);
  }

  /** Every filter link keeps the other filter, instead of resetting it. */
  const href = (next: { branch?: string | null; ready?: boolean }) => {
    const b = next.branch === undefined ? branchId : (next.branch ?? undefined);
    const r = next.ready === undefined ? readyOnly : next.ready;
    const p = new URLSearchParams();
    if (b) p.set("branch", b);
    if (r) p.set("ready", "1");
    const s = p.toString();
    return s ? `/tempat-main?${s}` : "/tempat-main";
  };

  // With no outlet picked, group by outlet so a long list has landmarks. A unit whose
  // branch is not in the active list still shows, under "Lainnya", rather than vanishing.
  const groups: { key: string; title: string | null; units: typeof shown }[] = branchId
    ? [{ key: branchId, title: null, units: shown }]
    : [
        ...branches.map((b) => ({
          key: b.branch_id,
          title: b.short_name ?? b.name,
          units: shown.filter((u) => u.branch_id === b.branch_id),
        })),
        {
          key: "__other",
          title: "Lainnya",
          units: shown.filter((u) => !branches.some((b) => b.branch_id === u.branch_id)),
        },
      ].filter((g) => g.units.length > 0);

  const pct = (n: number) => (inBranch.length ? (n / inBranch.length) * 100 : 0);

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-10 md:px-8">
      {/* Ambient glow: CSS only, no layout cost. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-80 bg-[radial-gradient(50rem_16rem_at_50%_0%,theme(colors.primary/15%),transparent)]"
      />

      <LiveUnits />
      <PageHero
        className="mt-6"
        eyebrow={{ icon: Zap, label: `${inBranch.length} unit · live` }}
        title="Tempat Main"
        titleIcon={Monitor}
        description={
          <span className="flex items-center gap-2">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            Status langsung per unit. Hijau = bisa langsung gas.
          </span>
        }
        aside={<TempatMainHeroAnimation className="h-24 w-full md:h-44 md:w-120 shrink-0" />}
      />

      <StatCards
        cards={[
          {
            label: "Siap dipakai",
            value: available,
            tone: available > 0 ? "primary" : "muted",
            icon: Zap,
            hint: "hijau = bisa langsung",
          },
          { label: "Lagi dipakai", value: inUse, icon: Monitor, hint: "sedang dimainkan" },
          { label: "Unit tampil", value: shown.length, icon: Monitor, hint: branchId ? "cabang terpilih" : "semua cabang" },
          { label: "Cabang", value: branches.length, icon: Store, href: "/cabang", hint: "lokasi aktif" },
        ]}
      />

      {/* Live occupancy bar: how busy it is, in one glance, before reading any card. */}
      {inBranch.length > 0 && (
        <div className="mt-6 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${available} siap, ${inUse} dipakai, ${other} lainnya dari ${inBranch.length} unit`}
          >
            <span className="h-full bg-emerald-400 transition-all duration-700 motion-reduce:transition-none" style={{ width: `${pct(available)}%` }} />
            <span className="h-full bg-amber-400 transition-all duration-700 motion-reduce:transition-none" style={{ width: `${pct(inUse)}%` }} />
            <span className="h-full bg-muted-foreground/30" style={{ width: `${pct(other)}%` }} />
          </div>
          <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-emerald-400" />
              <strong className="font-mono text-foreground">{available}</strong> siap
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full bg-amber-400" />
              <strong className="font-mono text-foreground">{inUse}</strong> dipakai
            </li>
            {other > 0 && (
              <li className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full bg-muted-foreground/40" />
                <strong className="font-mono text-foreground">{other}</strong> dipesan / nonaktif
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Branch chips: real client-side links (the old <a> forced a full reload on every
          tap), each carrying a live "siap" count. One scrolling row on phones. */}
      <div className="-mx-4 mt-6 flex items-center gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
        <Link href={href({ branch: null })} aria-current={!branchId ? "true" : undefined} className={cn(CHIP_BASE, !branchId ? CHIP_ON : CHIP_OFF)}>
          Semua Cabang
        </Link>
        {branches.map((b) => {
          const on = branchId === b.branch_id;
          const n = readyByBranch.get(b.branch_id) ?? 0;
          return (
            <Link key={b.branch_id} href={href({ branch: b.branch_id })} aria-current={on ? "true" : undefined} className={cn(CHIP_BASE, on ? CHIP_ON : CHIP_OFF)}>
              {b.short_name ?? b.name}{" "}
              <span className={cn("ml-1 inline-flex items-center gap-1 font-mono text-xs", n > 0 ? "text-emerald-500" : "opacity-50")}>
                <span aria-hidden className={cn("size-1.5 rounded-full", n > 0 ? "bg-emerald-400" : "bg-muted-foreground/50")} />
                {n}
              </span>
            </Link>
          );
        })}
        <span aria-hidden className="mx-1 hidden h-5 w-px shrink-0 bg-border md:block" />
        <Link
          href={href({ ready: !readyOnly })}
          aria-pressed={readyOnly}
          className={cn(CHIP_BASE, "inline-flex items-center gap-1.5", readyOnly ? CHIP_ON : CHIP_OFF)}
        >
          <Zap aria-hidden className="size-3.5" />
          Siap sekarang saja
        </Link>
      </div>

      {shown.length === 0 ? (
        <div className="mt-8">
          {readyOnly ? (
            // The filter is the reason for the empty page, so say that and offer the way out.
            <>
              <EmptyState title="Semua unit lagi dipakai" description="Belum ada yang kosong sekarang. Lihat jadwal kosong berikutnya di tiap unit." />
              <p className="mt-4 text-center text-sm">
                <Link href={href({ ready: false })} className="font-medium text-primary underline-offset-2 hover:underline">
                  Tampilkan semua unit
                </Link>
              </p>
            </>
          ) : (
            <EmptyState title="Belum ada unit" description="Coba pilih cabang lain." />
          )}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((g) => {
            const ready = g.units.filter((u) => u.status === "AVAILABLE").length;
            return (
              <section key={g.key} aria-label={g.title ?? undefined}>
                {g.title && (
                  <div className="mb-4 flex items-center gap-3">
                    <h2 className="font-display text-lg uppercase md:text-xl">{g.title}</h2>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1",
                        ready > 0 ? "bg-emerald-400/10 text-emerald-500 ring-emerald-400/30" : "bg-muted text-muted-foreground ring-border",
                      )}
                    >
                      {ready > 0 ? `${ready} siap` : "penuh"}
                    </span>
                    <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.units.map((u) => (
                    <StationCard key={u.unit_id} unit={u} nextFree={nextFree.get(u.unit_id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}