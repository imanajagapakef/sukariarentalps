"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BOOKING_ACTIONS, bookingChannel } from "@/lib/booking-actions";
import { createClient } from "@/lib/supabase/client";

/**
 * Tells the customer's booking page that its status just changed.
 *
 * The send must happen on a channel that has finished subscribing — supabase-js
 * silently drops a broadcast from an unsubscribed channel, which looks exactly
 * like success. So the channel lives in a ref for the component's lifetime and
 * each action waits for SUBSCRIBED before sending.
 *
 * Failure here is not worth surfacing to staff: the page they are looking at is
 * refreshed by router.refresh() regardless, and the customer's page falls back
 * to its own polling.
 */
function useBookingNotifier(code: string) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const readyRef = useRef(false);

  useEffect(() => {
    const db = createClient();
    const channel = db.channel(bookingChannel(code)).subscribe((state) => {
      readyRef.current = state === "SUBSCRIBED";
    });
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      db.removeChannel(channel);
    };
  }, [code]);

  return async (status: string) => {
    const channel = channelRef.current;
    if (!channel || !readyRef.current) return;
    await channel.send({ type: "broadcast", event: "status", payload: { status } });
  };
}

export function ActionButtons({ code, status }: { code: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const notify = useBookingNotifier(code);
  const buttons = BOOKING_ACTIONS[status] ?? [];

  async function run(action: string) {
    if (action === "cancel" && !confirm(`Batalkan ${code}?`)) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/bookings/${code}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.error?.message ?? "Aksi gagal");
        return;
      }
      const body = await res.json().catch(() => null);
      await notify(body?.status ?? "UNKNOWN");
      router.refresh();
    } finally {
      // A thrown fetch (network/TLS) would otherwise leave every button
      // permanently disabled with no message at all.
      setBusy(null);
    }
  }

  if (buttons.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {buttons.map((b) => (
        <Button
          key={b.action}
          size="sm"
          variant={b.danger ? "destructive" : "secondary"}
          disabled={busy !== null}
          onClick={() => run(b.action)}
        >
          {busy === b.action ? "…" : b.label}
        </Button>
      ))}
    </div>
  );
}
