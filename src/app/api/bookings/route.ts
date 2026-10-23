import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBookingSchema } from "@/lib/validations/booking";
import { createBooking } from "@/services/booking.service";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Anonymous creation is the biggest spam surface: cap per IP before any parse.
    const limit = rateLimit("bookingCreate", request);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

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