import { cn } from "@/lib/utils";

/**
 * Section banner: Anton kicker (label-ticker rhythm) + condensed uppercase
 * headline + supporting copy, with the action pushed right on wide screens.
 */
export function SectionBanner({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && (
          <p className="font-display text-sm uppercase tracking-[0.15em] text-primary">
            {kicker}
          </p>
        )}
        <h2 className="font-display mt-1 text-3xl uppercase leading-[0.95] text-foreground md:text-4xl">
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-on-surface-variant md:text-base">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
