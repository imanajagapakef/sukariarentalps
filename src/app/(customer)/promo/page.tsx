import { getPromotions } from "@/lib/catalog";
import { rp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";

export default async function PromoPage() {
  const promos = await getPromotions();

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-5xl">Promo</h1>
      <p className="mt-2 text-muted-foreground">Paket hemat buat main lebih lama.</p>

      {promos.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Belum ada promo aktif" description="Cek lagi nanti ya." />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {promos.map((p) => (
            <div key={p.promotion_id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg uppercase">{p.name}</h2>
                <Badge variant="secondary" className="bg-primary/15 text-primary">
                  {p.status}
                </Badge>
              </div>
              {p.description && <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>}
              <ul className="mt-3 space-y-2 text-sm">
                {p.promotion_items.map((it, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>
                      {it.facility_types?.name ?? "Unit"} · {it.duration_minutes} menit
                    </span>
                    <span className="font-medium text-primary">{rp(it.price)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
