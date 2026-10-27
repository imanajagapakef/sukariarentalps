import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatCard = {
  label: string;
  value: string | number;
  /** Optional drill-down. Omit for a card that is a readout, not a control. */
  href?: string;
  tone?: "primary" | "warning" | "danger" | "muted";
  /** Optional ikon besar di pojok (watermark) + badge kecil. */
  icon?: LucideIcon;
  /** Optional teks kecil di bawah angka, mis. "dari 12 unit". */
  hint?: string;
};

const TONE: Record<NonNullable<StatCard["tone"]>, string> = {
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
};

const GLOW: Record<NonNullable<StatCard["tone"]>, string> = {
  primary: "from-primary/20",
  warning: "from-amber/20",
  danger: "from-coral/20",
  muted: "from-muted-foreground/10",
};

const BAR: Record<NonNullable<StatCard["tone"]>, string> = {
  primary: "bg-primary",
  warning: "bg-amber",
  danger: "bg-coral",
  muted: "bg-muted-foreground/40",
};

/**
 * The KPI strip that opens a page — admin and storefront alike.
 *
 * ponytail: a card is a readout over rows the page is already fetching,
 * never a second query. icon/hint are optional so existing pages keep working.
 */
export function StatCards({ cards, className }: { cards: StatCard[]; className?: string }) {
  if (cards.length === 0) return null;
  return (
    <div
      className={cn(
        "mt-4 grid grid-cols-2 gap-3",
        cards.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4",
        className,
      )}
    >
      {cards.map((c) => {
        const tone = c.tone ?? "muted";
        const Icon = c.icon;
        const base =
          "group relative isolate overflow-hidden rounded-xl border border-border bg-card p-4";
        const body = (
          <>
            {/* glow pojok + garis aksen atas */}
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 -z-10 bg-linear-to-br to-transparent opacity-70 transition-opacity group-hover:opacity-100",
                GLOW[tone],
              )}
            />
            <div aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", BAR[tone])} />
            {Icon && (
              <Icon
                aria-hidden
                className={cn(
                  "absolute -right-2 -bottom-3 size-20 -rotate-12 opacity-[0.07] transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110",
                  TONE[tone],
                )}
              />
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</p>
              {c.href && (
                <ArrowUpRight
                  aria-hidden
                  className="size-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary"
                />
              )}
            </div>
            <p className={cn("font-display mt-2 text-3xl leading-none tabular-nums", TONE[tone])}>{c.value}</p>
            {c.hint ? (
              <p className="mt-2 text-xs text-muted-foreground">{c.hint}</p>
            ) : (
              c.href && <p className="mt-2 text-xs text-primary">Lihat →</p>
            )}
          </>
        );
        return c.href ? (
          <Link
            key={c.label}
            href={c.href}
            className={cn(base, "transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg")}
          >
            {body}
          </Link>
        ) : (
          <div key={c.label} className={base}>
            {body}
          </div>
        );
      })}
    </div>
  );
}