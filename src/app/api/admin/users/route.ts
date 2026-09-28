import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { createStaffUser } from "@/services/user-admin.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { staffCreateSchema } from "@/lib/validations/admin";

export async function GET() {
  try {
    await getStaffUser(["ADMIN", "OWNER"]);
    const db = createAdminClient();
    const [{ data: profiles, error }, { data: authUsers }] = await Promise.all([
      db.from("profiles").select("user_id, full_name, phone, role, active, created_at").order("created_at"),
      db.auth.admin.listUsers(),
    ]);
    if (error) throw new Error(error.message);
    const emails = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]));
    const staff = (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.user_id) ?? null }));
    return NextResponse.json({ staff });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER"]);
    const parsed = staffCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Data staff tidak valid", 400);

    const db = createAdminClient();
    const userId = await createStaffUser(db, {
      email: parsed.data.email.toLowerCase().trim(),
      password: parsed.data.password,
      fullName: parsed.data.full_name,
      role: parsed.data.role,
    });

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "staff_create",
      entityType: "profiles",
      entityId: userId,
      after: { role: parsed.data.role } as never,
    });

    return NextResponse.json({ user_id: userId }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
