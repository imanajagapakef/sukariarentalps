import { Breadcrumbs } from "@/components/breadcrumbs";
import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { LiveBooking } from "@/components/live-booking";
import { Button } from "@/components/ui/button";
import { QrisCard } from "@/components/payment/qris-card";

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

  const raw = payment.raw_response as { qr_string?: string } | null;
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

  const qrDataUrl = await QRCode.toDataURL(raw.qr_string, {
    width: 512,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-16 md:px-8">
      {/* This is where the customer actually sits after pressing "Bayar Sekarang", so
          it is the page that has to notice the cashier's confirmation. Without it the
          broadcast fired into an empty room and the QR sat there until a manual
          refresh. */}
      <LiveBooking code={booking.booking_code} status={booking.status} />
      <Breadcrumbs
        className="mt-4"
        items={[
          { label: "Home", href: "/" },
          { label: `Payment ${booking.booking_code}`, href: `/payment/${booking.booking_code}` },
          { label: "QRIS" },
        ]}
      />
      <QrisCard
        amount={booking.total_amount}
        qrDataUrl={qrDataUrl}
        status={payment.status}
        deadline={booking.payment_deadline_at ?? undefined}
        note="Tunjukkan layar ini ke kasir setelah pembayaran berhasil."
      />
      <Button asChild variant="outline" className="mt-8 w-full">
        <Link href={`/tiket/${booking.booking_code}`}>Status Tiket</Link>
      </Button>
    </div>
  );
}
