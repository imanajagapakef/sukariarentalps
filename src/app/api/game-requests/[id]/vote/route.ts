import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";
import { getOrCreateVoter } from "@/lib/voter";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const limit = rateLimit("feedback", request, id);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const db = createAdminClient();
    const res = NextResponse.json({ ok: true });
    const voterRef = await getOrCreateVoter(res);

    const { error } = await db.from("game_votes").insert({ request_id: id, voter_ref: voterRef });
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return jsonError("Kamu sudah vote untuk game ini", 409);
      }
      if ((error as { code?: string }).code === "23503") {
        return jsonError("Request game tidak ditemukan", 404);
      }
      throw new Error(error.message);
    }

    return res;
  } catch (error) {
    return handleRouteError(error);
  }
}
