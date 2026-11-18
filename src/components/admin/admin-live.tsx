"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Wifi, WifiOff } from "lucide-react";
import { ADMIN_CHANNEL } from "@/lib/realtime-notify";
import { cn } from "@/lib/utils";
import { whenIdle } from "@/lib/when-idle";

/**
 * Data admin tetap hidup tanpa polling.
 *
 * Halaman admin sebelumnya memanggil `router.refresh()` tiap 60 detik
 * (`LiveRefresh`) — mahal (setiap refresh menjalankan ulang seluruh server
 * component, termasuk laporan) dan tetap bisa telat sampai satu menit. Sekarang
 * server yang memberi tahu klien: Supabase Realtime mengirim event saat
 * `bookings` atau `payment_proofs` berubah, dan halaman memuat ulang data hanya
 * ketika memang ada perubahan.
 *
 * Kenapa aman lewat anon client: `postgres_changes` menghormati RLS, jadi
 * staf yang login hanya menerima baris yang memang boleh ia baca (policy
 * "staff manage bookings" + "staff read payment proofs"). Anon tidak menerima
 * apa pun.
 *
 * Polling tetap dipertahankan sebagai jaring pengaman dengan jeda jauh lebih
 * panjang (5 menit) — WebSocket bisa mati (tab tidur, jaringan seluler) dan
 * antrean pembayaran tidak boleh membeku. Fallback ini dipilih supaya tidak
 * kembali menjadi beban seperti versi 60 detik.
 */
const FALLBACK_MS = 5 * 60_000;

export function AdminLive() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [connected, setConnected] = useState(false);

  // Debounce: satu burst tulisan (mis. create_booking menulis bookings +
  // unit_reservations + inventory) memicu satu refresh, bukan sepuluh.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schedule = useRef(() => {});

  useEffect(() => {
    schedule.current = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        router.refresh();
      }, 500);
    };
  });

  useEffect(() => {
    let disposed = false;
    let cleanupChannel: (() => void) | null = null;

    const onVisible = () => {
      if (document.visibilityState === "visible") schedule.current();
    };
    const onOnline = () => {
      setOnline(true);
      schedule.current();
    };
    const onOffline = () => setOnline(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    setOnline(navigator.onLine);

    const fallback = setInterval(() => {
      if (document.visibilityState === "visible") schedule.current();
    }, FALLBACK_MS);

    // Supabase diimpor dinamis saat browser menganggur: tidak ada yang butuh
    // sebelum langganan dibuka, dan import statis menaruh ~250 KB ke bundle awal
    // setiap halaman admin (menu jadi terasa berat saat pertama dibuka).
    const cancelIdle = whenIdle(() => {
      void (async () => {
        const { createClient } = await import("@/lib/supabase/client");
        if (disposed) return;
        const db = createClient();
        const channel = db
          .channel(ADMIN_CHANNEL)
          // Broadcast dari server: sampai tanpa bergantung pada RLS tabel.
          .on("broadcast", { event: "changed" }, () => schedule.current())
          // Bonus: kalau Realtime postgres_changes aktif untuk project ini,
          // event baris juga langsung memicu refresh.
          .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => schedule.current())
          .on("postgres_changes", { event: "*", schema: "public", table: "payment_proofs" }, () => schedule.current())
          .subscribe((state) => {
            setConnected(state === "SUBSCRIBED");
          });
        cleanupChannel = () => {
          void db.removeChannel(channel);
        };
      })();
    });

    return () => {
      disposed = true;
      cancelIdle();
      if (timer.current) clearTimeout(timer.current);
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      cleanupChannel?.();
    };
  }, [router]);

  const live = online && connected;
  return (
    <div
      title={
        !online
          ? "Tidak ada koneksi"
          : connected
            ? "Terhubung — data masuk otomatis"
            : "Menyambung ke siaran data..."
      }
      className={cn(
        "fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border bg-card/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-lg backdrop-blur",
        !online ? "border-coral/50 text-coral" : live ? "border-primary/30 text-primary" : "border-amber/50 text-amber",
      )}
    >
      {online ? (
        <>
          <span className="relative flex size-2">
            {live && (
              <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
            )}
            <span className={cn("relative inline-flex size-2 rounded-full", live ? "bg-primary" : "bg-amber")} />
          </span>
          <span role="status">{live ? "Live" : "Menyambung..."}</span>
        </>
      ) : (
        <>
          <WifiOff aria-hidden className="size-3.5" />
          <span role="status">Offline</span>
        </>
      )}
      <Wifi aria-hidden className="hidden" />
    </div>
  );
}
