import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { StaffManager } from "@/components/admin/staff-manager";
import { StatCards } from "@/components/admin/stat-cards";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  // ADMIN ikut mengelola akun sekarang — membuat & mengaktif/nonaktifkan
  // STAFF. Cakupan per aksi tetap dijaga server-side: role dan pindah cabang
  // hanya OWNER, dan ADMIN hanya melihat/menyentuh baris STAFF.
  const me = await getStaffUser(["ADMIN", "OWNER"]);
  const isOwner = me.role === "OWNER";
  const db = createAdminClient();
  const [{ data: profiles }, { data: authUsers }, { data: branches }] = await Promise.all([
    db
      .from("profiles")
      .select("user_id, full_name, phone, role, active, branch_id, created_at")
      .order("created_at"),
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db
      .from("branches")
      .select("branch_id, branch_code, short_name, name")
      .eq("status", "ACTIVE")
      .order("branch_code"),
  ]);
  const emails = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email]));
  const branchNames = new Map((branches ?? []).map((b) => [b.branch_id, b.short_name ?? b.name]));
  const staff = (profiles ?? []).map((p) => ({
    ...p,
    email: emails.get(p.user_id) ?? null,
    // Nama tidak ketemu berarti bind menunjuk cabang nonaktif/hilang —
    // fallback ke id mentah masih lebih jujur daripada berpura-pura.
    branch_name: (p.branch_id ? branchNames.get(p.branch_id) : null) ?? p.branch_id ?? null,
  }));

  const roleCount = (r: string) => staff.filter((s) => s.role === r).length;
  const inactive = staff.filter((s) => !s.active).length;

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Staff</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {isOwner
          ? "Kelola seluruh akun: buat STAFF/ADMIN, ubah role, pindahkan cabang, atau nonaktifkan."
          : "Kelola akun STAFF cabangmu: buat, aktifkan/nonaktifkan. Role dan cabang hanya diatur OWNER."}
      </p>
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
      <StaffManager
        staff={staff}
        meId={me.user_id}
        meRole={me.role}
        branches={(branches ?? []).map((b) => ({
          branch_id: b.branch_id,
          branch_code: b.branch_code,
          branch_name: b.short_name ?? b.name,
        }))}
      />
    </div>
  );
}
