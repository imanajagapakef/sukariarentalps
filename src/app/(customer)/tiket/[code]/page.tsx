import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { BookingStatusPill } from "@/components/status-pill";
import { Cover } from "@/components/cover";
import { PayButton, CancelButton, Countdown } from "@/components/ticket-actions";
import { fmtDateTime, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TicketPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = createAdminClient();
  const booking = await getBookingByCode(db, code);
  if (!booking) notFound();

  const unit = await db
    .from("units")
    .select("name, branches(name, short_name, address)")
    .eq("unit_id", booking.unit_id)
    .single();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Tiket</p>
          <h1 className="font-display text-3xl uppercase tracking-wide md:text-4xl">{booking.booking_code}</h1>
        </div>
        <BookingStatusPill status={booking.status} />
      </div>

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
          <p className="text-xs uppercase text-muted-foreground">Waktu</p>
          <p className="font-display mt-1 text-lg uppercase">{fmtDateTime(booking.scheduled_start_at)}</p>
          <p className="text-sm text-muted-foreground">sampai {fmtDateTime(booking.scheduled_end_at)}</p>
          <p className="mt-1 text-sm text-primary">{booking.duration_minutes} menit</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs uppercase text-muted-foreground">Tempat</p>
          <p className="font-display mt-1 text-lg uppercase">{unit.data?.name}</p>
          <p className="text-sm text-muted-foreground">
            {unit.data?.branches?.short_name ?? unit.data?.branches?.name}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-5">
        <p className="font-display uppercase">Rincian</p>
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
              <span>Diskon</span>
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
          <Cover seed={booking.unit_id} label={unit.data?.branches?.short_name ?? ""} className="size-12 rounded-lg" />
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
