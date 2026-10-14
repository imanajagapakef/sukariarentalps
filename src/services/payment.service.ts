import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { convertQRIS } from "@/lib/qris-dinamis";
import { channelById } from "@/lib/validations/booking";

type DB = SupabaseClient<Database>;

export class PaymentError extends Error {
  readonly isClientError: boolean;
  constructor(message: string, isClientError = true) {
    super(message);
    this.name = "PaymentError";
    this.isClientError = isClientError;
  }
}

/** Midtrans charges exactly the booking total; no partial payments. */
export async function createPaymentForBooking(
  db: DB,
  bookingCode: string,
  method?: string,
): Promise<{ payment_id: string; token: string; redirect_url: string }> {
  const { data: booking } = await db
    .from("bookings")
    .select("booking_id, booking_code, status, total_amount, payment_deadline_at, customers(name, phone)")
    .eq("booking_code", bookingCode.trim().toUpperCase())
    .maybeSingle();

  if (!booking) throw new PaymentError("Booking tidak ditemukan");
  if (booking.status !== "WAITING_PAYMENT") {
    throw new PaymentError(`Booking ${booking.booking_code} tidak menunggu pembayaran (${booking.status})`);
  }

  const { data: live } = await db
    .from("payments")
    .select("payment_id, raw_response")
    .eq("booking_id", booking.booking_id)
    .in("status", ["PENDING", "PAID"])
    .maybeSingle();
  if (live) {
    const raw = live.raw_response as unknown as { qr_string?: string } | null;
    if (raw?.qr_string) {
      return { payment_id: live.payment_id, token: "", redirect_url: `/payment/${bookingCode}/qris` };
    }
    throw new PaymentError("Pembayaran sudah dibuat untuk booking ini");
  }

  const channel = method ? channelById(method) : undefined;
  if (method && !channel) {
    throw new PaymentError(`Metode pembayaran tidak dikenal: ${method}`);
  }

  const staticQris = process.env.QRIS_STATIC_STRING;
  if (!staticQris) throw new PaymentError("QRIS_STATIC_STRING belum diisi", false);
  const dynamicQris = convertQRIS(staticQris, { amount: booking.total_amount });

  const { data: payment, error: insertError } = await db
    .from("payments")
    .insert({
      booking_id: booking.booking_id,
      provider: "MANUAL",
      status: "PENDING",
      gross_amount: booking.total_amount,
      expires_at: booking.payment_deadline_at,
      method: "QRIS_MANUAL",
    })
    .select()
    .single();
  if (insertError || !payment) throw new PaymentError(`Gagal membuat pembayaran: ${insertError?.message}`, false);

  const { data: saved, error: saveError } = await db
    .from("payments")
    .update({ provider_order_id: payment.payment_id, raw_response: { qr_string: dynamicQris, total: booking.total_amount } as unknown as Json })
    .eq("payment_id", payment.payment_id)
    .select()
    .single();
  if (saveError || !saved) throw new PaymentError(`Gagal menyimpan QRIS: ${saveError?.message}`, false);

  return { payment_id: payment.payment_id, token: payment.payment_id, redirect_url: `/payment/${bookingCode}/qris` };
}
