import { cn } from "@/lib/utils";

const VARIANTS = {
  green: "bg-primary-container text-on-primary-container border-emerald-900",
  offwhite: "bg-off-white text-surface border-black/20",
  amber: "bg-amber text-black border-black/20",
  outline: "bg-transparent text-off-white border-off-white/70",
} as const;

/**
 * Peel-and-stick arcade badge: thick outline, slight rotation, hard-edge drop.
 * Simulates a physical sticker tag ("NEW ARRIVAL", "MIDNIGHT PASS").
 */
export function StickerTag({
  children,
  variant = "green",
  rotate = -1.5,
  className,
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANTS;
  rotate?: number;
  className?: string;
}) {
  return (
    <span
      style={{ transform: `rotate(${rotate}deg)` }}
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md border-[1.5px] px-2.5 py-1 text-[0.7rem] font-extrabold uppercase leading-none tracking-wider shadow-arcade-sm",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
