/** Horizontally scrolling brand ticker. Pure CSS — no client JS, no deps. */
export function Ticker({ items }: { items: string[] }) {
  const line = items.join("   •   ");
  return (
    // The marquee child is `w-max` — thousands of pixels once the copy is long,
    // and a child that wide is exactly what hands a phone a sideways drag.
    //
    // `overflow-hidden`, not `overflow-x: clip`: `clip` is not honoured before
    // Safari 16, where it falls back to `visible` and lets the strip leak, while
    // `hidden` has clipped this strip since forever. `contain: paint` clips the
    // contents to the padding box and makes this a containment context.
    //
    // `will-change: transform` is the piece that matters on iOS: the marquee
    // child animates a `transform`, and WebKit is known to let a transformed
    // child escape an ancestor's `overflow` clip until that ancestor is promoted
    // to its own layer — at which point the clip holds (Safari: "doesn't respect
    // overflow: hidden in conjunction with transform"). Without it the 2354px
    // strip leaks past the clip and widens the whole page on an iPhone.
    <div className="max-w-full overflow-hidden border-y border-border bg-primary-container py-2 text-on-primary contain-paint will-change-transform">
      <div className="flex w-max animate-marquee gap-16 whitespace-nowrap text-sm font-semibold uppercase tracking-wider">
        <span>{line}</span>
        <span aria-hidden>{line}</span>
      </div>
    </div>
  );
}
