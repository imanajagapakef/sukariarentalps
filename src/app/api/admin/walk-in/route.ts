import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { createWalkInBooking } from "@/services/booking.service";
import { audit } from "@/lib/audit";
import { handleRouteError } from "@/lib/api/response";
import { walkInSchema } from "@/lib/validations/admin";

export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser();
    const parsed = walkInSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Data walk-in tidak valid", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const { pay_method } = parsed.data;
    const booking = await createWalkInBooking(db, { ...parsed.data, payMethod: pay_method }, { userId: profile.user_id });

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "walk_in",
      entityType: "bookings",
      entityId: booking.booking_id,
      reason: `walk-in ${pay_method}`,
      after: booking as never,
    });

    return NextResponse.json({ booking }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
