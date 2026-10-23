import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { rp } from "@/lib/format";
import { LiveBooking } from "@/components/live-booking";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function PaymentQrisPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const db = createAdminClient();
  const booking = await getBookingByCode(db, code);
  if (!booking) notFound();

  const { data: payment } = await db
    .from("payments")
    .select("payment_id, status, raw_response")
    .eq("booking_id", booking.booking_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment || payment.status !== "PENDING") {
    // The cashier settling the booking while this page is open is the normal end of
    // this flow, not a failure. It used to land in the "tagihan tidak ditemukan"
    // branch below, which told a customer who had just paid successfully that their
    // invoice was missing.
    const settled = ["CONFIRMED", "CHECKED_IN", "IN_USE", "COMPLETED", "READY"].includes(
      booking.status,
    );
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center md:px-8">
        <div className="rounded-2xl border border-primary/40 bg-primary/10 p-8">
          <h1 className="font-display text-2xl uppercase text-primary">
            {settled ? "Pembayaran Diterima" : "Tagihan tidak tersedia"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {settled
              ? "Kasir sudah mengonfirmasi. Booking kamu aktif dan unit sudah diamankan."
              : "Buka lagi halaman payment untuk melihat status tagihan."}
          </p>
          <Button asChild className="mt-4">
            <Link href={settled ? `/tiket/${booking.booking_code}` : `/payment/${booking.booking_code}`}>
              {settled ? "Lihat Tiket" : "Kembali ke Payment"}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const raw = payment.raw_response as { qr_string?: string; transactionId?: string; totalAmount?: number } | null;
  if (!raw?.qr_string) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center md:px-8">
        <div className="rounded-2xl border border-border bg-card p-8">
          <h1 className="font-display text-2xl uppercase">QR Belum Tersedia</h1>
          <p className="mt-2 text-muted-foreground">Tunggu sebentar lalu muat ulang halaman ini.</p>
          <Button asChild className="mt-4"><Link href={`/payment/${booking.booking_code}`}>Kembali ke Payment</Link></Button>
        </div>
      </div>
    );
  }

  const qrDataUrl = await QRCode.toDataURL(raw.qr_string, { width: 512, margin: 1, errorCorrectionLevel: "M" });

  return (
    <div className="mx-auto max-w-xl px-4 py-16 md:px-8">
      {/* This is where the customer actually sits after pressing "Bayar Sekarang", so
          it is the page that has to notice the cashier's confirmation. Without it the
          broadcast fired into an empty room and the QR sat there until a manual
          refresh. */}
      <LiveBooking code={booking.booking_code} status={booking.status} />
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl uppercase">Scan QRIS</h1>
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase text-primary">{payment.status}</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Total: <span className="font-medium text-primary">{rp(booking.total_amount)}</span></p>
        <div className="mt-6 grid place-items-center rounded-xl bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI */}
          <img src={qrDataUrl} alt="QR Code Pembayaran" className="size-64" />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Transaction ID: <span className="font-mono text-foreground">{raw.transactionId}</span>
        </p>
        <Button asChild variant="outline" className="mt-6 w-full">
          <Link href={`/tiket/${booking.booking_code}`}>Status Tiket</Link>
        </Button>
      </div>
    </div>
  );
}
