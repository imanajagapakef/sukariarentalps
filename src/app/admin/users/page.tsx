import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { StaffManager } from "@/components/admin/staff-manager";
import { StatCards } from "@/components/admin/stat-cards";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = await getStaffUser(["OWNER"]);
  const db = createAdminClient();
  const [{ data: profiles }, { data: authUsers }] = await Promise.all([
    db.from("profiles").select("user_id, full_name, phone, role, active, created_at").order("created_at"),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const emails = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]));
  const staff = (profiles ?? []).map((p) => ({ ...p, email: emails.get(p.user_id) ?? null }));

  const roleCount = (r: string) => staff.filter((s) => s.role === r).length;
  const inactive = staff.filter((s) => !s.active).length;

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Staff</h1>
      <p className="mt-1 text-sm text-muted-foreground">Buat akun STAFF/ADMIN, ganti role, atau nonaktifkan. (OWNER only)</p>
      <StatCards
        cards={[
          { label: "Akun staff", value: staff.length },
          { label: "Aktif", value: staff.length - inactive, tone: "primary" },
          { label: "Nonaktif", value: inactive, tone: inactive > 0 ? "warning" : "muted" },
          { label: "Owner", value: roleCount("OWNER") },
          { label: "Admin", value: roleCount("ADMIN") },
          { label: "Staff", value: roleCount("STAFF") },
        ]}
      />
      <StaffManager staff={staff} meId={me.user_id} />
    </div>
  );
}
