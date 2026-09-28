import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { createSnapTransaction, verifySignature } from "@/lib/midtrans";
import { confirmBooking } from "@/services/booking.service";

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
    // Reuse the Snap redirect already generated for this payment — reloads of
    // the payment page must not create a second transaction.
    const snap = live.raw_response as unknown as { redirect_url?: string } | null;
    if (snap?.redirect_url) {
      return { payment_id: live.payment_id, token: "", redirect_url: snap.redirect_url };
    }
    throw new PaymentError("Pembayaran sudah dibuat untuk booking ini");
  }

  const { data: payment, error: insertError } = await db
    .from("payments")
    .insert({
      booking_id: booking.booking_id,
      provider: "MIDTRANS",
      status: "PENDING",
      gross_amount: booking.total_amount,
      expires_at: booking.payment_deadline_at,
    })
    .select()
    .single();
  if (insertError || !payment) throw new PaymentError(`Gagal membuat pembayaran: ${insertError?.message}`, false);

  const snap = await createSnapTransaction({
    order_id: payment.payment_id,
    gross_amount: booking.total_amount,
    customer: { first_name: booking.customers?.name ?? "Pelanggan", phone: booking.customers?.phone ?? "" },
    description: `Booking ${booking.booking_code}`,
  });

  const { data: saved, error: saveError } = await db
    .from("payments")
    .update({ provider_order_id: payment.payment_id, raw_response: snap as unknown as Json })
    .eq("payment_id", payment.payment_id)
    .select()
    .single();
  if (saveError || !saved) throw new PaymentError(`Gagal menyimpan Snap token: ${saveError?.message}`, false);

  return { payment_id: payment.payment_id, token: snap.token, redirect_url: snap.redirect_url };
}

export type MidtransNotification = {
  transaction_id?: string;
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  payment_type?: string;
  transaction_status?: string;
  signature_key?: string;
  [key: string]: unknown;
};

const PAYMENT_TYPE_TO_METHOD: Record<string, Database["public"]["Enums"]["payment_method"]> = {
  qris: "MIDTRANS_QRIS",
  gopay: "MIDTRANS_GOPAY",
  shopeepay: "MIDTRANS_SHOPEEPAY",
  bank: "MIDTRANS_BANK_TRANSFER",
  "e-channel": "MIDTRANS_BANK_TRANSFER",
  cca: "MIDTRANS_CREDIT_CARD",
};

/**
 * Process one server-to-server notification. Idempotency is enforced by the
 * unique index on payment_events.provider_event_id — Midtrans retries freely.
 */
export async function handleMidtransNotification(
  db: DB,
  n: MidtransNotification,
): Promise<{ processed: boolean; reason?: string }> {
  const orderId = n.order_id;
  if (!orderId) return { processed: false, reason: "no order_id" };

  const valid =
    !!n.status_code &&
    !!n.gross_amount &&
    verifySignature({
      order_id: orderId,
      status_code: n.status_code,
      gross_amount: n.gross_amount,
      signature_key: n.signature_key,
    });

  // transaction_id is unique per notification — the natural idempotency key.
  const eventId = n.transaction_id ?? `${orderId}:${n.transaction_status ?? "?"}:${n.status_code ?? "?"}`;

  const { error: eventError } = await db.from("payment_events").insert({
    provider_event_id: eventId,
    event_type: String(n.transaction_status ?? "unknown"),
    signature_valid: valid,
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

  if (!valid) return { processed: false, reason: "signature invalid" };

  const { data: payment } = await db
    .from("payments")
    .select("*")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (!payment) return { processed: false, reason: "unknown payment" };

  const status = mapTransactionStatus(n.transaction_status);
  const update: Partial<PaymentRow> = {
    status,
    provider_txn_id: n.transaction_id ?? payment.provider_txn_id,
    ...(n.payment_type ? { method: PAYMENT_TYPE_TO_METHOD[n.payment_type] ?? payment.method } : {}),
  };
  if (status === "PAID") update.paid_at = new Date().toISOString();

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

function mapTransactionStatus(s: string | undefined): Database["public"]["Enums"]["payment_status"] {
  switch (s) {
    case "settlement":
    case "capture":
      return "PAID";
    case "expire":
    case "expiry":
      return "EXPIRED";
    case "cancel":
    case "deny":
    case "invalid":
    case "unspecified":
    case "failed":
      return "FAILED";
    case "refund":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}
