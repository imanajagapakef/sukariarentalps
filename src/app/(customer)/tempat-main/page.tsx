import { getBranches, getUnitsWithFacility } from "@/lib/catalog";
import { UnitStatusPill } from "@/components/status-pill";
import { EmptyState } from "@/components/empty-state";
import { fmtTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

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
  const now = new Date();
  const nextFree = new Map<string, string | null>();
  await Promise.all(
    shown.map(async (u) => {
      if (u.status === "AVAILABLE") return;
      const { data } = await db.rpc("next_available", { p_unit_id: u.unit_id, p_from: now.toISOString() });
      nextFree.set(u.unit_id, data ?? null);
    }),
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-5xl">Tempat Main</h1>
      <p className="mt-2 text-muted-foreground">Status langsung per unit. Hijau = bisa langsung gas.</p>

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
          {shown.map((u) => {
            const free = nextFree.get(u.unit_id);
            return (
              <div key={u.unit_id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg uppercase leading-tight">{u.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.facility_types?.name} · {u.facility_types?.platform} · {u.branches?.short_name ?? u.branches?.name}
                    </p>
                  </div>
                  <UnitStatusPill status={u.status} />
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  {u.status === "AVAILABLE" || !free ? (
                    <p className="text-sm text-primary">{u.status === "AVAILABLE" ? "Langsung available" : "—"}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Kosong jam <span className="text-foreground">{fmtTime(free)}</span>
                    </p>
                  )}
                  <a
                    href={`/booking?unit=${u.unit_id}&branch=${u.branch_id}`}
                    className={u.status === "AVAILABLE" ? "text-sm font-medium text-primary hover:underline" : "text-sm text-muted-foreground hover:text-foreground"}
                  >
                    Booking →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
