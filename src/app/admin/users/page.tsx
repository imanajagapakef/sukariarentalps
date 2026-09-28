import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { StaffManager } from "@/components/admin/staff-manager";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getStaffUser(["OWNER"]);
  const db = createAdminClient();
  const [{ data: profiles }, { data: authUsers }] = await Promise.all([
    db.from("profiles").select("user_id, full_name, phone, role, active, created_at").order("created_at"),
    db.auth.admin.listUsers(),
  ]);
  const emails = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]));
  const staff = (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.user_id) ?? null }));

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Staff</h1>
      <p className="mt-1 text-sm text-muted-foreground">Buat akun STAFF/ADMIN, ganti role, atau nonaktifkan. (OWNER only)</p>
      <StaffManager staff={staff} meId={me.user_id} />
    </div>
  );
}
