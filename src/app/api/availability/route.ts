import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { availabilityQuerySchema } from "@/lib/validations/booking";
import { getAvailableUnits } from "@/services/availability.service";
import { handleRouteError, jsonError } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const parsed = availabilityQuerySchema.safeParse({
      branch_id: params.get("branch_id"),
      start_at: params.get("start_at"),
      end_at: params.get("end_at"),
    });

    if (!parsed.success) {
      return jsonError("Parameter availability tidak valid", 400);
    }

    const db = createAdminClient();
    const units = await getAvailableUnits(
      db,
      parsed.data.branch_id,
      parsed.data.start_at,
      parsed.data.end_at,
    );

    return NextResponse.json({ units });
  } catch (error) {
    return handleRouteError(error);
  }
}