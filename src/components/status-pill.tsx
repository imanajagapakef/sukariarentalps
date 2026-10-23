import {
  CalendarClock,
  CircleCheck,
  CircleDot,
  CircleSlash,
  Hourglass,
  type LucideIcon,
  Power,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BOOKING_LABEL,
  BOOKING_TONE,
  UNIT_LABEL,
  UNIT_TONE,
} from "@/lib/format";

type Tone = "success" | "warning" | "danger" | "neutral";

const PILL: Record<Tone, string> = {
  success: "border-primary/40 bg-primary/12 text-primary",
  warning: "border-amber/40 bg-amber/12 text-amber",
  danger: "border-coral/40 bg-coral/12 text-coral",
  neutral: "border-border bg-muted text-muted-foreground",
};

const UNIT_ICON: Record<string, LucideIcon> = {
  AVAILABLE: CircleCheck,
  BOOKED: CalendarClock,
  IN_USE: Hourglass,
  IN_ORDER: Sparkles,
  MAINTENANCE: Wrench,
  OFFLINE: Power,
};

const BOOKING_ICON: Record<string, LucideIcon> = {
  DRAFT: CircleDot,
  WAITING_PAYMENT: Hourglass,
  CONFIRMED: CircleCheck,
  CHECKED_IN: CircleCheck,
  IN_USE: Hourglass,
  COMPLETED: CircleCheck,
  READY: CircleCheck,
  CANCELLED: X,
  EXPIRED: CircleSlash,
  NO_SHOW: X,
};

const pillClass = (tone: Tone) =>
  cn(
    "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide",
    PILL[tone],
  );

/**
 * Dual-indicator status pill — never color alone (design system mandate:
 * every status combines a vector icon with a legible text string).
 */
export function UnitStatusPill({ status }: { status: string }) {
  const tone = UNIT_TONE[status] ?? "neutral";
  const Icon = UNIT_ICON[status] ?? CircleDot;
  return (
    <span className={pillClass(tone)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {UNIT_LABEL[status] ?? status}
    </span>
  );
}

export function BookingStatusPill({ status }: { status: string }) {
  const tone = BOOKING_TONE[status] ?? "neutral";
  const Icon = BOOKING_ICON[status] ?? CircleDot;
  return (
    <span className={pillClass(tone)}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {BOOKING_LABEL[status] ?? status}
    </span>
  );
}
