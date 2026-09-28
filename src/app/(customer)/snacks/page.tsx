import { getSnacks } from "@/lib/catalog";
import { Cover } from "@/components/cover";
import { rp } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";

export default async function SnacksPage() {
  const snacks = await getSnacks();
  const byCategory = snacks.reduce<Record<string, typeof snacks>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <h1 className="font-display text-3xl uppercase md:text-5xl">Snacks & Drinks</h1>
      <p className="mt-2 text-muted-foreground">Tinggal ambil di kasir saat check-in atau request lewat staff.</p>

      {snacks.length === 0 ? (
        <div className="mt-8">
          <EmptyState title="Belum ada menu" />
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, items]) => (
          <section key={cat} className="mt-10">
            <h2 className="font-display text-xl uppercase text-primary">{cat}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((s) => (
                <div key={s.snack_id} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                  <Cover seed={s.snack_id} label={s.name} className="size-14 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-sm text-primary">{rp(s.price)}</p>
                  </div>
                  {s.stock <= s.min_stock && <span className="text-xs text-warning">stok tipis</span>}
                  {s.stock === 0 && <span className="text-xs text-danger">habis</span>}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
