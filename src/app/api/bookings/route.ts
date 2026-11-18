import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBookingSchema } from "@/lib/validations/booking";
import { createBooking } from "@/services/booking.service";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { BOOKING_ACCESS_COOKIE, setBookingAccessCookie } from "@/lib/booking-access";
import { rateLimit } from "@/lib/rate-limit";
import { notifyAdminChanged } from "@/lib/realtime-notify";
import { cookies } from "next/headers";

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

    // Kasir melihat booking baru tanpa menunggu refresh.
    notifyAdminChanged();

    const res = NextResponse.json({ booking }, { status: 201 });
    // Pelanggan baru saja membuat booking ini dengan nomornya sendiri, jadi
    // mereka berhak langsung membuka tiketnya tanpa melewati /cek-booking lagi.
    // Cookie-nya sama dengan yang diterbitkan endpoint verifikasi.
    const jar = await cookies();
    setBookingAccessCookie(res, booking.booking_code, jar.get(BOOKING_ACCESS_COOKIE)?.value);
    return res;
  } catch (error) {
    return handleRouteError(error);
  }
}