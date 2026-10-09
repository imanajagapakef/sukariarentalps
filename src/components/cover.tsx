import Image from "next/image";
import { cn } from "@/lib/utils";
import { coverTint } from "@/lib/format";

/**
 * Card artwork.
 *
 * Renders `src` when the row has one, otherwise the brand gradient with the
 * label. The gradient is a real fallback, not a placeholder standing in for
 * finished work: games, snacks, units and branches all gained an `image_url`
 * column (migration 0016) and rows without one keep looking deliberate.
 *
  * Sources are the Supabase public bucket (remotePatterns in next.config) plus
  * files under /public — next/image gives srcset + lazy loading for both.
  */
export function Cover({
  seed,
  label,
  src,
  className = "",
  alt,
  priority = false,
}: {
  seed: string;
  label: string;
  src?: string | null;
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  const frame = cn("relative overflow-hidden bg-card", className);

  if (src) {
    return (
      <div className={frame}>
        <Image
          src={src}
          alt={alt ?? label}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className={cn("grid place-items-center", frame)}
      style={{ background: `linear-gradient(135deg, ${coverTint(seed)}, #131313 80%)` }}
    >
      <span className="font-display px-2 text-center text-sm uppercase tracking-wide text-off-white/90">
        {label}
      </span>
    </div>
  );
}
