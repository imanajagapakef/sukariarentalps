"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { CalendarCheck, CircleCheck, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDateTime, rp } from "@/lib/format";

/**
 * Perayaan "pembayaran diterima" untuk pelanggan yang halamannya masih terbuka
 * saat kasir menekan Konfirmasi.
 *
 * Tidak ada polling sendiri: `LiveBooking` sudah memicu `router.refresh()` saat
 * kasir mengonfirmasi, sehingga prop `status` berubah dan komponen ini melihat
 * transisinya. Penjagaannya:
 *
 *  - Hanya muncul kalau status AWAL halaman ini MENUNGGU_PEMBAYARAN. Pelanggan
 *    yang membuka tiket yang sudah lunas tidak disambut popup.
 *  - Sekali per pemuatan halaman (ref), jadi refresh berikutnya tidak
 *    memunculkannya lagi.
 *
 * Animasi memakai `motion-safe:` sehingga pengguna yang meminta gerak
 * dikurangi hanya melihat versi diam.
 */
export function PaymentConfirmedCelebration({
  status,
  code,
  total,
  scheduledStartAt,
  unitName,
}: {
  status: string;
  code: string;
  total: number;
  scheduledStartAt: string;
  unitName: string;
}) {
  const initialStatus = useRef(status);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (initialStatus.current !== "WAITING_PAYMENT") return;
    if (status !== "CONFIRMED") return;
    setOpen(true);
  }, [status]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm motion-safe:animate-[fade-in_180ms_ease-out]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-primary/40 bg-card shadow-2xl motion-safe:animate-[pop-in_260ms_cubic-bezier(0.16,1,0.3,1)]"
          aria-describedby="paid-desc"
        >
          {/* Pita atas + kilau. Badge diletakkan di luar pita yang
              `overflow-hidden`, kalau tidak separuh lingkarannya terpotong. */}
          <div className="relative">
            <div aria-hidden className="relative h-24 overflow-hidden rounded-t-3xl bg-gradient-to-br from-primary/30 via-primary/10 to-transparent">
              <div aria-hidden className="absolute -right-6 -top-8 size-32 rounded-full bg-primary/30 blur-2xl" />
              <div aria-hidden className="absolute -left-10 top-4 size-24 rounded-full bg-amber/20 blur-2xl" />
              {/* konfeti: kecil, hanya saat gerak diizinkan */}
              {[
                "left-[12%] top-6 bg-primary",
                "left-[26%] top-2 bg-amber",
                "left-[38%] top-9 bg-primary/70",
                "left-[52%] top-3 bg-amber/80",
                "left-[66%] top-8 bg-primary/60",
                "left-[78%] top-4 bg-amber/70",
                "left-[88%] top-10 bg-primary/50",
              ].map((c, i) => (
                <span
                  key={i}
                  aria-hidden
                  className={`absolute size-1.5 rounded-sm ${c} motion-safe:animate-[confetti_900ms_ease-out_forwards]`}
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            <div className="absolute inset-x-0 top-24 flex -translate-y-1/2 justify-center">
              <span className="grid size-16 place-items-center rounded-full border-4 border-card bg-primary text-primary-foreground shadow-lg motion-safe:animate-[badge-pop_420ms_cubic-bezier(0.16,1,0.3,1)]">
                <CircleCheck aria-hidden className="size-9" />
              </span>
            </div>
          </div>

          <div className="px-6 pb-6 pt-12 text-center">
            <Dialog.Title className="font-display text-2xl uppercase tracking-wide text-primary">
              Pembayaran diterima
            </Dialog.Title>
            <Dialog.Description id="paid-desc" className="mt-1 text-sm text-muted-foreground">
              Kasir sudah memverifikasi pembayaranmu. Unit terkunci untukmu — sampai jumpa!
            </Dialog.Description>

            <dl className="mt-4 space-y-2 rounded-2xl bg-surface-low p-4 text-left text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <Ticket aria-hidden className="size-3.5" /> Kode
                </dt>
                <dd className="font-mono font-bold tracking-wider">{code}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CalendarCheck aria-hidden className="size-3.5" /> Sesi
                </dt>
                <dd className="text-right font-medium">{fmtDateTime(scheduledStartAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Unit</dt>
                <dd className="font-medium">{unitName}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                <dt className="text-muted-foreground">Dibayar</dt>
                <dd className="font-mono text-base font-bold tabular-nums text-primary">{rp(total)}</dd>
              </div>
            </dl>

            <Dialog.Close asChild>
              <Button className="mt-5 w-full">Lihat tiket</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}