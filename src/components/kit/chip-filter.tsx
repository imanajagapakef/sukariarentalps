import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Tactile connected filter chip. Active chip inverts to off-white/surface
 * (design system); inactive stays muted. Renders as a link so filters are
 * shareable and SSR-friendly.
 */
export function ChipFilter({
  active,
  href,
  children,
  className,
}: {
  active?: boolean;
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border-2 px-4 py-2 text-xs font-bold uppercase tracking-wide transition-colors",
        active
          ? "border-off-white bg-off-white text-surface shadow-arcade-sm"
          : "border-border bg-surface-low text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </Link>
  );
}
