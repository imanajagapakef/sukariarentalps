import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBookingAccessByCode } from "@/services/booking.service";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { setBookingAccessCookie } from "@/lib/booking-access";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Booking-verification endpoint. Knowing the code is no longer enough: the
 * caller must also know the last 4 digits of the phone on the booking. A
 * correct answer answers with minimal metadata and mints the httpOnly access
 * cookie that gates `/tiket/[code]` and cancel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const limit = rateLimit("bookingRead", request, code);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const last4 = request.nextUrl.searchParams.get("last4")?.trim() ?? "";
    if (!/^\d{4}$/.test(last4)) {
      return jsonError("Masukkan 4 digit terakhir nomor telepon", 400);
    }

    const db = createAdminClient();
    const result = await verifyBookingAccessByCode(db, code, last4);

    if (!result.ok) {
      return result.state === "not_found"
        ? jsonError("Booking tidak ditemukan", 404)
        : jsonError("4 digit terakhir tidak cocok", 401);
    }

    // Deliberately minimal: never echo customer PII back over this endpoint.
    const res = NextResponse.json({
      booking_code: result.booking.booking_code,
      status: result.booking.status,
    });
    setBookingAccessCookie(res, code);
    return res;
  } catch (error) {
    return handleRouteError(error);
  }
}
