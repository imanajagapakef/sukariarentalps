import Link from "next/link";
import { cn } from "@/lib/utils";

export type StatCard = {
  label: string;
  value: string | number;
  /** Optional drill-down. Omit for a card that is a readout, not a control. */
  href?: string;
  tone?: "primary" | "warning" | "danger" | "muted";
};

const TONE: Record<NonNullable<StatCard["tone"]>, string> = {
  primary: "text-primary",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted-foreground",
};

/**
 * The KPI strip every admin page opens with.
 *
 * ponytail: extracted from the dashboard, which had this markup inline. Nine pages
 * each re-typing it would guarantee they drift apart. The numbers are computed by each
 * page from data it already loads — a card is a readout over rows the page is already
 * fetching, never a second query.
 */
export function StatCards({
  cards,
  className,
}: {
  cards: StatCard[];
  className?: string;
}) {
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
        const body = (
          <>
            <p className="text-xs uppercase text-muted-foreground">{c.label}</p>
            <p className={cn("font-display mt-1 text-2xl", TONE[c.tone ?? "muted"])}>{c.value}</p>
            {c.href && <p className="text-xs text-primary">Lihat →</p>}
          </>
        );
        return c.href ? (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50"
          >
            {body}
          </Link>
        ) : (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            {body}
          </div>
        );
      })}
    </div>
  );
}
