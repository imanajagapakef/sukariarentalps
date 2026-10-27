import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Crumb = { label: React.ReactNode; href?: string };

/**
 * One breadcrumb trail for every detail page.
 *
 * Detail pages used to each invent their own way back: a full `<ol>` trail on
 * `/units/[unit_id]`, "→ Katalog Game" on `/games/[slug]`, "← Semua turnamen" on
 * `/turnamen/[slug]`. Three directions, three affordances, one job. This keeps the
 * "where am I" answer identical everywhere, so a customer learns it once.
 *
 * Server-safe: no state, no effect.
 */
export function Breadcrumbs({ items, className }: Readonly<{ items: Crumb[]; className?: string }>) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${typeof c.label === "string" ? c.label : i}`} className="flex items-center gap-2">
              {i > 0 && <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/50" />}
              {c.href && !last ? (
                <Link href={c.href} className="transition-colors hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className="truncate text-foreground">
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
