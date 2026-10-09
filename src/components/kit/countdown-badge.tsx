"use client";

import { Hourglass } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function readout(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Amber telemetry countdown tag: hourglass icon + live mono clock readout
 * (e.g. "00:42:15"). Settles to `expiredLabel` once the deadline passes.
 *
 * The first frame renders empty rather than a computed time: Date.now() differs
 * between the server render and hydration, which is a hydration mismatch.
 */
export function CountdownBadge({
  endsAt,
  className,
  expiredLabel = "WAKTU HABIS",
}: {
  endsAt: string | Date;
  className?: string;
  expiredLabel?: string;
}) {
  const target = new Date(endsAt).getTime();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(target - Date.now());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target]);

  const done = left !== null && left <= 0;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border border-amber/45 bg-amber/12 px-3 py-1 font-mono text-xs font-bold tabular-nums text-amber",
        done && "border-coral/45 bg-coral/12 text-coral",
        className,
      )}
      role="timer"
      aria-live="off"
    >
      <Hourglass aria-hidden className="size-3.5 shrink-0" />
      {left === null ? "" : done ? expiredLabel : readout(left)}
    </span>
  );
}
