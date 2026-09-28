import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import {
  cancelBooking,
  checkIn,
  completeBooking,
  confirmBooking,
  getBookingByCode,
  markNoShow,
  markUnitReady,
} from "@/services/booking.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { bookingActionSchema } from "@/lib/validations/admin";

/** Staff lifecycle actions on a booking, dispatched to the guarded RPCs. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { code } = await params;
    const parsed = bookingActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload tidak valid", 400);

    const db = createAdminClient();
    const { action, reason } = parsed.data;

    if (action === "mark_ready") {
      const booking = await getBookingByCode(db, code);
      if (!booking) return jsonError("Booking tidak ditemukan", 404);
      await markUnitReady(db, booking.unit_id);
    } else {
      const booking = await getBookingByCode(db, code);
      if (!booking) return jsonError("Booking tidak ditemukan", 404);

      switch (action) {
        case "confirm":
          await confirmBooking(db, booking.booking_id);
          break;
        case "check_in":
          await checkIn(db, booking.booking_id);
          break;
        case "complete":
          await completeBooking(db, booking.booking_id);
          break;
        case "cancel":
          await cancelBooking(db, booking.booking_id, reason);
          break;
        case "no_show":
          await markNoShow(db, booking.booking_id);
          break;
      }
    }

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: `booking_${action}`,
      entityType: "bookings",
      entityId: code,
      reason,
    });

    const booking = await getBookingByCode(db, code);
    return NextResponse.json({ status: booking?.status ?? "UNKNOWN" });
  } catch (error) {
    return handleRouteError(error);
  }
}
