import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgePercent, Gift, MapPin, Sparkles } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { getPromoOfferings } from "@/lib/catalog";
import { bookingHref, savingOf } from "@/lib/promo-rules";
import { fmtDuration, rp } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { PromoHeroAnimation } from "@/components/promo-hero-animation";

export const metadata: Metadata = {
  title: "Promo",
  description: "Paket hemat buat main lebih lama di SukaRia Rental PS. Tap paketnya, booking sudah terisi otomatis.",
};

export const revalidate = 300;

/**
 * The promo list, as something you can book rather than something you read.
 *
 * Each package links straight into a booking that already satisfies it: same branch,
 * same facility type, duration pinned to the package (R5). Listing a price the form
 * then ignores is how a promo ends up looking available and being unbookable.
 *
 * The whole row is the link, not a button sitting under one: on a phone the row is
 * what the thumb is already aiming at. The link carries no aria-label on purpose: the
 * row's own text already names the package, the price and the saving, and a label that
 * repeats it makes a screen reader say everything twice.
 *
 * There is deliberately no countdown or "tinggal sekian" here. The promo table has no
 * end date and the bonus stock is cached for 5 minutes, so any urgency shown would be
 * invented, and an invented deadline costs more trust than it earns clicks.
 */

type Offer = Awaited<ReturnType<typeof getPromoOfferings>>[number];
type PromoCard = { id: string; items: Offer[]; best: Offer; maxPct: number };
type BranchGroup = { id: string; label: string; anchor: string; promos: PromoCard[] };

// Every row here survived isWorthwhile in getPromoOfferings, so normal_price is strictly
// positive and none of these divide by zero.
const ratioOf = (o: Offer) => savingOf(o) / o.normal_price;
const pctOf = (o: Offer) => Math.round(ratioOf(o) * 100);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** Best saving by raw ratio (not the rounded percentage), then by rupiah, then first seen. */
function bestOf(list: Offer[]): Offer | undefined {
  return list.reduce<Offer | undefined>((best, o) => {
    if (!best) return o;
    const diff = ratioOf(o) - ratioOf(best);
    if (diff !== 0) return diff > 0 ? o : best;
    return savingOf(o) > savingOf(best) ? o : best;
  }, undefined);
}

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const STEPS = [
  { title: "Tap paket", body: "Pilih paket yang cocok." },
  { title: "Pilih unit dan jam", body: "Promo sudah terpasang di form." },
  { title: "Bayar", body: "Selesaikan sebelum batas waktu." },
];

export default async function PromoPage() {
  const offers = await getPromoOfferings();

  // One card per promo, its items grouped under it, so the heading the customer reads
  // is the promo name and the choices underneath are the packages. Items keep the order
  // the database gave them (by duration); only whole cards are reordered below.
  const byPromo = new Map<string, Offer[]>();
  for (const o of offers) {
    const list = byPromo.get(o.promotion_id);
    if (list) list.push(o);
    else byPromo.set(o.promotion_id, [o]);
  }

  const cards: PromoCard[] = [...byPromo.entries()].map(([id, items]) => {
    const best = bestOf(items) ?? items[0];
    return { id, items, best, maxPct: pctOf(best) };
  });

  // A promo is bound to one branch, so cards are grouped by branch. With a single branch
  // there is no extra heading; with several, each branch gets its own section.
  const groupMap = new Map<string, BranchGroup>();
  for (const c of cards) {
    const first = c.items[0];
    const label = first.branch_name ?? "Semua cabang";
    const id = first.branch_id ?? "semua";
    const group = groupMap.get(id) ?? {
      id,
      label,
      anchor: `cabang-${slug(label) || slug(id) || "semua"}`,
      promos: [],
    };
    group.promos.push(c);
    groupMap.set(id, group);
  }
  const groups = [...groupMap.values()].sort((a, b) => a.label.localeCompare(b.label, "id"));
  // Best deals first inside a branch; ties fall back to the name so the order is stable.
  for (const g of groups) {
    g.promos.sort(
      (a, b) =>
        ratioOf(b.best) - ratioOf(a.best) || a.items[0].name.localeCompare(b.items[0].name, "id"),
    );
  }
  const multiBranch = groups.length > 1;

  const top = bestOf(offers);
  const topPct = top ? pctOf(top) : 0;
  // Only worth a spotlight when there is a choice to make and the saving is real.
  const showSpotlight = !!top && offers.length >= 2 && topPct >= 10;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8">
      <PageHero
        eyebrow={{ icon: Sparkles, label: `${byPromo.size} promo aktif` }}
        title="Promo"
        titleIcon={BadgePercent}
        description={
          topPct >= 10
            ? `Hemat sampai ${topPct}% buat main lebih lama. Tap paketnya, booking sudah terisi otomatis.`
            : "Paket hemat buat main lebih lama. Tap paketnya, booking sudah terisi otomatis."
        }
        aside={<PromoHeroAnimation className="h-20 w-full md:h-44 md:w-120 shrink-0" />}
      />

      {offers.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Belum ada promo aktif"
            description="Cek lagi nanti ya."
            actionHref={{ label: "Booking tanpa promo", href: "/booking" }}
          />
        </div>
      ) : (
        <>
          {showSpotlight && top && <Spotlight o={top} />}

          <ol className="mt-6 grid grid-cols-3 gap-2" aria-label="Cara pakai promo">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{s.title}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>

          {multiBranch && (
            <nav aria-label="Lompat ke cabang" className="mt-6 flex flex-wrap gap-2">
              {groups.map((g) => (
                <a
                  key={g.id}
                  href={`#${g.anchor}`}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm transition-ui hover:border-primary/50 ${FOCUS}`}
                >
                  <MapPin aria-hidden className="size-4 text-primary" />
                  {g.label}
                  <span className="text-xs text-muted-foreground">{g.promos.length} promo</span>
                </a>
              ))}
            </nav>
          )}

          {groups.map((g) => (
            <section
              key={g.id}
              id={g.anchor}
              aria-labelledby={`${g.anchor}-heading`}
              className="mt-8 scroll-mt-24"
            >
              {multiBranch ? (
                <h2
                  id={`${g.anchor}-heading`}
                  className="flex flex-wrap items-center gap-x-2 font-display text-xl uppercase"
                >
                  <MapPin aria-hidden className="size-5 text-primary" />
                  {g.label}
                  <span className="text-sm font-normal normal-case text-muted-foreground">
                    {g.promos.length} promo
                  </span>
                </h2>
              ) : (
                <h2 id={`${g.anchor}-heading`} className="sr-only">
                  Daftar promo
                </h2>
              )}

              <div className={`grid gap-4 sm:grid-cols-2 ${multiBranch ? "mt-4" : ""}`}>
                {g.promos.map((card) => (
                  <PromoCardView key={card.id} card={card} />
                ))}
              </div>
            </section>
          ))}

          <p className="mt-10 text-xs text-muted-foreground">
            Harga promo berlaku untuk cabang, jenis unit, dan durasi yang tertera. Bonus berlaku selama stok ada.
          </p>
          <Link
            href="/booking"
            className={`mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-ui hover:text-foreground ${FOCUS}`}
          >
            Booking tanpa promo
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}

/** The single best saving across every promo: the first thing the eye lands on. */
function Spotlight({ o }: { o: Offer }) {
  const pct = pctOf(o);

  return (
    <Link
      href={bookingHref(o)}
      className={`group relative mt-6 block overflow-hidden rounded-2xl border border-primary/40 bg-linear-to-br from-primary/20 via-card to-card p-5 transition-ui hover:border-primary active:scale-[0.995] md:p-7 ${FOCUS}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full bg-primary/20 blur-3xl"
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          aria-hidden
          className="grid size-24 shrink-0 -rotate-6 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg md:size-28"
        >
          <span className="font-display text-4xl leading-none md:text-5xl">−{pct}%</span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-display text-xs uppercase tracking-[0.06em] text-primary">
            <Sparkles aria-hidden className="size-3.5" />
            Deal terbaik saat ini
          </p>
          <h2 className="mt-1 font-display text-xl uppercase md:text-2xl">{o.name}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            {o.facility_name} · {fmtDuration(o.duration_minutes)}
            <span aria-hidden>·</span>
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {o.branch_name ?? "Semua cabang"}
          </p>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <span className="font-display text-4xl leading-none text-primary">{rp(o.promo_price)}</span>
            <span className="text-muted-foreground">
              <span className="sr-only">Harga normal </span>
              <s>{rp(o.normal_price)}</s>
            </span>
            <span className="sr-only">hemat {pct} persen</span>
          </p>
          {o.bonus_snack_name && <BonusChip o={o} className="mt-2" />}
        </div>

        <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground sm:self-center">
          Ambil deal ini
          <ArrowRight aria-hidden className="size-4 motion-safe:transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}

function BonusChip({ o, className = "" }: { o: Offer; className?: string }) {
  return (
    <p
      className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs text-primary ${className}`}
    >
      <Gift aria-hidden className="size-3.5 shrink-0" />
      Bonus {o.bonus_quantity}× {o.bonus_snack_name}
      <span className="text-muted-foreground">(selama stok)</span>
    </p>
  );
}

function PromoCardView({ card }: { card: PromoCard }) {
  const { items, best, maxPct } = card;
  const first = items[0];

  // "Paling hemat" only means something when there is a choice to make, and it is decided
  // on the raw ratio rather than the rounded percentage, so two packages at 8.4% and 8.6%
  // are not both rounded into a tie and a tie that is real crowns nobody.
  const maxRatio = ratioOf(best);
  const winners = items.filter((o) => ratioOf(o) === maxRatio);
  const crowned = items.length >= 2 && winners.length === 1 ? winners[0] : null;

  return (
    <article className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-card p-5">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-primary via-primary/50 to-transparent"
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg uppercase">{first.name}</h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            {first.branch_name ?? "Semua cabang"}
          </p>
        </div>
        {maxPct >= 5 && (
          <span className="shrink-0 rounded-full bg-primary/15 px-2.5 py-1 text-xs font-bold text-primary">
            Hemat sampai {maxPct}%
          </span>
        )}
      </div>

      {first.description && <p className="mt-2 text-sm text-muted-foreground">{first.description}</p>}

      <ul className="mt-4 flex-1 space-y-3 text-sm">
        {items.map((o) => (
          <li key={`${o.facility_type_id}:${o.duration_minutes}`}>
            <OfferRow o={o} crowned={o === crowned} />
          </li>
        ))}
      </ul>
    </article>
  );
}

function OfferRow({ o, crowned }: { o: Offer; crowned: boolean }) {
  const pct = pctOf(o);
  const pay = Math.min(100, Math.max(0, 100 - pct));
  // Effective hourly rate makes a 1-hour and a 3-hour package comparable at a glance.
  // Skipped for one hour, where it would just repeat the price.
  const perHour = o.duration_minutes > 60 ? Math.round(o.promo_price / (o.duration_minutes / 60)) : null;

  return (
    <Link
      href={bookingHref(o)}
      className={`group block rounded-lg border border-border bg-surface-low p-3 transition-ui hover:border-primary/40 active:scale-[0.99] ${FOCUS}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 font-medium">
          {o.facility_name} · {fmtDuration(o.duration_minutes)}
        </span>
        {crowned && <Badge className="shrink-0">PALING HEMAT</Badge>}
      </div>

      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-3xl leading-none text-primary">{rp(o.promo_price)}</span>
        <span className="text-sm text-muted-foreground">
          <span className="sr-only">Harga normal </span>
          <s>{rp(o.normal_price)}</s>
        </span>
        {pct >= 5 && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">−{pct}%</span>
        )}
      </div>

      {/* What you pay, against what you would have paid: the light part is the saving. */}
      <div aria-hidden className="mt-2.5 h-2 overflow-hidden rounded-full bg-primary/15">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pay}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Hemat {rp(savingOf(o))}</span>
        {perHour !== null && <span>≈ {rp(perHour)}/jam</span>}
      </div>

      {o.bonus_snack_name && <BonusChip o={o} className="mt-2" />}

      <span className="mt-2 flex min-h-9 items-center justify-end gap-1 text-sm font-bold text-primary">
        Pakai promo
        <ArrowRight aria-hidden className="size-4 motion-safe:transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}