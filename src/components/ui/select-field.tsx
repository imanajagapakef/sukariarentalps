import { cn } from "@/lib/utils";

/**
 * A native `<select>` wearing the design system's field style.
 *
 * ponytail: deliberately the platform control, not the Radix widget that used to
 * sit unused in `ui/select.tsx`. A native select already ships typeahead,
 * screen-reader announcement and the mobile wheel picker; Radix re-implements all
 * three and is *worse* on touch. Styling the platform control is what fixes all 17
 * call sites, and it deletes 191 lines of dead, non-compiling code rather than
 * adding a second select component to keep choosing between.
 *
 * The chevron is redrawn by the `.select-field` utility because `appearance: none`
 * removes the platform's.
 *
 * `size="sm"` is for dense table cells only. Everything else gets the design
 * system's 48px minimum touch target.
 *
 * The HTML `size` attribute (how many options to show at once) is deliberately
 * unreachable — the design system owns this prop. No call site used it.
 */
export function SelectField({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <select
      data-slot="select-field"
      data-size={size}
      className={cn(
        "select-field w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 rounded-md px-2 text-xs" : "h-12",
        className,
      )}
      {...props}
    />
  );
}
