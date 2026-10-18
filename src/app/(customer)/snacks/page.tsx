import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getSnacks, type SnackRow } from "@/lib/catalog";
import { stockStatus, type Stock } from "@/lib/snack-stock";
import { Cover } from "@/components/cover";
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

/** Category names come from the database, so the heading id has to be derived, not assumed. */
function categoryId(category: string): string {
  return `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

export const revalidate = 300;

export default async function SnacksPage() {
  const snacks = await getSnacks();
  const byCategory = snacks.reduce<Record<string, SnackRow[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 md:px-8">
      <div className="mt-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-3xl uppercase md:text-5xl">Snacks & Drinks</h1>
          <p className="mt-2 text-muted-foreground">
            Tinggal ambil di kasir saat check-in, atau pesan sekalian waktu booking.
          </p>
          {/* The page is ISR with a 300s window, so a "habis" badge can trail reality by
              up to five minutes. The customer does not care about the mechanism, only
              that the number may be out of date, so that is all this says. */}
          <p className="mt-1 text-xs text-muted-foreground">
            Ketersediaan bisa berubah sewaktu-waktu.
          </p>
          {/* The booking form can add snacks, so this page used to be a dead end: it told
              people to ask staff while the only real path sat one click away. The copy
              says "can be ordered", not "choose snacks now", because the form asks for
              branch, unit and time before it ever reaches the snack list. */}
          <Link
            href="/booking"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:underline"
          >
            Bisa dipesan sekalian saat booking
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <SnacksHeroAnimation className="h-24 w-full md:h-44 md:w-120 shrink-0" />
      </div>

      {snacks.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Belum ada menu"
            description="Belum ada snack atau minuman yang ditambahkan. Kamu tetap bisa pesan slot PS seperti biasa."
            actionHref={{ label: "Buka halaman booking", href: "/booking" }}
          />
        </div>
      ) : (
        Object.entries(byCategory).map(([cat, items]) => {
          const headingId = categoryId(cat);
          return (
            <section key={cat} aria-labelledby={headingId} className="mt-10">
              <h2 id={headingId} className="font-display text-xl uppercase text-primary">
                {cat}
              </h2>
              {/* One grid for every category. Keying the column count off `items.length`
                  gave each section a different card width for no reason. */}
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((s) => {
                  const status = stockStatus(s);
                  return (
                    <li
                      key={s.snack_id}
                      className="flex items-start gap-4 rounded-xl border border-border bg-card p-4"
                    >
                      <Cover
                        seed={s.snack_id}
                        src={s.image_url}
                        label={s.name}
                        className={cn(
                          "size-14 shrink-0 rounded-lg",
                          // The fade is applied here and to the name and price, never to the
                          // whole card: an `opacity` on the <li> would dim the badge too,
                          // and the badge is the one thing an out-of-stock card has to say
                          // clearly. Sold-out is also only dimmed, never reordered, so the
                          // list does not reshuffle every time stock changes.
                          status === "out" && "opacity-60",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        {/* line-clamp-2 instead of truncate: a two-line name stays readable
                            where a truncated one lost the end of the word with no ellipsis
                            of any use. */}
                        <p
                          className={cn(
                            "line-clamp-2 font-medium leading-snug",
                            status === "out" && "opacity-60",
                          )}
                        >
                          {s.name}
                        </p>
                        <p
                          className={cn(
                            "mt-0.5 font-display tabular-nums text-primary",
                            status === "out" && "opacity-60",
                          )}
                        >
                          {rp(s.price)}
                        </p>
                        {status !== "ok" && (
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
          );
        })
      )}
    </div>
  );
}
