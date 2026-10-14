import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { PaymentPicker } from "@/components/payment-picker";
import { BookingStatusPill } from "@/components/status-pill";
import { Countdown } from "@/components/ticket-actions";
import { LiveBooking } from "@/components/live-booking";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtDuration, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = createAdminClient();
  const booking = await getBookingByCode(db, code);
  if (!booking) notFound();

  const pay = booking.status === "WAITING_PAYMENT";
  const expired = booking.status === "EXPIRED";
  const { data: latestPayment } = await db
    .from("payments")
    .select("status, method, created_at")
    .eq("booking_id", booking.booking_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const failed = latestPayment?.status === "FAILED" || booking.status === "CANCELLED";

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <LiveBooking code={booking.booking_code} status={booking.status} />
      {/* STEP PROGRESS */}
      <nav aria-label="Alur Reservasi" className="rounded-xl bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            <li className="flex items-center gap-1 text-muted-foreground opacity-70"><span className="grid size-5 place-items-center rounded-full bg-card text-[11px]">1</span> Tempat & Waktu</li>
            <li className="text-muted-foreground">/</li>
            <li className="flex items-center gap-1 text-muted-foreground opacity-70"><span className="grid size-5 place-items-center rounded-full bg-card text-[11px]">2</span> Game & Snack</li>
            <li className="text-muted-foreground">/</li>
            <li className="flex items-center gap-1 text-muted-foreground opacity-70"><span className="grid size-5 place-items-center rounded-full bg-card text-[11px]">3</span> Konfirmasi</li>
            <li className="text-primary">/</li>
            <li className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-primary"><span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">4</span> <span className="font-bold uppercase">Pembayaran</span></li>
            <li className="text-muted-foreground">/</li>
            <li className="flex items-center gap-1 text-muted-foreground opacity-50"><span className="grid size-5 place-items-center rounded-full bg-card text-[11px]">5</span> Tiket Selesai</li>
          </ol>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">KODE TIKET:</span>
            <span className="rounded-lg bg-card px-3 py-1 font-mono text-sm font-bold text-primary">{booking.booking_code}</span>
            <BookingStatusPill status={booking.status} />
          </div>
        </div>
      </nav>

      {/* TITLE & KICKER */}
      <header className="mt-6 flex flex-col gap-2">
        <p className="text-sm font-bold uppercase tracking-widest text-primary">TRANSAKSI QRIS LOCAL GATEWAY</p>
        <h1 className="font-display text-4xl uppercase tracking-wide md:text-5xl">Pilih Metode Pembayaran</h1>
        <p className="max-w-2xl text-muted-foreground">
          Pilih channel pelunasan digital yang paling nyaman. Pembayaran akan diproses via QRIS lokal, dan slot diverifikasi manual oleh kasir Klub Sukaria 24 Jam.
        </p>
      </header>

      {/* DEADLINE BANNER */}
      {pay && booking.payment_deadline_at && (
        <section aria-labelledby="deadline-heading" className="mt-6 rounded-xl bg-card p-4 shadow-md sm:p-6 relative overflow-hidden">
          <div className="absolute -right-8 -bottom-10 opacity-5 text-8xl">⏰</div>
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4 sm:items-center">
              <div className="grid size-12 place-items-center rounded-xl bg-card-foreground/5 text-primary">⏳</div>
              <div>
                <p id="deadline-heading" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Batas Waktu Pelunasan Unit</p>
                <p className="text-lg font-medium">Bayar sebelum <span className="font-bold text-primary">{fmtDateTime(booking.payment_deadline_at)}</span></p>
                <p className="mt-0.5 text-sm text-muted-foreground">Slot unit diamankan selama timer berjalan. Lewat batas waktu, unit dirilis otomatis.</p>
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 rounded-xl bg-card/80 px-4 py-3 md:items-end">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sisa Waktu Pembayaran</span>
              <span className="font-mono text-3xl font-bold text-primary"><Countdown deadline={booking.payment_deadline_at} doneLabel="00:00" /></span>
            </div>
          </div>
        </section>
      )}

      {/* MAIN TWO-COLUMN GRID */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT */}
        <section className="flex flex-col gap-6 lg:col-span-8">
          {pay ? (
            <PaymentPicker
              code={booking.booking_code}
              total={booking.total_amount}
              deadline={booking.payment_deadline_at}
            />
          ) : expired ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-6 text-center">
              <div className="mx-auto grid size-16 place-items-center rounded-full bg-danger/20 text-danger">
                <span aria-hidden className="text-3xl">⏳</span>
              </div>
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-danger">Waktu Pembayaran Habis</p>
              <h2 className="mt-2 font-display text-3xl uppercase">Booking Kedaluwarsa</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Batas waktu pembayaran telah berakhir, sehingga booking ini tidak lagi aktif. Slot unit telah otomatis dirilis kembali ke sistem ketersediaan.
              </p>
              <div className="mt-4 rounded-xl bg-card p-4 text-sm text-muted-foreground">
                <div className="flex justify-between"><span>Kode booking</span><span className="font-medium text-foreground">{booking.booking_code}</span></div>
                <div className="mt-1 flex justify-between"><span>Sesi</span><span>{fmtDateTime(booking.scheduled_start_at)}</span></div>
                <div className="mt-1 flex justify-between"><span>Total tagihan</span><span className="line-through text-danger">{rp(booking.total_amount)}</span></div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="flex-1"><Link href="/booking">Booking Lagi Sekarang</Link></Button>
                <Button asChild variant="outline" className="flex-1"><Link href="/">Kembali ke Home</Link></Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Kendala saat transfer? Chat Kasir 24 Jam.</p>
            </div>
          ) : failed ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-6">
              <div className="flex items-start gap-4">
                <div className="grid size-14 place-items-center rounded-2xl bg-danger/20 text-danger">
                  <TriangleAlert aria-hidden className="size-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-danger">Status: Pembayaran Belum Berhasil</p>
                  <h2 className="mt-1 font-display text-3xl uppercase">Pembayaran Belum Berhasil</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Booking kamu masih aman dan unit tetap tersimpan selama batas waktu pembayaran belum berakhir.</p>
                </div>
              </div>
              <dl className="mt-5 grid gap-3 rounded-xl bg-card p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Kode booking</dt><dd className="font-display uppercase">{booking.booking_code}</dd></div>
                <div><dt className="text-muted-foreground">Metode</dt><dd>{latestPayment?.method ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Status</dt><dd className="text-danger">{latestPayment?.status ?? "FAILED"}</dd></div>
                <div><dt className="text-muted-foreground">Terakhir coba</dt><dd>{latestPayment?.created_at ? fmtDateTime(latestPayment.created_at) : "—"}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild><Link href={`/booking`}>Bayar Lagi Sekarang</Link></Button>
                <Button asChild variant="outline"><Link href={`/tiket/${booking.booking_code}`}>Lihat Detail Tiket</Link></Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Saldo terpotong tapi masih gagal? Hubungi Kasir Ganet 24 Jam dengan screenshot mutasi.</p>
            </div>
          ) : (
            <p className="rounded-xl border border-border bg-card p-5 text-primary">Pembayaran untuk booking ini sudah tidak menunggu ({booking.status}).</p>
          )}
        </section>

        {/* RIGHT */}
        <aside aria-labelledby="summary-heading" className="lg:col-span-4 flex flex-col gap-6 lg:sticky lg:top-24">
          <div className="rounded-2xl bg-card p-6 shadow-md">
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">RESERVASI AKTIF</span>
                <h2 id="summary-heading" className="text-xl font-medium uppercase tracking-wide">RINGKASAN BOOKING</h2>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase text-primary">SLOT TERSIMPAN</span>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-lg bg-card-foreground/5 p-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kode Booking</span>
                <span className="font-mono text-sm font-bold">{booking.booking_code}</span>
              </div>
            </div>

            <div className="mb-4 rounded-xl bg-card p-4">
              <p className="font-medium">Unit & Lokasi</p>
              <p className="mt-1 text-sm text-muted-foreground">Sesi {fmtDateTime(booking.scheduled_start_at)} ({fmtDuration(booking.duration_minutes)})</p>
            </div>

            <dl className="space-y-2 text-sm">
              {booking.rental_amount > 0 && (<div className="flex justify-between"><dt className="text-muted-foreground">Sewa</dt><dd>{rp(booking.rental_amount)}</dd></div>)}
              {booking.snack_amount > 0 && (<div className="flex justify-between"><dt className="text-muted-foreground">Cemilan</dt><dd>{rp(booking.snack_amount)}</dd></div>)}
              {booking.discount_amount > 0 && (<div className="flex justify-between text-primary"><dt>Diskon</dt><dd>−{rp(booking.discount_amount)}</dd></div>)}
            </dl>

            <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">TOTAL PEMBAYARAN</span>
              <span className="font-mono text-2xl font-bold text-primary">{rp(booking.total_amount)}</span>
            </div>

            <div className="mt-4 rounded-xl bg-card/80 p-3 text-xs text-muted-foreground">
              <p className="font-bold text-foreground">Butuh bantuan pembayaran?</p>
              <p>Kasir Ganet standby 24 jam via WhatsApp.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

