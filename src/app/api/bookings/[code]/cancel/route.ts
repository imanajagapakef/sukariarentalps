import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelBookingSchema } from "@/lib/validations/booking";
import { cancelBooking, getBookingByCode } from "@/services/booking.service";
import { handleRouteError, jsonError } from "@/lib/api/response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = cancelBookingSchema.safeParse(body ?? {});
    if (!parsed.success) return jsonError("Payload tidak valid", 400);

    const db = createAdminClient();
    const existing = await getBookingByCode(db, code);
    if (!existing) {
      return NextResponse.json(
        { error: { message: "Booking tidak ditemukan" } },
        { status: 404 },
      );
    }

    const status = await cancelBooking(db, existing.booking_id, parsed.data.reason);
    return NextResponse.json({ status });
  } catch (error) {
    return handleRouteError(error);
  }
}