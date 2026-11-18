import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBookingByCode } from "@/services/booking.service";
import { requestExtension } from "@/services/extension.service";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { hasBookingAccess } from "@/lib/booking-access";
import { rateLimit } from "@/lib/rate-limit";
import { notifyAdminChanged } from "@/lib/realtime-notify";

const extendSchema = z
  .object({
    minutes: z.coerce.number().int().min(60).max(360),
    // QRIS = pelanggan membayar sendiri sekarang (bisa tanpa ke kasir);
    // CASH = dibayar di kasir saat check-out.
    method: z.enum(["QRIS_MANUAL", "CASH"]).default("CASH"),
  })
  .strict();

/**
 * Perpanjangan mandiri oleh pelanggan.
 *
 * Gated seperti pembatalan: cookie akses tiket harus mencakup kode ini, dan
 * pemanggilan dibatasi rate limit. Validasi sebenarnya (slot, interval,
 * maksimum durasi) ada di RPC `request_extension`, bukan di sini.
 *
 * Uang tidak pernah berubah status di jalur ini: RPC membuat pembayaran
 * PENDING, dan kasir yang melunasinya saat check-out.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const limit = rateLimit("bookingCreate", request, code);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    if (!(await hasBookingAccess(code))) {
      return jsonError("Verifikasi tiket dulu sebelum menambah jam", 401);
    }

    const parsed = extendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Durasi perpanjangan tidak valid", 400);

    const db = createAdminClient();
    const booking = await getBookingByCode(db, code);
    if (!booking) return jsonError("Booking tidak ditemukan", 404);

    const result = await requestExtension(db, booking.booking_id, parsed.data.minutes, {
      method: parsed.data.method,
    });

    // Kasir melihat jam sesi berubah tanpa refresh; halaman pelanggan
    // me-refresh dirinya sendiri setelah POST ini selesai.
    notifyAdminChanged();

    return NextResponse.json({
      extension_id: result.extension_id,
      new_end_at: result.new_end_at,
      amount: result.amount,
      method: parsed.data.method,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}