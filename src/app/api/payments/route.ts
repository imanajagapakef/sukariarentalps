import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPaymentSchema } from "@/lib/validations/booking";
import { createPaymentForBooking } from "@/services/payment.service";
import { handleRouteError } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  try {
    const body = createPaymentSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json(
        { error: { message: "Data pembayaran tidak valid", issues: body.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const payment = await createPaymentForBooking(db, body.data.booking_code, body.data.method);

    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
