"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { whenIdle } from "@/lib/when-idle";

/**
 * Keeps the server-rendered unit grid fresh. Subscribes to units changes and
 * asks Next to re-fetch the RSC — no client-side state to drift. RLS on
 * postgres_changes matches the "public read" SELECT policy, so anon gets events.
 *
 * `@supabase/supabase-js` diimpor DINAMIS di dalam effect: ia ~250 KB decoded,
 * dan tidak ada yang butuh sebelum socket dibuka. Import statis dulu menaruhnya
 * di bundle awal setiap halaman yang memasang komponen ini (home, tempat-main,
 * tiket) — memindahkannya ke chunk terpisah memangkas jalan kritis.
 */
export function LiveUnits() {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cleanupChannel: (() => void) | null = null;

    const scheduleRefresh = () => {
      if (timer) return; // debounce: one refresh per burst
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 2000);
    };

    // Tunggu browser menganggur: supabase-js besar, dan grid unit tidak perlu
    // socket sebelum halaman selesai dirender.
    const cancelIdle = whenIdle(() => {
      void (async () => {
        const { createClient } = await import("@/lib/supabase/client");
        if (disposed) return;
        const db = createClient();
        const channel = db
          .channel("units-live")
          .on("postgres_changes", { event: "*", schema: "public", table: "units" }, scheduleRefresh)
          .subscribe();
        cleanupChannel = () => {
          void db.removeChannel(channel);
        };
      })();
    });

    return () => {
      disposed = true;
      cancelIdle();
      if (timer) clearTimeout(timer);
      cleanupChannel?.();
    };
  }, [router]);

  return null;
}
