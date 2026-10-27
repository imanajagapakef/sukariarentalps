import { PageHero } from "@/components/page-hero";
import { AlertTriangle, CheckCircle2, Crown, MapPin, ShieldCheck, UserCog, Users } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { StaffManager } from "@/components/admin/staff-manager";
import { StatCards } from "@/components/stat-cards";

export const dynamic = "force-dynamic";

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

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
  const active = staff.length - inactive;

  // ---- Health checks: things an owner would want to know before they bite. ----
  const activeOwners = staff.filter((s) => s.role === "OWNER" && s.active).length;
  // Staff bound to a branch that is gone/inactive: the name lookup fell back to a raw id.
  const orphaned = staff.filter((s) => s.role === "STAFF" && s.branch_id && !branchNames.has(s.branch_id)).length;
  const unbound = staff.filter((s) => s.role === "STAFF" && s.active && !s.branch_id).length;
  // Active branches with nobody on shift-able staff: customers book, nobody checks them in.
  const uncovered = (branches ?? []).filter(
    (b) => !staff.some((s) => s.role === "STAFF" && s.active && s.branch_id === b.branch_id),
  );

  type Alert = { tone: "danger" | "warning"; text: string };
  const alerts: Alert[] = [];
  if (activeOwners === 0) alerts.push({ tone: "danger", text: "Tidak ada OWNER aktif — tidak ada yang bisa mengatur role & cabang." });
  if (unbound > 0) alerts.push({ tone: "warning", text: `${unbound} staff aktif belum punya cabang.` });
  if (orphaned > 0) alerts.push({ tone: "warning", text: `${orphaned} staff terikat ke cabang yang sudah nonaktif/hilang.` });
  if (uncovered.length > 0) {
    const names = uncovered.map((b) => b.short_name ?? b.name);
    alerts.push({
      tone: "warning",
      text: `Cabang tanpa staff aktif: ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}.`,
    });
  }

  const roles = [
    { key: "OWNER", label: "Owner", n: roleCount("OWNER"), bar: "bg-primary" },
    { key: "ADMIN", label: "Admin", n: roleCount("ADMIN"), bar: "bg-warning" },
    { key: "STAFF", label: "Staff", n: roleCount("STAFF"), bar: "bg-muted-foreground/50" },
  ];

  return (
    <div>
      <PageHero
        size="admin"
        title="Staff"
        titleIcon={Users}
        eyebrow={{ icon: ShieldCheck, label: `Akses & peran · ${staff.length} akun` }}
        description={
          isOwner
            ? "Kelola seluruh akun: buat STAFF/ADMIN, ubah role, pindahkan cabang, atau nonaktifkan."
            : "Kelola akun STAFF cabangmu: buat, aktifkan/nonaktifkan. Role dan cabang hanya diatur OWNER."
        }
      />

      {/* TEAM PULSE */}
      <section
        aria-label="Ringkasan tim"
        className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
              {isOwner ? <Crown aria-hidden className="size-5" /> : <UserCog aria-hidden className="size-5" />}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kamu masuk sebagai</p>
              <p className="font-display text-lg uppercase leading-tight">
                {me.role}
                <span className="ml-2 text-sm normal-case text-muted-foreground">
                  {isOwner ? "· akses penuh" : "· kelola staff cabang"}
                </span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl leading-none tabular-nums">{pct(active, staff.length)}%</p>
            <p className="text-xs text-muted-foreground">
              akun aktif · {active}/{staff.length}
            </p>
          </div>
        </div>

        {/* role distribution */}
        {staff.length > 0 && (
          <div className="relative mt-4">
            <div
              role="img"
              aria-label={roles.map((r) => `${r.label} ${r.n}`).join(", ")}
              className="flex h-2.5 overflow-hidden rounded-full bg-muted"
            >
              {roles.map(
                (r) => r.n > 0 && <div key={r.key} className={r.bar} style={{ width: `${pct(r.n, staff.length)}%` }} />,
              )}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {roles.map((r) => (
                <li key={r.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={`size-2 rounded-full ${r.bar}`} />
                  {r.label} <span className="font-semibold tabular-nums text-foreground">{r.n}</span>
                </li>
              ))}
              <li className="flex items-center gap-1.5">
                <MapPin aria-hidden className="size-3" />
                {(branches ?? []).length - uncovered.length}/{(branches ?? []).length} cabang punya staff aktif
              </li>
            </ul>
          </div>
        )}

        {/* health */}
        <div className="relative mt-4">
          {alerts.length === 0 ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">
              <CheckCircle2 aria-hidden className="size-3.5" /> Struktur tim sehat — semua cabang terjaga.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {alerts.map((a) => (
                <li
                  key={a.text}
                  role={a.tone === "danger" ? "alert" : undefined}
                  className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                    a.tone === "danger" ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                  }`}
                >
                  <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {a.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <StatCards
        cards={[
          { label: "Akun staff", value: staff.length },
          { label: "Aktif", value: active, tone: "primary" },
          { label: "Nonaktif", value: inactive, tone: inactive > 0 ? "warning" : "muted" },
          { label: "Owner", value: roleCount("OWNER"), tone: activeOwners === 0 ? "warning" : undefined },
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