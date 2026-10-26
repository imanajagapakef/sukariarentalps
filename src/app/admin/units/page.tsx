import Link from "next/link";
import { UnitStatusPill } from "@/components/status-pill";
import { UnitActions } from "@/components/admin/unit-actions";
import { UnitPhoto } from "@/components/admin/unit-photo";
import { StatCards } from "@/components/admin/stat-cards";
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
import { UNIT_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

const SORT_LABEL: Record<string, string> = {
  unit_id: "Kode",
  name: "Nama",
  status: "Status",
  condition: "Kondisi",
};

export default async function AdminUnitsPage({
  searchParams,
}: {
  searchParams: Promise<UnitFilters & { page?: string }>;
}) {
  // `page` belongs to this view only and must not travel into the filters, or a sort
  // link would carry it and the table would stay on a page the new sort may not have.
  const { page: pageParam, ...filters } = await searchParams;
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

  const activeSort = UNIT_SORTS.includes(filters.sort as never) ? filters.sort! : "unit_id";
  const dir = filters.dir === "desc" ? "desc" : "asc";

  /** Keep the other filters while changing one, so sorting never drops a filter. */
  const hrefWith = (patch: Record<string, string>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    return `/admin/units?${params.toString()}`;
  };

  const sortHref = (column: string) =>
    hrefWith({ sort: column, dir: activeSort === column && dir === "asc" ? "desc" : "asc" });

  const SortHeader = ({ column }: { column: string }) => (
    <th scope="col" className="px-4 py-3 font-semibold">
      <Link
        href={sortHref(column)}
        className="inline-flex items-center gap-1 hover:text-foreground"
        aria-sort={activeSort === column ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {SORT_LABEL[column]}
        <span aria-hidden className={activeSort === column ? "text-primary" : "opacity-30"}>
          {activeSort === column && dir === "desc" ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Unit</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tandai maintenance/offline saat rusak, aktifkan lagi setelah siap.
      </p>
      <StatCards
        cards={[
          { label: filtered ? "Unit terfilter" : "Total unit", value: total },
          { label: "Tersedia", value: by("AVAILABLE"), tone: "primary" },
          { label: "Dipesan", value: by("BOOKED") },
          { label: "Sedang dipakai", value: by("IN_USE") },
          { label: "Antrian / dibersihkan", value: by("IN_ORDER"), tone: by("IN_ORDER") > 0 ? "warning" : "muted" },
          {
            label: "Maintenance / Offline",
            value: outOfService,
            tone: outOfService > 0 ? "warning" : "muted",
          },
        ]}
      />

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input
          name="q"
          defaultValue={filters.q}
          placeholder="Kode atau nama unit"
          aria-label="Cari unit"
          className="h-12 w-52 rounded-lg border border-input bg-card px-3 text-sm"
        />
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
        <button type="submit" className="h-12 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
        {filtered && (
          <Link
            href="/admin/units"
            className="inline-flex h-12 items-center rounded-lg border border-input px-3 text-sm"
          >
            Reset
          </Link>
        )}
      </form>

      {units.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Tidak ada unit" description="Coba longgarkan filter pencarian." />
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-surface-container text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <SortHeader column="unit_id" />
                <SortHeader column="name" />
                <th scope="col" className="px-4 py-3 font-semibold">Cabang</th>
                <th scope="col" className="px-4 py-3 font-semibold">Tipe</th>
                <SortHeader column="condition" />
                <SortHeader column="status" />
                <th scope="col" className="px-4 py-3 font-semibold">Foto</th>
                <th scope="col" className="px-4 py-3 font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.unit_id} className="border-t border-border align-top hover:bg-accent/40">
                  {/* The code is the key, not the name: "Capsule 01" exists at both
                      Batu 5 and Ganet, so a name-only table has ambiguous rows. */}
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{u.unit_id}</td>
                  <td className="px-4 py-3 font-medium">
                    {u.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {u.facility_types?.platform}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {u.branches?.short_name ?? u.branches?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.facility_types?.name ?? "—"}</td>
                  <td className="px-4 py-3 uppercase text-muted-foreground">{u.condition}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <TablePagination
        basePath="/admin/units"
        params={{ q: filters.q, branch: filters.branch, status: filters.status, sort: activeSort, dir }}
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
