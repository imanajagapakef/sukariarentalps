import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { cancelBooking, getBookingByCode } from "@/services/booking.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { refundSchema } from "@/lib/validations/admin";
import { notifyAdminChanged } from "@/lib/realtime-notify";

/**
 * Refund = ADMIN+. Deleger ke cancel_booking (migrasi 0038) yang sekaligus
 * melepas slot DAN menandai payments REFUNDED dalam satu transaksi.
 * Uang bergerak manual di kasir sampai ada refund API gateway.
 */
export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser(["ADMIN", "OWNER"]);
    const parsed = refundSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload refund tidak valid", 400);

    const db = createAdminClient();
    const booking = await getBookingByCode(db, parsed.data.booking_code);
    if (!booking) return jsonError("Booking tidak ditemukan", 404);

    // Snapshot payment sebelum cancel untuk audit trail.
    const { data: payment } = await db
      .from("payments")
      .select("payment_id, status, gross_amount, provider_order_id")
      .eq("booking_id", booking.booking_id)
      .in("status", ["PAID", "PENDING"])
      .maybeSingle();

    if (["WAITING_PAYMENT", "CONFIRMED", "DRAFT"].includes(booking.status)) {
      // cancel_booking (0038) menerapkan refund atomik ke payments;
      // jangan update payments terpisah di sini (tidak atomik).
      await cancelBooking(db, booking.booking_id, `refund: ${parsed.data.reason}`, { enforceWindow: false });
    } else if (booking.status === "CANCELLED") {
      // Booking sudah batal (data legacy): pastikan payment PAID ikut
      // direfund agar laporan tidak menghitung uang yang sudah kembali.
      if (payment && payment.status === "PAID") {
        const { error } = await db
          .from("payments")
          .update({ status: "REFUNDED", refunded_at: new Date().toISOString() })
          .eq("payment_id", payment.payment_id);
        if (error) throw new Error(error.message);
      }
    } else {
      return jsonError(`Booking tidak bisa direfund dari status ${booking.status}`, 409);
    }

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "refund",
      entityType: "bookings",
      entityId: booking.booking_id,
      reason: parsed.data.reason,
      before: payment as never,
    });

    notifyAdminChanged();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
