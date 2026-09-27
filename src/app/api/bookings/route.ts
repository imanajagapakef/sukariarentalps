import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBookingSchema } from "@/lib/validations/booking";
import { createBooking } from "@/services/booking.service";
import { handleRouteError, jsonError } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return jsonError("Body JSON tidak valid", 400);

    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Data booking tidak valid", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const booking = await createBooking(db, parsed.data);

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}