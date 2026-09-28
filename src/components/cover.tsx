import { coverTint } from "@/lib/format";

/** Brand-tinted placeholder until real cover images exist. */
export function Cover({
  seed,
  label,
  className = "",
}: {
  seed: string;
  label: string;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`grid place-items-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${coverTint(seed)}, #131313 80%)` }}
    >
      <span className="font-display px-2 text-center text-sm uppercase tracking-wide text-off-white/90">
        {label}
      </span>
    </div>
  );
}
