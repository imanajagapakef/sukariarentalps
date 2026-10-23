import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { MessageCircle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { hasBookingAccess } from "@/lib/booking-access";
import { BookingStatusPill } from "@/components/status-pill";
import { Cover } from "@/components/cover";
import { PayButton, CancelButton, Countdown, CopyCodeButton } from "@/components/ticket-actions";
import { LiveBooking } from "@/components/live-booking";
import { fmtDateTime, fmtDuration, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

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
    redirect(`/cek-booking?code=${code}`);
  }
  const db = createAdminClient();
  const booking = await getBookingByCode(db, code);
  if (!booking) notFound();

  const unit = await db
    .from("units")
    .select("name, image_url, branches(name, short_name, address)")
    .eq("unit_id", booking.unit_id)
    .single();

  // The QR encodes the ticket URL rather than the bare code: any phone camera
  // then opens the booking, which is what staff actually want to see.
  const ticketUrl = `${await siteOrigin()}/tiket/${booking.booking_code}`;
  const qr = await QRCode.toDataURL(ticketUrl, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  });
  const shareText = encodeURIComponent(
    `Halo, ini booking saya di Klub Sukaria — kode ${booking.booking_code}.`,
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
      <LiveBooking code={booking.booking_code} status={booking.status} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Tiket</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl uppercase tracking-wide md:text-4xl">{booking.booking_code}</h1>
            <CopyCodeButton code={booking.booking_code} />
          </div>
        </div>
        <BookingStatusPill status={booking.status} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
        {/* The white padding is the QR quiet zone, not styling: scanners need the
            light margin to locate the finder patterns. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI, sized explicitly */}
        <img
          src={qr}
          alt={`QR booking ${booking.booking_code}`}
          width={144}
          height={144}
          className="size-36 shrink-0 rounded-lg bg-white p-1"
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display uppercase">Tunjukkan di kasir</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Pindai QR ini, atau sebutkan kode{" "}
            <span className="text-foreground">{booking.booking_code}</span> saat datang.
          </p>
          <a
            href={`https://wa.me/?text=${shareText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
          >
            <MessageCircle aria-hidden className="size-4" />
            Bagikan via WhatsApp
          </a>
        </div>
      </div>

      {/* Paid. The design leads with this; live previously added a single muted
          paragraph, so a confirmed booking looked identical to an unpaid one. */}
      {booking.status === "CONFIRMED" && (
        <div className="mt-4 rounded-xl border border-success/40 bg-success/10 p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-success">
            Pembayaran terverifikasi · Lunas
          </p>
          <h2 className="font-display mt-1 text-xl uppercase">
            Booking berhasil — tiket siap
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Simpan halaman ini. Tunjukkan QR atau sebutkan kode di kasir saat datang.
          </p>
        </div>
      )}

      {/* Session start. Only meaningful before the slot begins, so it is limited
          to CONFIRMED; once IN_USE the end countdown below takes over. */}
      {booking.status === "CONFIRMED" && (
        <div className="mt-4 rounded-xl border border-border bg-card p-5 text-center">
          <h2 className="text-xs uppercase text-muted-foreground">Sesi kamu mulai dalam</h2>
          <Countdown
            deadline={booking.scheduled_start_at}
            tone="primary"
            doneLabel="Sesi sudah dimulai — cek di kasir"
          />
          <p className="mt-1 text-sm text-muted-foreground">{fmtDateTime(booking.scheduled_start_at)}</p>
        </div>
      )}

      {booking.status === "WAITING_PAYMENT" && booking.payment_deadline_at && (
        <div className="mt-4 rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="text-sm text-warning">Selesaikan pembayaran sebelum:</p>
          <Countdown deadline={booking.payment_deadline_at} />
          <PayButton code={booking.booking_code} className="mt-3 w-full" />
        </div>
      )}

      {booking.status === "IN_USE" && (
        <div className="mt-4 rounded-lg border border-primary-container bg-primary/10 p-4">
          <p className="text-sm text-primary">Sesi kamu selesai dalam:</p>
          <Countdown deadline={booking.scheduled_end_at} doneLabel="Waktu main habis — perpanjang di kasir" />
          <p className="mt-2 text-sm text-muted-foreground">
            Butuh tambahan waktu?{" "}
            <a className="text-primary hover:underline" href={`/extension?code=${booking.booking_code}`}>
              Extension
            </a>
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xs uppercase text-muted-foreground">Waktu</h2>
          <p className="font-display mt-1 text-lg">{fmtDateTime(booking.scheduled_start_at)}</p>
          <p className="text-sm text-muted-foreground">sampai {fmtDateTime(booking.scheduled_end_at)}</p>
          <p className="mt-1 text-sm text-primary">{fmtDuration(booking.duration_minutes)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-xs uppercase text-muted-foreground">Tempat</h2>
          <p className="font-display mt-1 text-lg">{unit.data?.name}</p>
          <p className="text-sm text-muted-foreground">
            {unit.data?.branches?.short_name ?? unit.data?.branches?.name}
          </p>
          {/* This was already in the select and never rendered — a customer holding
              this page has no way to find the room. */}
          {unit.data?.branches?.address && (
            <p className="mt-2 text-sm text-muted-foreground">{unit.data.branches.address}</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <h2 className="font-display uppercase">Rincian</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {booking.booking_items.map((it) => (
            <li key={it.booking_item_id} className="flex justify-between gap-2">
              <span>
                {it.description}
                {it.quantity > 1 ? ` ×${it.quantity}` : ""}
              </span>
              <span>{rp(it.subtotal)}</span>
            </li>
          ))}
          {booking.discount_amount > 0 && (
            <li className="flex justify-between text-primary">
              {/* Naming the promo matters as soon as there is a discount: a bare
                  "−Rp 20.000" leaves the customer wondering what was taken off, and
                  staff with the counter asking the same question. */}
              <span>
                Diskon
                {booking.promotions?.name ? ` · Promo ${booking.promotions.name}` : ""}
              </span>
              <span>−{rp(booking.discount_amount)}</span>
            </li>
          )}
        </ul>
        <div className="font-display mt-3 flex justify-between border-t border-border pt-3 text-lg uppercase">
          <span>Total</span>
          <span>{rp(booking.total_amount)}</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Cover seed={booking.unit_id} src={unit.data?.image_url ?? null} label={unit.data?.branches?.short_name ?? ""} className="size-12 rounded-lg" />
          <span>{booking.customers?.name}</span>
        </div>
        {(booking.status === "WAITING_PAYMENT" || booking.status === "CONFIRMED") && (
          <CancelButton code={booking.booking_code} />
        )}
      </div>

      {booking.status === "CONFIRMED" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Tunjukkan kode ini di kasir saat datang. Perlu perpanjang? Pakai menu <a className="text-primary hover:underline" href={`/extension?code=${booking.booking_code}`}>Extension</a>.
        </p>
      )}
    </div>
  );
}
