import { getUnitsWithFacility } from "@/lib/catalog";
import { UnitStatusPill } from "@/components/status-pill";
import { UnitActions } from "@/components/admin/unit-actions";

export const dynamic = "force-dynamic";

export default async function AdminUnitsPage({ searchParams }: { searchParams: Promise<{ unit?: string }> }) {
  const { unit } = await searchParams;
  const units = await getUnitsWithFacility();

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Unit</h1>
      <p className="mt-1 text-sm text-muted-foreground">Tandai maintenance/offline saat rusak, aktifkan lagi setelah siap.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {units.map((u) => (
          <div key={u.unit_id} className={`rounded-lg border p-3 ${unit === u.unit_id ? "border-primary" : "border-border"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">
                  {u.branches?.short_name ?? u.branches?.name} · {u.facility_types?.name}
                </p>
              </div>
              <UnitStatusPill status={u.status} />
            </div>
            <UnitActions unitId={u.unit_id} status={u.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
