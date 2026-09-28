import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentForBooking } from "@/services/payment.service";
import { handleRouteError } from "@/lib/api/response";

const bodySchema = z.object({ booking_code: z.string().trim().min(1) }).strict();

export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: { message: "booking_code wajib diisi" } }, { status: 400 });
    }

    const db = createAdminClient();
    const payment = await createPaymentForBooking(db, parsed.data.booking_code);

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
