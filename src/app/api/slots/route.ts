import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { slotQuerySchema, type Slot } from "@/lib/validations/booking";
import { handleRouteError, jsonError } from "@/lib/api/response";

/**
 * Per-unit slot grid for one day, so the booking form can show why a slot is
 * unavailable and when it frees up instead of offering bare HH:MM options.
 * Backs public.slot_availability(), which reads the same unit_reservations rows
 * the overlap constraint guards.
 */
export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const parsed = slotQuerySchema.safeParse({
      branch_id: params.get("branch_id"),
      unit_id: params.get("unit_id"),
      date: params.get("date"),
      duration_minutes: params.get("duration_minutes") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError("Parameter slot tidak valid", 400);
    }

    const db = createAdminClient();
    const { data, error } = await db.rpc("slot_availability", {
      p_branch_id: parsed.data.branch_id,
      p_unit_id: parsed.data.unit_id,
      p_date: parsed.data.date,
      p_duration_minutes: parsed.data.duration_minutes,
    });

    if (error) {
      // duration out of the branch's configured bounds is a user-facing problem,
      // not a server fault
      if (error.code === "22023") {
        return jsonError(error.message, 400);
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ slots: (data ?? []) as Slot[] });
  } catch (error) {
    return handleRouteError(error);
  }
}
