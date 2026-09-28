/** Horizontally scrolling brand ticker. Pure CSS — no client JS, no deps. */
export function Ticker({ items }: { items: string[] }) {
  const line = items.join("   •   ");
  return (
    <div className="overflow-hidden border-y border-border bg-primary-container py-2 text-on-primary">
      <div className="flex w-max animate-marquee gap-16 whitespace-nowrap text-sm font-semibold uppercase tracking-wider">
        <span>{line}</span>
        <span aria-hidden>{line}</span>
      </div>
    </div>
  );
}
