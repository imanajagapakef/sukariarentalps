import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { StartPaymentButton } from "@/components/ticket-actions";
import { BookingStatusPill } from "@/components/status-pill";
import { fmtDateTime, rp } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PaymentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = createAdminClient();
  const booking = await getBookingByCode(db, code);
  if (!booking) notFound();

  return (
    <div className="mx-auto max-w-md px-4 py-12 md:px-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl uppercase">Pembayaran</h1>
        <BookingStatusPill status={booking.status} />
      </div>
      <p className="mt-1 text-muted-foreground">{booking.booking_code}</p>

      <div className="mt-6 rounded-xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-muted-foreground">Total bayar</p>
          <p className="font-display text-2xl uppercase">{rp(booking.total_amount)}</p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Sesi {fmtDateTime(booking.scheduled_start_at)} · {booking.duration_minutes} menit
        </p>
        {booking.payment_deadline_at && (
          <p className="mt-2 text-xs text-warning">Sebelum {fmtDateTime(booking.payment_deadline_at)}</p>
        )}
      </div>

      {booking.status === "WAITING_PAYMENT" ? (
        <StartPaymentButton code={booking.booking_code} className="mt-6 w-full" />
      ) : (
        <p className="mt-6 text-sm text-primary">Pembayaran untuk booking ini sudah tidak menunggu.</p>
      )}

      <p className="mt-4 text-center text-xs text-muted-foreground">
        QRIS · GoPay · ShopeePay · Transfer · Kartu — via Midtrans
      </p>
    </div>
  );
}
