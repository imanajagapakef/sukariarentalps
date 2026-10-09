import { Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Platform family tint: Sony green, Switch amber, everything else off-white. */
const TONE = (platform: string) => {
  const p = platform.toUpperCase();
  if (p.includes("PS") || p.includes("PLAY")) return "border-primary/45 bg-primary/12 text-primary";
  if (p.includes("SWITCH") || p.includes("NINTENDO")) return "border-amber/45 bg-amber/12 text-amber";
  return "border-off-white/30 bg-off-white/10 text-off-white";
};

/** Squared platform pill badge: "PS5", "SWITCH", "VR2", "SIM RIG". */
export function PlatformPill({
  platform,
  className,
}: {
  platform?: string | null;
  className?: string;
}) {
  if (!platform) return null;
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-[0.7rem] font-extrabold uppercase tracking-wider",
        TONE(platform),
        className,
      )}
    >
      <Gamepad2 aria-hidden className="size-3" />
      {platform}
    </span>
  );
}
