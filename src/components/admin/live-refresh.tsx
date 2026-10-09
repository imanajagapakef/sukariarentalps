"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the current admin route on an interval.
 *
 * The topbar says "Live · data real-time". 60s keeps the numbers fresh without
 * re-running every admin server component (including the heavy /admin/reports
 * fan-out) six times per minute per open tab.
 *
 * ponytail: router.refresh() re-runs the server components, which is the whole
 * mechanism — no websocket, no client cache, no polling endpoint. It pauses while
 * the tab is hidden because nobody is reading a counter they cannot see.
 */
export function LiveRefresh({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);

  return null;
}
