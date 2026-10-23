import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { setStaffStatus } from "@/services/user-admin.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { staffPatchSchema } from "@/lib/validations/admin";

/**
 * Toggle a staff account's status. OWNER may also change roles or move the
 * account to a different branch; the route keeps ADMIN to active-flips on
 * STAFF rows only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getStaffUser(["ADMIN", "OWNER"]);
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
      .select("role, active, branch_id")
      .eq("user_id", id)
      .maybeSingle();
    if (!target) return jsonError("Staff tidak ditemukan", 404);
    if (target.role === "OWNER") return jsonError("Akun OWNER tidak bisa diubah", 400);
    if (actor.role === "ADMIN") {
      if (target.role !== "STAFF") return jsonError("ADMIN hanya boleh mengubah akun STAFF", 403);
      if (parsed.data.role) return jsonError("ADMIN tidak boleh mengubah role", 403);
      if (parsed.data.branch_id) {
        return jsonError("ADMIN tidak boleh memindahkan cabang", 403);
      }
    }

    // fail-closed: a STAFF must end up branch-bound. Demoting an ADMIN (or any/
    // role change) to STAFF without a branch would violate the
    // profiles_staff_needs_branch constraint (migration 0034) and surface as an
    // opaque Postgres 500 — this returns a readable 4xx instead.
    const finalRole = parsed.data.role ?? target.role;
    const finalBranch = parsed.data.branch_id ?? target.branch_id;
    if (finalRole === "STAFF" && !finalBranch) {
      return jsonError("Akun STAFF wajib terikat cabang — pilih cabang dulu", 400);
    }

    const branchMoved = parsed.data.branch_id !== undefined;
    await setStaffStatus(db, id, {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      ...(branchMoved ? { branch_id: parsed.data.branch_id } : {}),
    });

    await audit(db, {
      actorId: actor.user_id,
      actorRole: actor.role,
      action: "staff_update",
      entityType: "profiles",
      entityId: id,
      before: branchMoved ? { branch_id: target.branch_id } : undefined,
      after: parsed.data as never,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
