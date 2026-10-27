import { PageHero } from "@/components/page-hero";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Cookie, CupSoda, Sandwich, Tag, UtensilsCrossed, Zap } from "lucide-react";
import { getSnacks, type SnackRow } from "@/lib/catalog";
import { stockStatus, type Stock } from "@/lib/snack-stock";
import { Cover } from "@/components/cover";
import { StatCards } from "@/components/stat-cards";
import { rp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { SnacksHeroAnimation } from "@/components/snacks-hero-animation";

export const metadata: Metadata = {
  title: "Snacks & Drinks",
  description:
    "Menu snack dan minum di klub. Pesan sekalian waktu booking, atau ambil langsung di kasir.",
};

/**
 * A pill rather than bare coloured text, so the state reads as a status and not as
 * decoration. The tint is only 15% of the hue, which keeps the chip quiet.
 *
 * `out` uses `text-error` (#ffb4ab) rather than `text-danger` (#ef4444) because the
 * darker red measures 3.9:1 against its own 15% tint — below the 4.5:1 floor for normal
 * text. The lighter red measures 8.6:1 on the same background.
 */
const BADGE: Record<Exclude<Stock, "ok">, { label: string; className: string }> = {
  out: { label: "Habis", className: "bg-danger/15 text-error" },
  low: { label: "Stok tipis", className: "bg-warning/15 text-warning" },
};

const FALLBACK_CATEGORY = "Lainnya";

/** Category names come from the database, so the heading id has to be derived, not assumed. */
function categoryId(category: string): string {
  return `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

/** Category names are free text, so the icon is a keyword guess with a safe default. */
function categoryIcon(category: string) {
  const c = category.toLowerCase();
  if (/minum|drink|beverage|kopi|coffee|teh|tea|jus|juice|soda/.test(c)) return CupSoda;
  if (/mie|mi |noodle|makan|food|nasi|roti|burger/.test(c)) return UtensilsCrossed;
  if (/snack|cemil|camil|chip|keripik|biskuit|biscuit|cookie/.test(c)) return Cookie;
  return Sandwich;
}

export const revalidate = 300;

export default async function SnacksPage() {
  const snacks = await getSnacks();

  // A row with an empty category used to render an empty <h2>. Give it a name instead.
  const byCategory = snacks.reduce<Record<string, SnackRow[]>>((acc, s) => {
    (acc[s.category?.trim() || FALLBACK_CATEGORY] ??= []).push(s);
    return acc;
  }, {});

  // Unique anchor ids: two categories can derive the same slug, and a category made only
  // of non-latin characters derives an empty one. Either would break the jump links.
  const seen = new Set<string>();
  const sections = Object.entries(byCategory).map(([cat, items], i) => {
    let id = categoryId(cat);
    if (id === "cat-" || seen.has(id)) id = `cat-${i}`;
    seen.add(id);
    const cheapest = items.reduce((m, s) => Math.min(m, s.price), Infinity);
    return { cat, items, id, cheapest, Icon: categoryIcon(cat) };
  });

  // Computed once, so the stat row and the cards cannot disagree.
  const statuses = snacks.map((s) => stockStatus(s));
  const readyCount = statuses.filter((s) => s === "ok").length;
  const soldOut = statuses.filter((s) => s === "out").length;

  return (
    <div className="relative mx-auto max-w-6xl px-4 py-10 md:px-8">
      {/* Ambient glow: CSS only, no layout cost. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-6 -z-10 h-80 bg-[radial-gradient(50rem_16rem_at_50%_0%,theme(colors.primary/15%),transparent)]"
      />

      {/* The page is ISR with a 300s window, so a "habis" badge can trail reality by up to
          five minutes. The customer does not care about the mechanism, only that the
          number may be out of date, so that is all this copy says. */}
      {/* The booking form can add snacks, so this page used to be a dead end. The CTA
          below points at the one path that actually orders them. */}
      <PageHero
        className="mt-6"
        eyebrow={{ icon: Boxes, label: `${snacks.length} menu` }}
        title="Snacks & Drinks"
        titleIcon={Sandwich}
        description="Tinggal ambil di kasir saat check-in, atau pesan sekalian waktu booking. Ketersediaan bisa berubah sewaktu-waktu."
        actions={
          <Link
            href="/booking"
            className="group inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
          >
            Pesan sekalian booking
            <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
          </Link>
        }
        aside={<SnacksHeroAnimation className="h-24 w-full md:h-44 md:w-120 shrink-0" />}
      />

      {snacks.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Belum ada menu"
            description="Belum ada snack atau minuman yang ditambahkan. Kamu tetap bisa pesan slot PS seperti biasa."
            actionHref={{ label: "Buka halaman booking", href: "/booking" }}
          />
        </div>
      ) : (
        <>
          <StatCards
            cards={[
              { label: "Total menu", value: snacks.length, icon: Sandwich, hint: "snack & minuman" },
              { label: "Kategori", value: sections.length, icon: Tag, hint: "pilih seleramu" },
              {
                label: "Ready",
                value: readyCount,
                tone: readyCount > 0 ? "primary" : "muted",
                icon: Zap,
                hint: "stok aman",
              },
              { label: "Habis", value: soldOut, icon: Boxes, hint: soldOut > 0 ? "balik lagi nanti" : "semua aman" },
            ]}
          />

          {/* Jump links: the whole menu can run long, and a category you want should be
              one tap away. Plain anchors, so the page stays fully static (no searchParams,
              no client JS) and keeps its 300s ISR window. */}
          {sections.length > 1 && (
            <nav aria-label="Kategori menu" className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {sections.map(({ cat, id, items, Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-primary"
                >
                  <Icon aria-hidden className="size-3.5" />
                  {cat}
                  <span className="font-mono text-xs opacity-60">{items.length}</span>
                </a>
              ))}
            </nav>
          )}

          {sections.map(({ cat, items, id, cheapest, Icon }) => (
            <section key={id} aria-labelledby={id} className="mt-10 scroll-mt-24">
              <div className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Icon aria-hidden className="size-4.5" />
                </span>
                <h2 id={id} className="font-display text-xl uppercase text-primary">
                  {cat}
                </h2>
                {Number.isFinite(cheapest) && (
                  <span className="hidden rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline">
                    mulai {rp(cheapest)}
                  </span>
                )}
                <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
              </div>

              {/* One grid for every category. Keying the column count off `items.length`
                  gave each section a different card width for no reason. */}
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => {
                  const status = stockStatus(s);
                  const out = status === "out";
                  return (
                    <li
                      key={s.snack_id}
                      className={cn(
                        "group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all duration-300 motion-reduce:transition-none",
                        // Sold-out cards do not lift: nothing to invite a click on.
                        !out && "hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10",
                      )}
                    >
                      <div className="shrink-0 overflow-hidden rounded-xl">
                        <Cover
                          seed={s.snack_id}
                          src={s.image_url}
                          label={s.name}
                          className={cn(
                            "size-20 transition-transform duration-500 motion-reduce:transition-none",
                            // The fade is applied here and to the name and price, never to the
                            // whole card: an `opacity` on the <li> would dim the badge too,
                            // and the badge is the one thing an out-of-stock card has to say
                            // clearly. Sold-out is also only dimmed, never reordered, so the
                            // list does not reshuffle every time stock changes.
                            out ? "opacity-60 grayscale" : "group-hover:scale-110",
                          )}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        {/* line-clamp-2 instead of truncate: a two-line name stays readable
                            where a truncated one lost the end of the word with no ellipsis
                            of any use. */}
                        <p className={cn("line-clamp-2 font-medium leading-snug", out && "opacity-60")}>{s.name}</p>
                        <p className={cn("mt-1 font-display text-lg tabular-nums text-primary", out && "opacity-60")}>
                          {rp(s.price)}
                        </p>
                        {status === "ok" ? (
                          <span className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500">
                            <span aria-hidden className="size-1.5 rounded-full bg-emerald-400" />
                            Tersedia
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                              BADGE[status].className,
                            )}
                          >
                            {BADGE[status].label}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          {/* End-of-page CTA: someone who scrolled the whole menu is ready to order. */}
          <aside className="relative mt-14 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-8">
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-xs uppercase tracking-widest text-primary">Biar nggak laper pas main</p>
                <h2 className="font-display mt-1 text-xl uppercase md:text-2xl">Tambah snack waktu booking</h2>
                <p className="mt-1 text-sm text-muted-foreground">Sudah siap di meja pas kamu datang, tanpa antre di kasir.</p>
              </div>
              <Link
                href="/booking"
                className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-bold text-primary-foreground transition-transform hover:scale-105 motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                Booking sekarang
                <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
              </Link>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}