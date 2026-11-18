import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { rateLimit } from "@/lib/rate-limit";
import { getOrCreateVoter } from "@/lib/voter";
import { z } from "zod";

const schema = z.object({ game_name: z.string().trim().min(2).max(80) }).strict();

export async function POST(request: NextRequest) {
  try {
    const limit = rateLimit("feedback", request);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Nama game tidak valid (2–80 karakter)", 400);

    const db = createAdminClient();
    const { data, error } = await db
      .from("game_requests")
      .insert({ game_name: parsed.data.game_name, status: "REQUESTED" })
      .select("request_id, game_name, status, vote_count, created_at")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return jsonError("Game itu sudah ada di daftar request", 409);
      }
      throw new Error(error.message);
    }

    const res = NextResponse.json({ request: data }, { status: 201 });
    await getOrCreateVoter(res);
    return res;
  } catch (error) {
    return handleRouteError(error);
  }
}
