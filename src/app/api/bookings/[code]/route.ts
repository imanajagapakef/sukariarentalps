import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { handleRouteError } from "@/lib/api/response";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const db = createAdminClient();
    const booking = await getBookingByCode(db, code);

    if (!booking) {
      return NextResponse.json(
        { error: { message: "Booking tidak ditemukan" } },
        { status: 404 },
      );
    }

    return NextResponse.json({ booking });
  } catch (error) {
    return handleRouteError(error);
  }
}