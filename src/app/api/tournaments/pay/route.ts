import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { createRegistrationQrisPayment, getRegistrationByCode } from "@/services/tournament.service";
import { jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";

const paySchema = z.object({ code: z.string().trim().min(4).max(20) });

/**
 * QRIS payment for a tournament fee.
 *
 * The printed registration code is the credential, exactly like a booking code: it is
 * the only thing the customer has, it is 6 characters from a 32-symbol alphabet, and it
 * is already on the ticket. Nothing here accepts a registration id, so a caller cannot
 * walk ids and pay other people's fees.
 */
export async function POST(request: NextRequest) {
  try {
    // QRIS generation is paid-for (service cost), so cap per IP like paymentCreate.
    const limit = rateLimit("tournamentPay", request);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const parsed = paySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Kode tiket tidak valid", 400);

    const db = createAdminClient();
    const registration = await getRegistrationByCode(db, parsed.data.code);
    if (!registration) return jsonError("Tiket tidak ditemukan", 404);

    // A free tournament has nothing to pay, and create_tournament_payment() would say
    // so in plpgsql; saying it here keeps the ticket page from rendering a dead QR box.
    if (registration.fee_amount === 0) {
      return jsonError("Pendaftaran ini gratis, tidak ada pembayaran", 400, "FREE");
    }
    if (registration.status !== "WAITING_PAYMENT") {
      return jsonError(`Pendaftaran ini tidak menunggu pembayaran (${registration.status})`, 400);
    }

    const payment = await createRegistrationQrisPayment(db, registration.registration_id);
    return NextResponse.json({ payment });
  } catch (error) {
    return handleRouteError(error);
  }
}