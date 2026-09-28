"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps the server-rendered unit grid fresh. Subscribes to units changes and
 * asks Next to re-fetch the RSC — no client-side state to drift. RLS on
 * postgres_changes matches the "public read" SELECT policy, so anon gets events.
 */
export function LiveUnits() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) return; // debounce: one refresh per burst
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 2000);
    };

    const db = createClient();
    const channel = db
      .channel("units-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "units" }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      db.removeChannel(channel);
    };
  }, [router]);

  return null;
}
