import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { setStaffStatus } from "@/services/user-admin.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { staffPatchSchema } from "@/lib/validations/admin";

/** Disable a staff account, or change their role. OWNER only. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getStaffUser(["OWNER"]);
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = staffPatchSchema
      .omit({ user_id: true })
      .safeParse({ ...(body ?? {}), user_id: id });
    if (!parsed.success) return jsonError("Payload tidak valid", 400);

    if (id === actor.user_id) {
      return jsonError("Tidak bisa mengubah akun sendiri", 400);
    }

    const db = createAdminClient();
    const { data: target } = await db
      .from("profiles")
      .select("role, active")
      .eq("user_id", id)
      .maybeSingle();
    if (!target) return jsonError("Staff tidak ditemukan", 404);
    if (target.role === "OWNER") return jsonError("Akun OWNER tidak bisa diubah", 400);

    await setStaffStatus(db, id, {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    });
    if (parsed.data.active === false) await db.auth.admin.deleteUser(id).catch(() => null);

    await audit(db, {
      actorId: actor.user_id,
      actorRole: actor.role,
      action: "staff_update",
      entityType: "profiles",
      entityId: id,
      after: parsed.data as never,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
