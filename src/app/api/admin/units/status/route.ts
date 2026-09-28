import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { markUnitReady } from "@/services/booking.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { unitStatusSchema } from "@/lib/validations/admin";

/**
 * Manual unit status: AVAILABLE (via mark_unit_ready RPC) or MAINTENANCE /
 * OFFLINE (direct update + history). mark_unit_ready enforces the from-status
 * guard; maintenance from any status is allowed by design.
 */
export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser();
    const parsed = unitStatusSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload tidak valid", 400);

    const { unit_id, status, reason } = parsed.data;
    const db = createAdminClient();

    const { data: unit } = await db.from("units").select("status").eq("unit_id", unit_id).maybeSingle();
    if (!unit) return jsonError("Unit tidak ditemukan", 404);

    if (status === "AVAILABLE") {
      await markUnitReady(db, unit_id);
    } else {
      const { error } = await db.from("units").update({ status }).eq("unit_id", unit_id);
      if (error) throw new Error(error.message);
      await db.from("unit_status_history").insert({
        unit_id,
        from_status: unit.status,
        to_status: status,
        reason: reason ?? "manual",
        actor_id: profile.user_id,
      });
    }

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "unit_status",
      entityType: "units",
      entityId: unit_id,
      reason,
      before: { status: unit.status } as never,
      after: { status } as never,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return handleRouteError(error);
  }
}
