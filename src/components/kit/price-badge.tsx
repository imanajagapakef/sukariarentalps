import { cn } from "@/lib/utils";

/** Rate chip: "Mulai Rp15.000/Jam". */
export function PriceBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-baseline gap-1 rounded-md border border-primary/35 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
