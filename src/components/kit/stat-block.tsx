import { cn } from "@/lib/utils";

/** Big condensed stat: "12+" over "Station PS5 & Rig". */
export function StatBlock({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <p className="font-display text-4xl uppercase leading-none text-primary md:text-5xl">
        {value}
      </p>
      <p className="mt-1.5 text-xs font-bold uppercase tracking-wide text-on-surface-variant">
        {label}
      </p>
    </div>
  );
}
