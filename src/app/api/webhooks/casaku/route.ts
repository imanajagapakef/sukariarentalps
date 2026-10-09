import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleCasakuNotification, type CasakuNotification } from "@/services/payment.service";
import { handleRouteError } from "@/lib/api/response";

/** Casaku server-to-server callback. HMAC-SHA256 signature is the auth. */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-casaku-signature");
    const body = rawBody ? (JSON.parse(rawBody) as CasakuNotification) : null;
    if (!body) return NextResponse.json({ error: { message: "Body JSON tidak valid" } }, { status: 400 });

    const db = createAdminClient();
    const result = await handleCasakuNotification(db, body, rawBody, signature);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
