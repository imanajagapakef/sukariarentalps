import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertBranchScope, getStaffUser } from "@/lib/authz";
import {
  BookingError,
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
      assertBranchScope(profile, booking.branch_id);

      // Cek status unit sekarang. Tandai siap hanya jika belum AVAILABLE,
      // sehingga tombol tetap bekerja meski unit sudah tersedia (idempotent).
      const { data: unit, error: unitError } = await db
        .from("units")
        .select("status")
        .eq("unit_id", booking.unit_id)
        .maybeSingle();
      // supabase-js melaporkan error lewat result, bukan throw. Dulu hasilnya
      // diabaikan sehingga tulisan yang ditolak terlihat sukses.
      if (unitError) throw new BookingError(unitError.message, unitError.code ?? "UNKNOWN");

      if (unit?.status && unit.status !== "AVAILABLE") {
        await markUnitReady(db, booking.unit_id);
      }

      // Selesaikan booking itu sendiri agar tidak kembali ke COMPLETED permanen
      // setelah unit dikembalikan ke AVAILABLE.
      if (booking.status === "COMPLETED") {
        const { error } = await db
          .from("bookings")
          .update({ status: "READY" })
          .eq("booking_id", booking.booking_id);
        if (error) throw new BookingError(error.message, error.code ?? "UNKNOWN");
      }
    } else {
      const booking = await getBookingByCode(db, code);
      if (!booking) return jsonError("Booking tidak ditemukan", 404);
      assertBranchScope(profile, booking.branch_id);

      switch (action) {
        case "confirm":
          await confirmBooking(db, booking.booking_id);
          await db
            .from("payments")
            .update({ status: "PAID", paid_at: new Date().toISOString() })
            .eq("booking_id", booking.booking_id)
            .eq("status", "PENDING");
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
