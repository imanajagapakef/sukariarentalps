import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRegistrationAccessByCode } from "@/services/tournament.service";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { setTournamentAccessCookie } from "@/lib/tournament-access";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Tournament-ticket verification. Knowing the printed code is no longer enough:
 * the caller must also know the last 4 digits of the phone used to register.
 * A correct answer returns minimal metadata and mints the httpOnly cookie that
 * gates `/turnamen/tiket/[code]`.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const limit = rateLimit("tournamentRead", request, code);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const last4 = request.nextUrl.searchParams.get("last4")?.trim() ?? "";
    if (!/^\d{4}$/.test(last4)) {
      return jsonError("Masukkan 4 digit terakhir nomor telepon", 400);
    }

    const db = createAdminClient();
    const result = await verifyRegistrationAccessByCode(db, code, last4);

    if (!result.ok) {
      return result.state === "not_found"
        ? jsonError("Tiket tidak ditemukan", 404)
        : jsonError("4 digit terakhir tidak cocok", 401);
    }

    // Deliberately minimal: never echo player PII back over this endpoint.
    const res = NextResponse.json({
      registration_code: result.registration.registration_code,
      status: result.registration.status,
    });
    setTournamentAccessCookie(res, code);
    return res;
  } catch (error) {
    return handleRouteError(error);
  }
}