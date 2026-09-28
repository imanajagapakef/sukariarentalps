import { Badge } from "@/components/ui/badge";
import { BOOKING_LABEL, BOOKING_TONE, TONE_CLASS, UNIT_LABEL, UNIT_TONE } from "@/lib/format";

export function BookingStatusPill({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={TONE_CLASS[BOOKING_TONE[status] ?? "neutral"]}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {BOOKING_LABEL[status] ?? status}
    </Badge>
  );
}

export function UnitStatusPill({ status }: { status: string }) {
  return (
    <Badge variant="secondary" className={TONE_CLASS[UNIT_TONE[status] ?? "neutral"]}>
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {UNIT_LABEL[status] ?? status}
    </Badge>
  );
}
