import { PageHero } from "@/components/page-hero";
import Link from "next/link";
import { CalendarClock, CircleCheck, Gamepad2, LayoutGrid, List, Power, RotateCcw, Search, Sparkles, TriangleAlert, Wrench, X, Zap, ExternalLink } from "lucide-react";
import { UnitStatusPill } from "@/components/status-pill";
import { UnitActions } from "@/components/admin/unit-actions";
import { UnitPhoto } from "@/components/admin/unit-photo";
import { StatCards } from "@/components/stat-cards";
import { TablePagination } from "@/components/admin/table-pagination";
import { SelectField } from "@/components/ui/select-field";
import { EmptyState } from "@/components/empty-state";
import {
  UNIT_SORTS,
  UNIT_STATUSES,
  getBranchOptions,
  listUnitsPage,
  unitStatusBreakdown,
  type UnitFilters,
} from "@/lib/units-query";
import { UNIT_LABEL, UNIT_TONE } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SORT_LABEL: Record<string, string> = {
  unit_id: "Kode",
  name: "Nama",
  status: "Status",
  condition: "Kondisi",
};

const STRIPE: Record<string, string> = {
  success: "bg-primary",
  warning: "bg-amber",
  danger: "bg-coral",
  neutral: "bg-muted-foreground/40",
};

// urutan & warna segmen di bar okupansi
const SEGMENTS = [
  { key: "IN_USE", bar: "bg-primary" },
  { key: "BOOKED", bar: "bg-amber" },
  { key: "IN_ORDER", bar: "bg-primary/50" },
  { key: "AVAILABLE", bar: "bg-muted-foreground/30" },
  { key: "MAINTENANCE", bar: "bg-coral" },
  { key: "OFFLINE", bar: "bg-border" },
] as const;

const chipBase =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors";
const chipOff = "border-border bg-background/60 text-muted-foreground hover:border-primary/60 hover:text-foreground";
const chipOn = "border-primary bg-primary text-primary-foreground";
const removable =
  "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary hover:bg-primary/20";

export default async function AdminUnitsPage({
  searchParams,
}: {
  searchParams: Promise<UnitFilters & { page?: string; view?: string }>;
}) {
  // `page` belongs to this view only and must not travel into the filters, or a sort
  // link would carry it and the table would stay on a page the new sort may not have.
  // `view` (tabel/kartu) is presentation only, so it stays out of the query too.
  const { page: pageParam, view: viewParam, ...filters } = await searchParams;
  const view = viewParam === "grid" ? "grid" : "table";

  const { rows: units, total, page, pageCount, from, to } = await listUnitsPage(
    filters,
    Number(pageParam ?? "1"),
  );
  // Status counts come off the filtered set (one light query over the status column),
  // not off the page — otherwise every card would describe ten rows, not the fleet.
  const [byStatus, branches] = await Promise.all([unitStatusBreakdown(filters), getBranchOptions()]);

  const by = (s: string) => byStatus[s] ?? 0;
  const outOfService = by("MAINTENANCE") + by("OFFLINE");
  const filtered = Boolean(filters.q || filters.branch || filters.status);

  // Okupansi dihitung dari unit yang memang bisa dipakai (di luar maintenance/offline).
  const fleet = Object.values(byStatus).reduce((a, n) => a + n, 0);
  const operational = Math.max(0, fleet - outOfService);
  const busy = by("IN_USE") + by("BOOKED");
  const occupancy = operational ? Math.round((busy / operational) * 100) : 0;

  const activeSort = UNIT_SORTS.includes(filters.sort as never) ? filters.sort! : "unit_id";
  const dir = filters.dir === "desc" ? "desc" : "asc";

  // Setelah filter status aktif, hitungan di chip lain akan 0 (set-nya sudah terfilter),
  // jadi angka chip hanya ditampilkan saat tidak ada filter status.
  const showCounts = !filters.status;
  const branchLabel = branches.find((b) => b.branch_id === filters.branch);

  /** Keep the other filters while changing one, so sorting never drops a filter. */
  const hrefWith = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
    if (view === "grid") params.set("view", "grid");
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    return qs ? `/admin/units?${qs}` : "/admin/units";
  };

  const sortHref = (column: string) =>
    hrefWith({ sort: column, dir: activeSort === column && dir === "asc" ? "desc" : "asc" });

  // Plain function, not a component: a component declared inside render is a new type
  // on every render and would remount its subtree each time.
  const sortHeader = (column: string) => (
    <th scope="col" className="px-4 py-3 font-semibold">
      <Link
        href={sortHref(column)}
        className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
        aria-sort={activeSort === column ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {SORT_LABEL[column]}
        <span aria-hidden className={activeSort === column ? "text-primary" : "opacity-30"}>
          {activeSort === column && dir === "desc" ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );

  const resetHref = view === "grid" ? "/admin/units?view=grid" : "/admin/units";

  return (
    <div className="space-y-6">
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
              Armada · {total} unit{filtered ? " (terfilter)" : ""}
            </>
          ),
        }}
        title="Unit"
        titleIcon={Gamepad2}
        description="Tandai maintenance/offline saat rusak, aktifkan lagi setelah siap."
        actions={
          <>
            <Link
              href={hrefWith({ status: "AVAILABLE" })}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-transform hover:scale-105"
            >
              <CircleCheck aria-hidden className="size-4" /> {by("AVAILABLE")} siap dipakai
            </Link>
            {outOfService > 0 && (
              <Link
                href={hrefWith({ status: by("MAINTENANCE") ? "MAINTENANCE" : "OFFLINE" })}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-coral/40 bg-coral/10 px-4 text-sm font-medium text-coral transition-colors hover:bg-coral/20"
              >
                <Wrench aria-hidden className="size-4" /> {outOfService} tidak bisa dipakai
              </Link>
            )}
            <Link
              href="/tempat-main"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background/60 px-4 text-sm font-medium backdrop-blur transition-colors hover:border-primary"
            >
              <ExternalLink aria-hidden className="size-4" /> Halaman publik
            </Link>
          </>
        }
        aside={
          <div className="w-full sm:w-72">
            <div className="flex items-end justify-between">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Okupansi {filtered ? "terfilter" : "armada"}
              </p>
              <p className="font-display text-5xl leading-none tabular-nums text-primary">
                {occupancy}
                <span className="text-2xl">%</span>
              </p>
            </div>
            <div
              role="img"
              aria-label={`Okupansi ${occupancy} persen`}
              className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted"
            >
              {SEGMENTS.map((s) => {
                const n = by(s.key);
                if (!n || !fleet) return null;
                return (
                  <div
                    key={s.key}
                    className={cn("h-full", s.bar)}
                    style={{ width: `${(n / fleet) * 100}%` }}
                    title={`${UNIT_LABEL[s.key] ?? s.key}: ${n}`}
                  />
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {SEGMENTS.filter((s) => by(s.key)).map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn("size-2 rounded-full", s.bar)} />
                  {UNIT_LABEL[s.key] ?? s.key} {by(s.key)}
                </span>
              ))}
            </div>
          </div>
        }
      />

      {/* ============================= KPI ============================ */}
      <StatCards
        className="mt-0! lg:grid-cols-6"
        cards={[
          { label: filtered ? "Unit terfilter" : "Total unit", value: total, icon: Gamepad2, hint: filtered ? "sesuai filter" : "seluruh armada" },
          { label: "Tersedia", value: by("AVAILABLE"), tone: "primary", icon: CircleCheck, href: hrefWith({ status: "AVAILABLE" }), hint: "siap dipakai" },
          { label: "Dipesan", value: by("BOOKED"), icon: CalendarClock, href: hrefWith({ status: "BOOKED" }), hint: "sudah ada booking" },
          { label: "Sedang dipakai", value: by("IN_USE"), icon: Zap, href: hrefWith({ status: "IN_USE" }), hint: "lagi main" },
          {
            label: "Antrian / dibersihkan",
            value: by("IN_ORDER"),
            tone: by("IN_ORDER") > 0 ? "warning" : "muted",
            icon: Sparkles,
            href: hrefWith({ status: "IN_ORDER" }),
            hint: by("IN_ORDER") > 0 ? "tunggu Set Ready" : "tidak ada antrean",
          },
          {
            label: "Maintenance / Offline",
            value: outOfService,
            tone: outOfService > 0 ? "warning" : "muted",
            icon: Wrench,
            hint: outOfService > 0 ? `${by("MAINTENANCE")} maintenance · ${by("OFFLINE")} offline` : "semua unit sehat",
          },
        ]}
      />

      {/* ====================== FILTER + CHIP + VIEW ================== */}
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          {/* chip status: satu klik, tanpa dropdown */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3">
            <Link
              href={hrefWith({ status: "" })}
              aria-current={!filters.status ? "true" : undefined}
              className={cn(chipBase, !filters.status ? chipOn : chipOff)}
            >
              Semua
            </Link>
            {UNIT_STATUSES.map((s) => {
              const active = filters.status === s;
              return (
                <Link
                  key={s}
                  href={hrefWith({ status: s })}
                  aria-current={active ? "true" : undefined}
                  className={cn(chipBase, active ? chipOn : chipOff)}
                >
                  {UNIT_LABEL[s] ?? s}
                  {showCounts && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
                        active ? "bg-primary-foreground/20" : "bg-muted",
                      )}
                    >
                      {by(s)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* toggle tampilan */}
          <div role="group" aria-label="Tampilan" className="flex shrink-0 overflow-hidden rounded-full border border-border">
            <Link
              href={hrefWith({ view: "" })}
              aria-current={view === "table" ? "true" : undefined}
              aria-label="Tampilan tabel"
              className={cn("grid size-9 place-items-center transition-colors", view === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <List aria-hidden className="size-4" />
            </Link>
            <Link
              href={hrefWith({ view: "grid" })}
              aria-current={view === "grid" ? "true" : undefined}
              aria-label="Tampilan kartu"
              className={cn("grid size-9 place-items-center transition-colors", view === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              <LayoutGrid aria-hidden className="size-4" />
            </Link>
          </div>
        </div>

        <form className="flex flex-wrap gap-2" method="get">
          <label className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={filters.q}
              placeholder="Kode atau nama unit"
              aria-label="Cari unit"
              className="h-12 w-56 rounded-lg border border-input bg-background pl-9 pr-3 text-sm focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <SelectField name="branch" defaultValue={filters.branch ?? ""} aria-label="Cabang" className="w-auto">
            <option value="">Semua cabang</option>
            {branches.map((b) => (
              <option key={b.branch_id} value={b.branch_id}>
                {b.short_name ?? b.name}
              </option>
            ))}
          </SelectField>
          <SelectField name="status" defaultValue={filters.status ?? ""} aria-label="Status" className="w-auto">
            <option value="">Semua status</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {UNIT_LABEL[s] ?? s}
              </option>
            ))}
          </SelectField>
          {/* The form only submits named inputs, so a sort chosen in the table would be
              lost on the next Filter press unless it is carried here. */}
          <input type="hidden" name="sort" value={activeSort} />
          <input type="hidden" name="dir" value={dir} />
          {view === "grid" && <input type="hidden" name="view" value="grid" />}
          <button
            type="submit"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            <Search aria-hidden className="size-4" /> Cari
          </button>
          {filtered && (
            <Link
              href={resetHref}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              <RotateCcw aria-hidden className="size-4" /> Reset
            </Link>
          )}
        </form>

        {/* filter aktif, bisa dilepas satu per satu */}
        {filtered && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Filter aktif:</span>
            {filters.status && (
              <Link href={hrefWith({ status: "" })} className={removable}>
                {UNIT_LABEL[filters.status] ?? filters.status} <X className="size-3" aria-label="Hapus filter status" />
              </Link>
            )}
            {filters.branch && (
              <Link href={hrefWith({ branch: "" })} className={removable}>
                {branchLabel?.short_name ?? branchLabel?.name ?? "Cabang"} <X className="size-3" aria-label="Hapus filter cabang" />
              </Link>
            )}
            {filters.q && (
              <Link href={hrefWith({ q: "" })} className={removable}>
                “{filters.q}” <X className="size-3" aria-label="Hapus pencarian" />
              </Link>
            )}
          </div>
        )}

        {/* urutan untuk tampilan kartu (tabel sudah punya header yang bisa diklik) */}
        {view === "grid" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Urutkan:</span>
            {UNIT_SORTS.map((col) => (
              <Link
                key={col}
                href={sortHref(col)}
                aria-current={activeSort === col ? "true" : undefined}
                className={cn(
                  "rounded-full border px-2.5 py-1 font-medium transition-colors",
                  activeSort === col ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {SORT_LABEL[col] ?? col}
                {activeSort === col && <span aria-hidden> {dir === "desc" ? "▼" : "▲"}</span>}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ===================== PERLU PERHATIAN ======================== */}
      {!filters.status && (outOfService > 0 || by("IN_ORDER") > 0) && (
        <section aria-label="Perlu perhatian" className="rounded-2xl border border-amber/40 bg-amber/5 p-4">
          <h2 className="font-display flex items-center gap-2 text-lg uppercase">
            <TriangleAlert aria-hidden className="size-4 text-amber" /> Perlu Perhatian
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {by("MAINTENANCE") > 0 && (
              <li>
                <Link href={hrefWith({ status: "MAINTENANCE" })} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm transition-colors hover:text-primary">
                  <span className="inline-flex items-center gap-2"><Wrench aria-hidden className="size-4 text-coral" /> {by("MAINTENANCE")} unit maintenance</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            )}
            {by("OFFLINE") > 0 && (
              <li>
                <Link href={hrefWith({ status: "OFFLINE" })} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm transition-colors hover:text-primary">
                  <span className="inline-flex items-center gap-2"><Power aria-hidden className="size-4 text-coral" /> {by("OFFLINE")} unit offline</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            )}
            {by("IN_ORDER") > 0 && (
              <li>
                <Link href={hrefWith({ status: "IN_ORDER" })} className="flex items-center justify-between gap-3 rounded-lg bg-background/60 px-3 py-2 text-sm transition-colors hover:text-primary">
                  <span className="inline-flex items-center gap-2"><Sparkles aria-hidden className="size-4 text-amber" /> {by("IN_ORDER")} unit menunggu Set Ready</span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            )}
          </ul>
        </section>
      )}

      {/* ========================= DAFTAR UNIT ======================== */}
      {units.length === 0 ? (
        <EmptyState
          title="Tidak ada unit"
          description={filtered ? "Coba longgarkan filter pencarian." : "Belum ada unit terdaftar."}
          actionHref={filtered ? { label: "Reset filter", href: resetHref } : undefined}
        />
      ) : view === "grid" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {units.map((u) => {
            const tone = UNIT_TONE[u.status] ?? "neutral";
            const down = u.status === "MAINTENANCE" || u.status === "OFFLINE";
            return (
              <article
                key={u.unit_id}
                className={cn(
                  "group relative overflow-hidden rounded-xl border border-border bg-card p-4 pl-5 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
                  down && "bg-coral/5",
                )}
              >
                <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", STRIPE[tone], u.status === "IN_USE" && "animate-pulse")} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium">{u.name}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{u.unit_id}</span>
                      {u.facility_types?.platform && <span>{u.facility_types.platform}</span>}
                    </p>
                  </div>
                  <UnitStatusPill status={u.status} />
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="uppercase tracking-wider text-muted-foreground">Cabang</dt>
                    <dd className="mt-0.5 truncate font-medium">{u.branches?.short_name ?? u.branches?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wider text-muted-foreground">Tipe</dt>
                    <dd className="mt-0.5 truncate font-medium">{u.facility_types?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="uppercase tracking-wider text-muted-foreground">Kondisi</dt>
                    <dd className="mt-0.5 truncate font-medium uppercase">{u.condition}</dd>
                  </div>
                </dl>

                <div className="mt-3 flex flex-wrap items-start justify-between gap-3 border-t border-border pt-3">
                  <UnitPhoto unitId={u.unit_id} imageUrl={u.image_url} name={u.name} compact />
                  <UnitActions unitId={u.unit_id} status={u.status} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-208 text-sm">
            <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {sortHeader("unit_id")}
                {sortHeader("name")}
                <th scope="col" className="px-4 py-3 font-semibold">Cabang</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tipe</th>
                {sortHeader("condition")}
                {sortHeader("status")}
                <th scope="col" className="px-4 py-3 font-semibold">Foto</th>
                <th scope="col" className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => {
                const tone = UNIT_TONE[u.status] ?? "neutral";
                const down = u.status === "MAINTENANCE" || u.status === "OFFLINE";
                return (
                  <tr
                    key={u.unit_id}
                    className={cn(
                      "border-t border-border align-top transition-colors hover:bg-accent/40",
                      down && "bg-coral/5",
                    )}
                  >
                    {/* The code is the key, not the name: "Capsule 01" exists at both
                        Batu 5 and Ganet, so a name-only table has ambiguous rows. */}
                    <td className="relative whitespace-nowrap py-3 pl-5 pr-4">
                      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", STRIPE[tone], u.status === "IN_USE" && "animate-pulse")} />
                      <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{u.unit_id}</span>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {u.name}
                      <span className="block text-xs font-normal text-muted-foreground">
                        {u.facility_types?.platform}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                        {u.branches?.short_name ?? u.branches?.name ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.facility_types?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs font-medium uppercase text-muted-foreground">{u.condition}</td>
                    <td className="px-4 py-3">
                      <UnitStatusPill status={u.status} />
                    </td>
                    <td className="px-4 py-3">
                      <UnitPhoto unitId={u.unit_id} imageUrl={u.image_url} name={u.name} compact />
                    </td>
                    <td className="px-4 py-3">
                      <UnitActions unitId={u.unit_id} status={u.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TablePagination
        basePath="/admin/units"
        params={{
          q: filters.q,
          branch: filters.branch,
          status: filters.status,
          sort: activeSort,
          dir,
          view: view === "grid" ? "grid" : undefined,
        }}
        page={page}
        pageCount={pageCount}
        total={total}
        from={from}
        to={to}
        itemLabel="unit"
      />
    </div>
  );
}