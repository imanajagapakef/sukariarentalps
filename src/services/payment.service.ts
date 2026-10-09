import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { convertQRIS } from "@/lib/qris-dinamis";
import { verifyCasakuWebhook } from "@/lib/casaku";
import { confirmBooking } from "@/services/booking.service";
import { channelById } from "@/lib/validations/booking";

type DB = SupabaseClient<Database>;
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

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

export type CasakuNotification = {
  transactionId?: string;
  amount?: number;
  packageName?: string;
  appName?: string;
  status?: string;
  paidAt?: string;
  [key: string]: unknown;
};

const PACKAGE_NAME_TO_METHOD: Record<string, Database["public"]["Enums"]["payment_method"]> = {
  "id.dana": "CASAKU_QRIS",
  "com.shopee.id": "CASAKU_QRIS",
  "com.gojek.app": "CASAKU_QRIS",
  "com.ovo.id": "CASAKU_QRIS",
};

/** Process Casaku webhook. Idempotency via payment_events.provider_event_id. */
export async function handleCasakuNotification(
  db: DB,
  n: CasakuNotification,
  rawBody: string,
  signature: string | null,
): Promise<{ processed: boolean; reason?: string }> {
  const eventId = n.transactionId ?? `${n.amount ?? "?"}:${n.status ?? "?"}`;
  if (!n.transactionId) return { processed: false, reason: "no transactionId" };
  const signatureValid = verifyCasakuWebhook(rawBody, signature);

  const { error: eventError } = await db.from("payment_events").insert({
    provider_event_id: eventId,
    event_type: String(n.status ?? "unknown"),
    signature_valid: signatureValid,
    payload: n as unknown as Json,
  });
  if (eventError?.code === "23505") {
    const { data: prior } = await db
      .from("payment_events")
      .select("processed_at")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    return { processed: false, reason: prior?.processed_at ? "already processed" : "in flight" };
  }
  if (eventError) throw new PaymentError(`Gagal mencatat payment_event: ${eventError.message}`, false);

  if (!signatureValid) return { processed: false, reason: "signature invalid" };

  const { data: payment } = await db
    .from("payments")
    .select("*")
    .eq("provider_order_id", n.transactionId)
    .maybeSingle();
  if (!payment) return { processed: false, reason: "unknown payment" };

  const status = mapCasakuStatus(n.status);
  const update: Partial<PaymentRow> = {
    status,
    provider_txn_id: n.transactionId ?? payment.provider_txn_id,
    ...(n.packageName ? { method: PACKAGE_NAME_TO_METHOD[n.packageName] ?? payment.method } : {}),
  };
  if (status === "PAID") update.paid_at = n.paidAt ?? new Date().toISOString();

  await db.from("payments").update(update).eq("payment_id", payment.payment_id);
  await db
    .from("payment_events")
    .update({ payment_id: payment.payment_id, processed_at: new Date().toISOString() })
    .eq("provider_event_id", eventId);

  if (status === "PAID" && payment.booking_id) {
    try {
      await confirmBooking(db, payment.booking_id);
    } catch (e) {
      // Booking may already be CONFIRMED (retry) or EXPIRED (cron won the race).
      const msg = e instanceof Error ? e.message : String(e);
      if (!/dikonfirmasi dari status/.test(msg)) throw e;
    }
  }

  return { processed: true };
}

function mapCasakuStatus(s: string | undefined): Database["public"]["Enums"]["payment_status"] {
  switch (s) {
    case "paid":
      return "PAID";
    case "expired":
      return "EXPIRED";
    case "cancel":
    case "cancelled":
    case "deny":
    case "failed":
      return "FAILED";
    case "refund":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}
