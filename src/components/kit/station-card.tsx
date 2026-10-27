import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtTime } from "@/lib/format";
import { UnitStatusPill } from "@/components/status-pill";
import { PlatformPill } from "@/components/kit/platform-pill";
import { CountdownBadge } from "@/components/kit/countdown-badge";
import { Cover } from "@/components/cover";
import type { UnitRow } from "@/lib/catalog";

/**
 * Station card per design system: elevated #1c1b1b container, 24px corners,
 * Anton station identifier + platform pill + dual-indicator status + footer
 * action. `nextFree` (ISO) renders a live amber countdown when occupied.
 */
export function StationCard({
  unit,
  nextFree,
  className,
}: {
  unit: UnitRow;
  nextFree?: string | null;
  className?: string;
}) {
  const ready = unit.status === "AVAILABLE";
  const href = `/booking?unit=${unit.unit_id}&branch=${unit.branch_id}`;
  const detailHref = `/units/${unit.unit_id}`;
  const branch = unit.branches?.short_name ?? unit.branches?.name;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-white/8 bg-card p-5 transition-colors hover:border-primary/50",
        className,
      )}
    >
      {unit.image_url && (
        <Cover
          seed={unit.unit_id}
          src={unit.image_url}
          label={unit.name}
          alt={`${unit.name} — ${unit.facility_types?.name ?? "unit"}`}
          className="aspect-3/2 w-full rounded-lg"
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={detailHref}
            className="font-display block text-lg uppercase leading-tight transition-colors hover:text-primary"
          >
            {unit.name}
          </Link>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {unit.facility_types?.name}
            {branch ? ` · ${branch}` : ""}
          </p>
        </div>
        <PlatformPill platform={unit.facility_types?.platform} />
      </div>

      <UnitStatusPill status={unit.status} />

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        {ready ? (
          <p className="text-sm text-primary">Langsung bisa main</p>
        ) : nextFree ? (
          <div className="flex flex-col gap-1">
            {/* "jam" here means o'clock, not a duration — say pukul, and pair the
                absolute time with the live countdown the design calls for. */}
            <p className="text-sm text-muted-foreground">
              Kosong pukul <span className="font-bold text-foreground">{fmtTime(nextFree)}</span>
            </p>
            <CountdownBadge endsAt={nextFree} expiredLabel="SIAP SEKARANG" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Slot penuh hari ini</p>
        )}
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
        >
          Booking <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
