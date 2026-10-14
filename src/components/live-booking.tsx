"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bookingChannel } from "@/lib/booking-actions";

/**
 * Keeps a booking page current so staff actions land without the customer
 * reloading: kasir presses "Konfirmasi" in /admin, and the payment page flips to
 * "sudah tidak menunggu" on its own.
 *
 * Two mechanisms, on purpose:
 *
 * - Broadcast is the fast path. A staff action pings `booking:{code}` and the
 *   page re-reads the server immediately. It carries no data: the payload is
 *   treated purely as "something changed, go look", and every value the page
 *   renders is re-fetched from the database. A forged ping can therefore cost
 *   one extra refresh and nothing else.
 * - Polling is the safety net. WebSockets drop — phone sleeps on cellular, VPN
 *   reconnects, the tab is restored from bfcache. Without the interval a dead
 *   socket would freeze the page until the customer manually reloaded, which is
 *   the exact failure this component exists to remove. 8s is cheap insurance.
 *
 * Why not Supabase Realtime postgres_changes, which /tempat-main uses for units?
 * `postgres_changes` honours RLS, and these two rows are closed to the public —
 * `payments` sits behind a "service only" policy and `bookings` is readable by
 * staff only — so an anonymous visitor receives no events at all. Widening those
 * policies would publish customer names, phone numbers and totals.
 *
 * Stops on terminal statuses: nothing left to learn, and an idle tab should not
 * keep hitting the server.
 */
const LIVE_STATUSES = new Set(["WAITING_PAYMENT", "CONFIRMED", "CHECKED_IN", "IN_USE"]);

export function LiveBooking({
  code,
  status,
  intervalMs = 8000,
}: {
  code: string;
  status: string;
  intervalMs?: number;
}) {
  const router = useRouter();
  const live = LIVE_STATUSES.has(status);

  useEffect(() => {
    if (!live) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return; // debounce: a burst of pings costs one refresh
      timer = setTimeout(() => {
        timer = null;
        router.refresh();
      }, 400);
    };

    const db = createClient();
    const channel = db
      .channel(bookingChannel(code))
      .on("broadcast", { event: "status" }, refresh)
      .subscribe();

    const timer2 = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);

    // Someone who has been watching the cashier's phone in another window needs
    // new data the moment they come back, not up to one interval later.
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(timer2);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      db.removeChannel(channel);
    };
  }, [router, live, code, intervalMs]);

  return null;
}