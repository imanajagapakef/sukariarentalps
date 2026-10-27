import Link from "next/link";
import { BadgeCheck, CheckCircle2, Clock, Headset, ShieldCheck, Sparkles, Ticket, TriangleAlert, Wallet } from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { PaymentPicker } from "@/components/payment-picker";
import { PaymentProofForm } from "@/components/payment-proof-form";
import { BookingStatusPill } from "@/components/status-pill";
import { Countdown } from "@/components/ticket-actions";
import { LiveBooking } from "@/components/live-booking";
import { Button } from "@/components/ui/button";
import { fmtDateTime, fmtDuration, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Must match the number of proof uploads the proof form allows. */
const MAX_PROOFS = 3;

const STEPS = ["Tempat & Waktu", "Game & Snack", "Konfirmasi", "Pembayaran", "Tiket Selesai"] as const;

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

  // Only the count, and only when the form is about to render: the proof form needs
  // to know how many of the three allowed attempts are used up so it can stop
  // offering a fourth.
  const { count: proofCount } = pay
    ? await db
        .from("payment_proofs")
        .select("proof_id", { count: "exact", head: true })
        .eq("booking_id", booking.booking_id)
    : { count: 0 };

  const used = proofCount ?? 0;
  const attemptsLeft = Math.max(0, MAX_PROOFS - used);

  // The sweep that flips WAITING_PAYMENT to EXPIRED runs on a schedule, so for a
  // short while a booking can be past its deadline yet still read as payable. Say so
  // instead of showing a countdown stuck at 00:00 beside a live pay button.
  const deadlineMs = booking.payment_deadline_at ? new Date(booking.payment_deadline_at).getTime() : null;
  const pastDeadline = pay && deadlineMs !== null && deadlineMs <= Date.now();
  const minutesLeft = pay && deadlineMs !== null ? Math.ceil((deadlineMs - Date.now()) / 60_000) : null;
  const urgent = !pastDeadline && minutesLeft !== null && minutesLeft <= 5;

  // Money breakdown. Discount is measured against what it was taken off.
  const gross = booking.rental_amount + booking.snack_amount;
  const savePct = booking.discount_amount > 0 && gross > 0 ? Math.round((booking.discount_amount / gross) * 100) : 0;

  const paidOrBeyond = !pay && !expired && !failed;
  const currentStep = paidOrBeyond ? 5 : 4; // 1-based; 5 = ticket done

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8">
      <LiveBooking code={booking.booking_code} status={booking.status} />

      {/* STEP PROGRESS */}
      <nav aria-label="Alur Reservasi" className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm">
            {STEPS.map((label, i) => {
              const n = i + 1;
              const done = n < currentStep;
              const active = n === currentStep;
              return (
                <li key={label} className="flex items-center gap-1" aria-current={active ? "step" : undefined}>
                  {i > 0 && (
                    <span aria-hidden className={`mx-1 h-px w-4 sm:w-6 ${done || active ? "bg-primary" : "bg-border"}`} />
                  )}
                  {active ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-primary ring-1 ring-primary/30">
                      <span className="grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{n}</span>
                      <span className="font-bold uppercase">{label}</span>
                    </span>
                  ) : done ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2 aria-hidden className="size-5 text-primary" />
                      <span className="hidden sm:inline">{label}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-muted-foreground opacity-60">
                      <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px]">{n}</span>
                      <span className="hidden sm:inline">{label}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">KODE TIKET:</span>
            <span className="rounded-lg bg-muted px-3 py-1 font-mono text-sm font-bold tracking-wider text-primary">{booking.booking_code}</span>
            <BookingStatusPill status={booking.status} />
          </div>
        </div>
      </nav>

      <PageHero
        className="mt-6"
        eyebrow={{ icon: Wallet, label: "Transaksi QRIS local gateway" }}
        title="Pilih Metode Pembayaran"
        titleIcon={Wallet}
        description="Satu langkah lagi dan unit kamu resmi terkunci. Pembayaran diproses via QRIS lokal, dan slot diverifikasi manual oleh kasir Klub Sukaria 24 Jam."
      />

      {/* DEADLINE BANNER */}
      {pay && booking.payment_deadline_at && (
        <section
          aria-labelledby="deadline-heading"
          className={`relative mt-6 overflow-hidden rounded-2xl border p-4 shadow-md sm:p-6 ${
            pastDeadline
              ? "border-danger/50 bg-danger/10"
              : urgent
                ? "border-warning/60 bg-warning/10"
                : "border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card"
          }`}
        >
          <div aria-hidden className="pointer-events-none absolute -right-8 -bottom-10 text-8xl opacity-5">⏰</div>
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4 sm:items-center">
              <div
                className={`grid size-12 shrink-0 place-items-center rounded-xl ${
                  pastDeadline ? "bg-danger/20 text-danger" : urgent ? "bg-warning/20 text-warning" : "bg-primary/10 text-primary"
                }`}
              >
                <Clock aria-hidden className={`size-6 ${urgent ? "animate-pulse" : ""}`} />
              </div>
              <div>
                <p id="deadline-heading" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {pastDeadline ? "Batas Waktu Terlewat" : urgent ? "Segera! Waktu Hampir Habis" : "Batas Waktu Pelunasan Unit"}
                </p>
                <p className="text-lg font-medium">
                  Bayar sebelum <span className="font-bold text-primary">{fmtDateTime(booking.payment_deadline_at)}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {pastDeadline
                    ? "Booking ini sebentar lagi dirilis otomatis. Muat ulang halaman untuk status terbaru."
                    : "Slot unit diamankan selama timer berjalan. Lewat batas waktu, unit dirilis otomatis."}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-start gap-1 rounded-xl bg-card/80 px-4 py-3 ring-1 ring-border md:items-end">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sisa Waktu Pembayaran</span>
              <span className={`font-mono text-3xl font-bold tabular-nums ${pastDeadline ? "text-danger" : urgent ? "text-warning" : "text-primary"}`}>
                <Countdown deadline={booking.payment_deadline_at} doneLabel="00:00" />
              </span>
            </div>
          </div>
        </section>
      )}

      {/* MAIN TWO-COLUMN GRID */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT */}
        <section className="flex flex-col gap-6 lg:col-span-8">
          {pay ? (
            <>
              <PaymentPicker
                code={booking.booking_code}
                total={booking.total_amount}
                deadline={booking.payment_deadline_at}
              />
              <PaymentProofForm
                code={booking.booking_code}
                total={booking.total_amount}
                used={used}
              />
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck aria-hidden className="size-4 shrink-0 text-primary" />
                {attemptsLeft > 0
                  ? `Kamu masih punya ${attemptsLeft} dari ${MAX_PROOFS} kesempatan unggah bukti bayar.`
                  : `Kesempatan unggah bukti (${MAX_PROOFS}x) sudah terpakai — hubungi kasir bila perlu bantuan.`}
              </p>
            </>
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
                  <p className="text-xs font-bold uppercase tracking-widest text-danger">
                    {booking.status === "CANCELLED" ? "Status: Booking Dibatalkan" : "Status: Pembayaran Belum Berhasil"}
                  </p>
                  <h2 className="mt-1 font-display text-3xl uppercase">
                    {booking.status === "CANCELLED" ? "Booking Dibatalkan" : "Pembayaran Belum Berhasil"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {booking.status === "CANCELLED"
                      ? "Booking ini sudah dibatalkan dan slot unitnya dilepas. Kamu bisa membuat booking baru kapan saja."
                      : "Booking kamu masih aman dan unit tetap tersimpan selama batas waktu pembayaran belum berakhir."}
                  </p>
                </div>
              </div>
              <dl className="mt-5 grid gap-3 rounded-xl bg-card p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-muted-foreground">Kode booking</dt><dd className="font-display uppercase">{booking.booking_code}</dd></div>
                <div><dt className="text-muted-foreground">Metode</dt><dd>{latestPayment?.method ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Status</dt><dd className="text-danger">{latestPayment?.status ?? "FAILED"}</dd></div>
                <div><dt className="text-muted-foreground">Terakhir coba</dt><dd>{latestPayment?.created_at ? fmtDateTime(latestPayment.created_at) : "—"}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild><Link href={`/booking`}>{booking.status === "CANCELLED" ? "Booking Baru" : "Bayar Lagi Sekarang"}</Link></Button>
                <Button asChild variant="outline"><Link href={`/tiket/${booking.booking_code}`}>Lihat Detail Tiket</Link></Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">Saldo terpotong tapi masih gagal? Hubungi Kasir Ganet 24 Jam dengan screenshot mutasi.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-6 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/15 text-primary">
                <BadgeCheck aria-hidden className="size-8" />
              </div>
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-primary">Pembayaran Tidak Lagi Menunggu</p>
              <h2 className="mt-1 font-display text-2xl uppercase">Status: {booking.status}</h2>
              <p className="mt-2 text-sm text-muted-foreground">Tidak ada yang perlu dibayar untuk booking ini. Tiket kamu ada di halaman tiket.</p>
              <Button asChild className="mt-4"><Link href={`/tiket/${booking.booking_code}`}><Ticket aria-hidden className="size-4" /> Buka Tiket</Link></Button>
            </div>
          )}
        </section>

        {/* RIGHT */}
        <aside aria-labelledby="summary-heading" className="flex flex-col gap-6 lg:sticky lg:top-24 lg:col-span-4">
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-md">
            <div aria-hidden className={`h-1.5 w-full ${pay ? "bg-primary" : expired || failed ? "bg-danger" : "bg-primary"}`} />
            <div className="p-6">
              <div className="mb-4 flex items-start justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    {pay ? "RESERVASI AKTIF" : expired ? "RESERVASI BERAKHIR" : failed ? "RESERVASI BERMASALAH" : "RESERVASI"}
                  </span>
                  <h2 id="summary-heading" className="text-xl font-medium uppercase tracking-wide">RINGKASAN BOOKING</h2>
                </div>
                {pay && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase text-primary">
                    <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />
                    SLOT TERSIMPAN
                  </span>
                )}
              </div>

              <div className="mb-4 flex items-center justify-between rounded-lg bg-card-foreground/5 p-3">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Kode Booking</span>
                  <span className="font-mono text-sm font-bold tracking-wider">{booking.booking_code}</span>
                </div>
                <Ticket aria-hidden className="size-5 text-primary" />
              </div>

              <div className="mb-4 rounded-xl bg-muted/50 p-4">
                <p className="font-medium">Unit & Lokasi</p>
                <p className="mt-1 text-sm text-muted-foreground">Sesi {fmtDateTime(booking.scheduled_start_at)} ({fmtDuration(booking.duration_minutes)})</p>
              </div>

              <dl className="space-y-2 text-sm">
                {booking.rental_amount > 0 && (<div className="flex justify-between"><dt className="text-muted-foreground">Sewa</dt><dd className="tabular-nums">{rp(booking.rental_amount)}</dd></div>)}
                {booking.snack_amount > 0 && (<div className="flex justify-between"><dt className="text-muted-foreground">Cemilan</dt><dd className="tabular-nums">{rp(booking.snack_amount)}</dd></div>)}
                {booking.discount_amount > 0 && (
                  <div className="flex justify-between text-primary">
                    <dt>Diskon{savePct > 0 ? ` (${savePct}%)` : ""}</dt>
                    <dd className="tabular-nums">−{rp(booking.discount_amount)}</dd>
                  </div>
                )}
              </dl>

              {booking.discount_amount > 0 && (
                <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                  <Sparkles aria-hidden className="size-3.5 shrink-0" />
                  Kamu hemat {rp(booking.discount_amount)} di booking ini!
                </p>
              )}

              <div className="mt-4 flex items-baseline justify-between gap-2 border-t border-dashed border-border pt-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">TOTAL PEMBAYARAN</span>
                <span className="font-mono text-2xl font-bold tabular-nums text-primary">{rp(booking.total_amount)}</span>
              </div>

              <div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                <Headset aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                <div>
                  <p className="font-bold text-foreground">Butuh bantuan pembayaran?</p>
                  <p>Kasir Ganet standby 24 jam via WhatsApp.</p>
                </div>
              </div>
            </div>
          </div>

          {pay && (
            <ul className="grid gap-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><ShieldCheck aria-hidden className="size-4 shrink-0 text-primary" /> Diverifikasi manual oleh kasir</li>
              <li className="flex items-center gap-2"><Clock aria-hidden className="size-4 shrink-0 text-primary" /> Slot dikunci selama timer berjalan</li>
              <li className="flex items-center gap-2"><Ticket aria-hidden className="size-4 shrink-0 text-primary" /> Tiket langsung terbit setelah terverifikasi</li>
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}