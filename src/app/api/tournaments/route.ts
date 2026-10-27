import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRouteError, jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";
import { tournamentRegistrationSchema } from "@/lib/validations/tournament";
import { registerForTournament } from "@/services/tournament.service";
import { setTournamentAccessCookie } from "@/lib/tournament-access";

/**
 * Public registration.
 *
 * No login: a tournament seat is taken by whoever turns up, exactly like a booking. All
 * the rules (open, in time, seats left, one phone per seat) are inside
 * register_tournament(), so this route only checks the shape of the input and turns a
 * 22023 into the message the form shows.
 *
 * No audit row: there is no actor to attribute it to, which is the same reason the
 * public game-request write has none.
 */
export async function POST(request: NextRequest) {
  try {
    // One seat per phone is enforced in the DB; per-IP capping is the outer fence
    // against bulk registration flooding.
    const limit = rateLimit("tournamentRegister", request);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const parsed = tournamentRegistrationSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Data pendaftaran tidak lengkap", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const registration = await registerForTournament(db, parsed.data);

    // The player just proved ownership by registering, so let them open their
    // own ticket without a second round trip through /cek-turnamen.
    const res = NextResponse.json({ registration }, { status: 201 });
    setTournamentAccessCookie(res, registration.registration_code);
    return res;
  } catch (error) {
    return handleRouteError(error);
  }
}