import Link from "next/link";
import { MapPin } from "lucide-react";
import { getPromoOfferings } from "@/lib/catalog";
import { bookingHref, savingOf } from "@/lib/promo-rules";
import { fmtDuration, rp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { PromoHeroAnimation } from "@/components/promo-hero-animation";

export const revalidate = 300;

/**
 * The promo list, as something you can book rather than something you read.
 *
 * Each package links straight into a booking that already satisfies it — same branch,
 * same facility type, duration pinned to the package (R5). Listing a price the form
 * then ignores is how a promo ends up looking available and being unbookable, which is
 * what this page existed as until now: a poster with no way in.
 *
 * The whole row is the link, not a button sitting under one: on a phone the row is
 * what the thumb is already aiming at, and a small button below a package name is the
 * version of this that loses the sale it is advertising. The link carries no aria-label
 * on purpose — the row's own text already names the package, the price and the saving,
 * and a label that repeats it makes a screen reader say everything twice.
 */
export default async function PromoPage() {
  const offers = await getPromoOfferings();

  // One card per promo, its items grouped under it, so the heading the customer reads
  // is the promo name and the choices underneath are the packages.
  const byPromo = new Map<string, typeof offers>();
  for (const o of offers) {
    const list = byPromo.get(o.promotion_id);
    if (list) list.push(o);
    else byPromo.set(o.promotion_id, [o]);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Promo</h1>
          <p className="mt-2 text-muted-foreground">
            Paket hemat buat main lebih lama. Tap paketnya, booking sudah terisi otomatis.
          </p>
        </div>
        <PromoHeroAnimation className="h-20 w-full md:h-44 md:w-120 shrink-0" />
      </div>

      {offers.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Belum ada promo aktif"
            description="Cek lagi nanti ya."
            actionHref={{ label: "Booking tanpa promo", href: "/booking" }}
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {[...byPromo.entries()].map(([promoId, items]) => {
            // "Paling hemat" only means something when there is a choice to make, and it
            // is decided on the raw ratio rather than the rounded percentage shown below,
            // so two packages at 8.4% and 8.6% are not both rounded into a tie and neither
            // is crowned by a tie that is real.
            const maxRatio = Math.max(...items.map((o) => savingOf(o) / o.normal_price));
            const winners = items.filter((o) => savingOf(o) / o.normal_price === maxRatio);
            const hematWinner = items.length >= 2 && winners.length === 1 ? winners[0] : null;

            return (
              <div
                key={promoId}
                className="flex flex-col rounded-xl border border-border bg-card p-5"
              >
                <h2 className="font-display text-lg uppercase">{items[0].name}</h2>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin aria-hidden className="size-3.5 shrink-0" />
                  {items[0].branch_name ?? "Semua cabang"}
                </p>
                {items[0].description && (
                  <p className="mt-2 text-sm text-muted-foreground">{items[0].description}</p>
                )}

                <ul className="mt-3 flex-1 space-y-3 text-sm">
                  {items.map((o) => {
                    // Every row here survived isWorthwhile in getPromoOfferings, so
                    // normal_price is strictly positive and this cannot divide by zero.
                    const pct = Math.round((savingOf(o) / o.normal_price) * 100);

                    return (
                      <li key={`${o.facility_type_id}:${o.duration_minutes}`}>
                        <Link
                          href={bookingHref(o)}
                          className="group block rounded-lg border border-border bg-surface-low p-3 transition-all duration-150 hover:border-primary/40 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="min-w-0">
                              {o.facility_name} · {fmtDuration(o.duration_minutes)}
                            </span>
                            <span className="shrink-0 font-display text-2xl text-primary">
                              {rp(o.promo_price)}
                            </span>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-xs text-muted-foreground">
                              Harga normal {rp(o.normal_price)} · hemat {rp(savingOf(o))}
                            </span>
                            {pct >= 5 && (
                              <Badge variant="secondary" className="bg-primary/15 text-primary">
                                HEMAT {pct}%
                              </Badge>
                            )}
                            {o === hematWinner && <Badge>PALING HEMAT</Badge>}
                          </div>

                          {o.bonus_snack_name && (
                            <p className="mt-1.5 text-xs text-muted-foreground">
                              🎁 Bonus {o.bonus_quantity}× {o.bonus_snack_name} (selama stok)
                            </p>
                          )}

                          <span className="mt-2 inline-block text-xs font-bold text-primary group-hover:underline">
                            Pakai →
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
