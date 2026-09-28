import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleMidtransNotification, type MidtransNotification } from "@/services/payment.service";
import { handleRouteError } from "@/lib/api/response";

/** Midtrans server-to-server callback. Public by design; the SHA512 signature is the auth. */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as MidtransNotification | null;
    if (!body) return NextResponse.json({ error: { message: "Body JSON tidak valid" } }, { status: 400 });

    const db = createAdminClient();
    const result = await handleMidtransNotification(db, body);

    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
