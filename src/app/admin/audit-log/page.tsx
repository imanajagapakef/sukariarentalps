import { createClient } from "@/lib/supabase/server";
import { fmtDateTime, rp } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { SelectField } from "@/components/ui/select-field";
import { StatCards } from "@/components/admin/stat-cards";

/**
 * Append-only activity trail. Read through the cookie-scoped client so the
 * audit_logs RLS policy (OWNER/ADMIN) is what actually authorises this page —
 * the sidebar link is only a convenience, not the gate.
 */
export const dynamic = "force-dynamic";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string }>;
}) {
  const { q, entity } = await searchParams;
  const db = await createClient();

  const { data, error } = await db
    .from("audit_logs")
    .select(
      "id, actor_id, actor_role, action, entity_type, entity_id, reason, before_data, after_data, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  const needle = (q ?? "").toLowerCase().trim();
  const rows = (data ?? []).filter((r) => {
    if (entity && r.entity_type !== entity) return false;
    if (!needle) return true;
    return [r.action, r.entity_type, r.entity_id, r.reason]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });

    const entities = [...new Set((data ?? []).map((r) => r.entity_type).filter(Boolean))].sort();
    const actors = new Set((data ?? []).map((r) => r.actor_id).filter(Boolean)).size;
    const lastAt = rows[0]?.created_at;

    return (
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <p className="font-display text-sm uppercase tracking-[0.06em] text-primary">Akses &amp; Keamanan</p>
        <h1 className="font-display mt-2 text-3xl uppercase md:text-4xl">Audit Log</h1>
        <StatCards
          cards={[
            { label: "Entri dimuat", value: data?.length ?? 0 },
            { label: "Setelah filter", value: rows.length },
            { label: "Jenis entitas", value: entities.length },
            { label: "Pelaku", value: actors },
            { label: "Terakhir", value: lastAt ? fmtDateTime(lastAt) : "—" },
          ]}
        />
      <p className="mt-2 text-muted-foreground">
        {rows.length} dari {data?.length ?? 0} entri terakhir. Log bersifat append-only — tidak bisa diedit atau
        dihapus dari aplikasi.
      </p>

      <form className="mt-5 flex flex-wrap items-center gap-2" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Cari aksi, entitas, atau alasan…"
          aria-label="Cari audit log"
          className="h-10 w-full max-w-xs rounded-lg border border-input bg-card px-3 text-sm"
        />
        <SelectField
          name="entity"
          defaultValue={entity ?? ""}
          aria-label="Filter entitas"
          className="w-auto"
        >
          <option value="">Semua entitas</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </SelectField>
        <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Belum ada entri" description="Coba longgarkan filterpencarian." />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Waktu</th>
                <th scope="col" className="px-4 py-3">Aktor</th>
                <th scope="col" className="px-4 py-3">Aksi</th>
                <th scope="col" className="px-4 py-3">Entitas</th>
                <th scope="col" className="px-4 py-3">Perubahan</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {fmtDateTime(r.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium">{r.actor_role ?? "—"}</span>
                    {r.actor_id && (
                      <span className="block text-xs text-muted-foreground">
                        {r.actor_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-display uppercase">{r.action}</span>
                    {r.reason && <span className="block text-xs text-muted-foreground">{r.reason}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.entity_type}
                    {r.entity_id && (
                      <span className="block text-xs text-muted-foreground">{r.entity_id}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Diff before={r.before_data} after={r.after_data} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Show only the keys that actually changed, so the column stays readable. */
function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];

  if (keys.length === 0) return <span className="text-muted-foreground">—</span>;

  const changed = keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));

  if (changed.length === 0) {
    return <span className="text-muted-foreground">{keys.length} field, tanpa perubahan</span>;
  }

  return (
    <ul className="space-y-0.5">
      {changed.slice(0, 4).map((k) => (
        <li key={k} className="text-xs">
          <span className="text-muted-foreground">{k}:</span>{" "}
          <span className="text-danger line-through">{fmt(b[k])}</span>{" "}
          <span aria-hidden className="text-muted-foreground">→</span>{" "}
          <span className="text-primary">{fmt(a[k])}</span>
        </li>
      ))}
      {changed.length > 4 && (
        <li className="text-xs text-muted-foreground">+{changed.length - 4} field lain</li>
      )}
    </ul>
  );
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "kosong";
  if (typeof v === "number") return v >= 1000 ? rp(v) : String(v);
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}
