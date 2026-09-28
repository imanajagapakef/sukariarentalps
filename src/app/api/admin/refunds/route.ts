import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { cancelBooking, getBookingByCode } from "@/services/booking.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { refundSchema } from "@/lib/validations/admin";

/**
 * Refund = ADMIN+. Marks the paid payment REFUNDED, then cancels the booking
 * (releases the slot). ponytail: no gateway refund API yet — money moves by
 * hand at the counter until Midtrans refund call lands in Fase F.
 */
export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser(["ADMIN", "OWNER"]);
    const parsed = refundSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload refund tidak valid", 400);

    const db = createAdminClient();
    const booking = await getBookingByCode(db, parsed.data.booking_code);
    if (!booking) return jsonError("Booking tidak ditemukan", 404);

    const { data: payment } = await db
      .from("payments")
      .select("payment_id, status, gross_amount, provider_order_id")
      .eq("booking_id", booking.booking_id)
      .in("status", ["PAID", "PENDING"])
      .maybeSingle();

    if (payment) {
      const { error } = await db
        .from("payments")
        .update({ status: "REFUNDED" })
        .eq("payment_id", payment.payment_id);
      if (error) throw new Error(error.message);
    }

    if (["WAITING_PAYMENT", "CONFIRMED"].includes(booking.status)) {
      await cancelBooking(db, booking.booking_id, `refund: ${parsed.data.reason}`);
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
