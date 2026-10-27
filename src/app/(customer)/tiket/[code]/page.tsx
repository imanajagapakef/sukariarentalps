import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import {
  Ban,
  CalendarPlus,
  CircleCheck,
  Clock,
  Hourglass,
  MapPin,
  MessageCircle,
  Plus,
  Receipt,
  Sparkles,
  Ticket,
  UserX,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { hasBookingAccess } from "@/lib/booking-access";
import { BookingStatusPill } from "@/components/status-pill";
import { Cover } from "@/components/cover";
import { Button } from "@/components/ui/button";
import { PayButton, CancelButton, Countdown, CopyCodeButton } from "@/components/ticket-actions";
import { LiveBooking } from "@/components/live-booking";
import { fmtDateTime, fmtDuration, fmtISODay, fmtTime, rp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WA_NUMBER = "6281398765432";
/** Hanya status ini yang punya tiket yang bisa ditunjukkan di kasir. */
const LIVE = new Set(["WAITING_PAYMENT", "CONFIRMED", "IN_USE"]);

type Tone = "success" | "warning" | "primary" | "danger" | "neutral";

const TONE_BOX: Record<Tone, string> = {
  success: "border-success/40 bg-success/10",
  warning: "border-warning/40 bg-warning/10",
  primary: "border-primary/40 bg-primary/10",
  danger: "border-danger/40 bg-danger/10",
  neutral: "border-border bg-card",
};
const TONE_TEXT: Record<Tone, string> = {
  success: "text-success",
  warning: "text-warning",
  primary: "text-primary",
  danger: "text-danger",
  neutral: "text-muted-foreground",
};

/** Penjelasan untuk status yang sudah berakhir: tanpa ini halaman terasa rusak, bukan selesai. */
const END_STATE: Record<string, { icon: LucideIcon; tone: Tone; title: string; body: string }> = {
  CANCELLED: {
    icon: Ban,
    tone: "danger",
    title: "Booking dibatalkan",
    body: "Slot ini sudah dilepas. Kamu bisa membuat booking baru kapan saja.",
  },
  EXPIRED: {
    icon: Hourglass,
    tone: "danger",
    title: "Batas pembayaran terlewat",
    body: "Pembayaran tidak selesai tepat waktu, jadi slot-nya dilepas. Buat booking baru untuk main.",
  },
  NO_SHOW: {
    icon: UserX,
    tone: "danger",
    title: "Tercatat tidak hadir",
    body: "Sesi ini lewat tanpa check-in. Kalau ini keliru, hubungi kasir.",
  },
  COMPLETED: {
    icon: Sparkles,
    tone: "neutral",
    title: "Sesi selesai",
    body: "Makasih sudah main! Sampai ketemu lagi.",
  },
  READY: {
    icon: Sparkles,
    tone: "neutral",
    title: "Sesi selesai",
    body: "Makasih sudah main! Sampai ketemu lagi.",
  },
};

const STAGES = ["Bayar", "Terkonfirmasi", "Main", "Selesai"] as const;
const stageIndex = (s: string) =>
  s === "WAITING_PAYMENT" ? 0 : s === "CONFIRMED" ? 1 : s === "IN_USE" ? 2 : s === "COMPLETED" || s === "READY" ? 3 : -1;

/** "Hari ini" / "Besok" dalam WIB, bukan timezone server. */
function dayLabel(iso: string) {
  const day = fmtISODay(new Date(iso));
  const now = Date.now();
  if (day === fmtISODay(new Date(now))) return "Hari ini";
  if (day === fmtISODay(new Date(now + 86_400_000))) return "Besok";
  return null;
}

const gcalStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

/**
 * Absolute origin for the QR payload. Read from the request rather than a new
 * env var: there is no configured site URL in this project, and a QR that
 * encodes a relative path is unscannable. The page is already force-dynamic, so
 * this opts it out of nothing.
 */
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// The ticket exposes the customer's phone and totals, so the code alone must
// not grant access. The gate is checked before any query: a visitor without
// the cookie never reaches the database at all.
export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!(await hasBookingAccess(code))) {
    redirect(`/cek-booking?code=${encodeURIComponent(code)}`);
  }
  const db = createAdminClient();
  const booking = await getBookingByCode(db, code);
  if (!booking) notFound();

  const status = booking.status;
  const isLive = LIVE.has(status);
  const origin = await siteOrigin();
  // The QR encodes the ticket URL rather than the bare code: any phone camera
  // then opens the booking, which is what staff actually want to see.
  const ticketUrl = `${origin}/tiket/${encodeURIComponent(booking.booking_code)}`;

  // Independent of each other, so they run together. A booking that is over has no use
  // for a QR, so it is not generated at all.
  const [{ data: unit }, qr] = await Promise.all([
    db
      .from("units")
      .select("name, image_url, branches(name, short_name, address)")
      .eq("unit_id", booking.unit_id)
      .maybeSingle(),
    isLive
      ? QRCode.toDataURL(ticketUrl, { width: 512, margin: 1, errorCorrectionLevel: "M" })
      : Promise.resolve(null),
  ]);

  const unitName = unit?.name ?? "Unit";
  const branchName = unit?.branches?.short_name ?? unit?.branches?.name ?? "";
  const address = unit?.branches?.address ?? null;
  const codeParam = encodeURIComponent(booking.booking_code);

  const shareText = encodeURIComponent(
    `Halo, ini booking saya di Klub Sukaria — kode ${booking.booking_code}.`,
  );
  const helpText = encodeURIComponent(`Halo kasir, saya butuh bantuan untuk booking ${booking.booking_code}.`);
  const calendarHref =
    `https://calendar.google.com/calendar/render?action=TEMPLATE` +
    `&text=${encodeURIComponent(`Main di Klub Sukaria · ${unitName}`)}` +
    `&dates=${gcalStamp(booking.scheduled_start_at)}/${gcalStamp(booking.scheduled_end_at)}` +
    `&details=${encodeURIComponent(`Kode booking ${booking.booking_code}. Tiket: ${ticketUrl}`)}` +
    (address ? `&location=${encodeURIComponent(address)}` : "");
  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  const sameDay = fmtISODay(new Date(booking.scheduled_start_at)) === fmtISODay(new Date(booking.scheduled_end_at));
  const when = dayLabel(booking.scheduled_start_at);
  const stage = stageIndex(status);
  const end = END_STATE[status];
  const EndIcon = end?.icon;
  const canCalendar = status === "WAITING_PAYMENT" || status === "CONFIRMED";

  return (
    <div className="relative isolate overflow-hidden">
      <div aria-hidden className="absolute -right-24 -top-28 -z-10 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div aria-hidden className="absolute -left-24 top-1/2 -z-10 size-80 rounded-full bg-amber/10 blur-3xl" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "20px 20px" }}
      />

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-10 md:px-8">
        <LiveBooking code={booking.booking_code} status={booking.status} />

        {/* ============================ HEADER ============================ */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
              <Ticket aria-hidden className="size-3.5 text-primary" /> Tiket booking
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-3xl uppercase tracking-wide md:text-5xl">{booking.booking_code}</h1>
              <CopyCodeButton code={booking.booking_code} />
            </div>
          </div>
          <BookingStatusPill status={status} />
        </header>

        {/* ======================== STATUS / COUNTDOWN ===================== */}
        {status === "WAITING_PAYMENT" && booking.payment_deadline_at && (
          <section className={cn("rounded-2xl border p-5", TONE_BOX.warning)}>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-warning">
              <Hourglass aria-hidden className="size-4" /> Menunggu pembayaran
            </p>
            <p className="mt-1 text-sm text-warning">Selesaikan pembayaran sebelum:</p>
            <Countdown deadline={booking.payment_deadline_at} />
            <PayButton code={booking.booking_code} className="mt-3 w-full" />
          </section>
        )}

        {/* Paid. The design leads with this; live previously added a single muted
            paragraph, so a confirmed booking looked identical to an unpaid one. */}
        {status === "CONFIRMED" && (
          <section className={cn("rounded-2xl border p-5", TONE_BOX.success)}>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-success">
              <CircleCheck aria-hidden className="size-4" /> Pembayaran terverifikasi · Lunas
            </p>
            <h2 className="font-display mt-1 text-xl uppercase">Booking berhasil — tiket siap</h2>
            <div className="mt-4 rounded-xl bg-background/60 p-4 text-center">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Sesi kamu mulai dalam</h3>
              <Countdown
                deadline={booking.scheduled_start_at}
                tone="primary"
                doneLabel="Sesi sudah dimulai — cek di kasir"
              />
              <p className="mt-1 text-sm text-muted-foreground">{fmtDateTime(booking.scheduled_start_at)}</p>
            </div>
          </section>
        )}

        {status === "IN_USE" && (
          <section className={cn("rounded-2xl border p-5", TONE_BOX.primary)}>
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full rounded-full bg-primary opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <Zap aria-hidden className="size-4" /> Sedang main
            </p>
            <p className="mt-1 text-sm text-primary">Sesi kamu selesai dalam:</p>
            <Countdown deadline={booking.scheduled_end_at} doneLabel="Waktu main habis — perpanjang di kasir" />
            <p className="mt-2 text-sm text-muted-foreground">
              Butuh tambahan waktu?{" "}
              <Link className="font-bold text-primary hover:underline" href={`/extension?code=${codeParam}`}>
                Extension
              </Link>
            </p>
          </section>
        )}

        {end && EndIcon && (
          <section className={cn("rounded-2xl border p-5", TONE_BOX[end.tone])}>
            <div className="flex items-start gap-3">
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-background/60", TONE_TEXT[end.tone])}>
                <EndIcon aria-hidden className="size-6" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl uppercase">{end.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{end.body}</p>
                <Button asChild size="sm" className="mt-3">
                  <Link href="/booking">
                    <Plus aria-hidden className="mr-1.5 size-4" /> Booking lagi
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* ============================ STEPPER =========================== */}
        {stage >= 0 && (
          <ol aria-label="Tahap booking" className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 p-3">
            {STAGES.map((label, i) => {
              const done = i < stage;
              const current = i === stage;
              return (
                <li key={label} className="flex flex-1 items-center gap-2" aria-current={current ? "step" : undefined}>
                  <span
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                      done || (current && i === STAGES.length - 1)
                        ? "border-primary bg-primary text-primary-foreground"
                        : current
                          ? "border-primary text-primary"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    {done || (current && i === STAGES.length - 1) ? <CircleCheck aria-hidden className="size-4" /> : i + 1}
                  </span>
                  <span className={cn("hidden text-xs font-medium sm:inline", i <= stage ? "text-foreground" : "text-muted-foreground")}>
                    {label}
                  </span>
                  {i < STAGES.length - 1 && <span aria-hidden className={cn("h-px flex-1", done ? "bg-primary" : "bg-border")} />}
                </li>
              );
            })}
          </ol>
        )}

        {/* ============================ TIKET ============================= */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
          <div aria-hidden className="absolute -right-10 -top-12 size-44 rounded-full bg-primary/10 blur-3xl" />

          <div className="relative grid gap-5 p-5 sm:grid-cols-2">
            <div>
              <h2 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <Clock aria-hidden className="size-3.5 text-primary" /> Waktu
              </h2>
              <p className="font-display mt-1 text-lg">
                {when && (
                  <span className="mr-2 rounded-full bg-primary/15 px-2 py-0.5 align-middle text-[11px] font-bold uppercase text-primary">
                    {when}
                  </span>
                )}
                {fmtDateTime(booking.scheduled_start_at)}
              </p>
              <p className="text-sm text-muted-foreground">
                sampai {sameDay ? fmtTime(booking.scheduled_end_at) : fmtDateTime(booking.scheduled_end_at)}
              </p>
              <p className="mt-1 text-sm font-bold text-primary">{fmtDuration(booking.duration_minutes)}</p>
            </div>

            <div>
              <h2 className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                <MapPin aria-hidden className="size-3.5 text-primary" /> Tempat
              </h2>
              <div className="mt-1 flex items-start gap-3">
                <Cover
                  seed={booking.unit_id}
                  src={unit?.image_url ?? null}
                  label={branchName}
                  className="size-14 shrink-0 rounded-xl"
                />
                <div className="min-w-0">
                  <p className="font-display text-lg leading-tight">{unitName}</p>
                  <p className="text-sm text-muted-foreground">{branchName}</p>
                </div>
              </div>
              {/* This was already in the select and never rendered — a customer holding
                  this page has no way to find the room. */}
              {address && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {address}
                  {mapsHref && (
                    <>
                      {" "}
                      <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="font-bold text-primary hover:underline">
                        Buka peta
                      </a>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          {isLive && qr && (
            <>
              {/* garis sobekan + takik */}
              <div className="relative">
                <span aria-hidden className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full border border-border bg-background" />
                <span aria-hidden className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full border border-border bg-background" />
                <div className="mx-6 border-t-2 border-dashed border-border" />
              </div>

              <div className="relative flex flex-wrap items-center gap-5 p-5">
                {/* The white padding is the QR quiet zone, not styling: scanners need the
                    light margin to locate the finder patterns. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI, sized explicitly */}
                <img
                  src={qr}
                  alt={`QR booking ${booking.booking_code}`}
                  width={160}
                  height={160}
                  className="size-40 shrink-0 rounded-xl bg-white p-1.5 shadow-md"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-lg uppercase">Tunjukkan di kasir</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pindai QR ini, atau sebutkan kode{" "}
                    <span className="font-bold text-foreground">{booking.booking_code}</span> saat datang. Simpan halaman
                    ini supaya mudah dibuka lagi.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={`https://wa.me/?text=${shareText}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-sm font-medium transition-colors hover:border-primary"
                    >
                      <MessageCircle aria-hidden className="size-4 text-primary" /> Bagikan via WhatsApp
                    </a>
                    {canCalendar && (
                      <a
                        href={calendarHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 text-sm font-medium transition-colors hover:border-primary"
                      >
                        <CalendarPlus aria-hidden className="size-4 text-primary" /> Tambah ke kalender
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* barcode dekoratif */}
              <div
                aria-hidden
                className="mx-5 mb-5 h-8 text-foreground opacity-40"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px, currentColor 5px 6px, transparent 6px 10px)",
                }}
              />
            </>
          )}
        </section>

        {/* =========================== RINCIAN ============================ */}
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display flex items-center gap-2 uppercase">
            <Receipt aria-hidden className="size-4 text-primary" /> Rincian
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {booking.booking_items.map((it) => (
              <li key={it.booking_item_id} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {it.description}
                  {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                </span>
                <span className="shrink-0 tabular-nums">{rp(it.subtotal)}</span>
              </li>
            ))}
            {booking.discount_amount > 0 && (
              <li className="flex justify-between gap-3 font-medium text-primary">
                {/* Naming the promo matters as soon as there is a discount: a bare
                    "−Rp 20.000" leaves the customer wondering what was taken off, and
                    staff with the counter asking the same question. */}
                <span className="min-w-0">
                  Diskon
                  {booking.promotions?.name ? ` · Promo ${booking.promotions.name}` : ""}
                </span>
                <span className="shrink-0 tabular-nums">−{rp(booking.discount_amount)}</span>
              </li>
            )}
          </ul>
          <div className="font-display mt-3 flex items-baseline justify-between gap-3 border-t-2 border-dashed border-border pt-3 text-xl uppercase">
            <span>Total</span>
            <span className="tabular-nums">{rp(booking.total_amount)}</span>
          </div>
          {booking.discount_amount > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles aria-hidden className="size-3.5" /> Kamu hemat {rp(booking.discount_amount)}
            </p>
          )}
        </section>

        {/* ======================== CUSTOMER + BATAL ====================== */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Atas nama <span className="font-medium text-foreground">{booking.customers?.name}</span>
          </p>
          {(status === "WAITING_PAYMENT" || status === "CONFIRMED") && <CancelButton code={booking.booking_code} />}
        </div>

        {status === "CONFIRMED" && (
          <p className="text-sm text-muted-foreground">
            Perlu perpanjang? Pakai menu{" "}
            <Link className="font-bold text-primary hover:underline" href={`/extension?code=${codeParam}`}>
              Extension
            </Link>
            .
          </p>
        )}

        {/* ============================ BANTUAN =========================== */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-4">
          <div>
            <p className="text-sm font-medium">Ada yang kurang pas?</p>
            <p className="text-xs text-muted-foreground">Kasir standby 24 jam. Kode booking ikut terkirim otomatis.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <a href={`https://wa.me/${WA_NUMBER}?text=${helpText}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden className="mr-1.5 size-4" /> Chat Kasir
            </a>
          </Button>
        </section>
      </div>
    </div>
  );
}