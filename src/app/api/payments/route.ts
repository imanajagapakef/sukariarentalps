import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentSchema } from "@/lib/validations/booking";
import { createPaymentForBooking } from "@/services/payment.service";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { hasBookingAccess } from "@/lib/booking-access";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    // Each payment creation puts a live row in the partial-unique window, so
    // per-IP capping keeps retries honest without per-code pressure.
    const limit = rateLimit("paymentCreate", request);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const body = createPaymentSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { error: { message: "Data pembayaran tidak valid", issues: body.error.flatten() } },
        { status: 400 },
      );
    }

    // Kode saja tidak cukup: pelanggan wajib sudah verifikasi last-4 dulu
    // (cookie tiket). Ini menutup enumerasi pembayaran via kode yang
    // terlihat di layar/foto.
    if (!(await hasBookingAccess(body.data.booking_code))) {
      return jsonError("Verifikasi tiket dulu sebelum membuat pembayaran", 401);
    }

    const db = createAdminClient();
    const payment = await createPaymentForBooking(db, body.data.booking_code, body.data.method);

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
