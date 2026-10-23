import { NoPermission } from "@/components/admin/no-permission";
import { createClient } from "@/lib/supabase/server";
import { getStaffUser } from "@/lib/authz";
import { getBranches } from "@/lib/catalog";
import { TableEditor } from "@/components/admin/table-editor";
import type { Column } from "@/components/admin/table-editor";
import { StatCards } from "@/components/admin/stat-cards";

export const dynamic = "force-dynamic";

export default async function AdminPricingPage() {
  // Harga tiap cabang adalah data OWNER/ADMIN. Tanpa gerbang URL ini STAFF
  // tetap bisa membaca tarif semua cabang walau form tulisnya sudah 403.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const db = await createClient();
  const [branches, { data: rules }, { data: facilities }] = await Promise.all([
    getBranches(),
    db.from("pricing_rules").select("*").eq("active", true).order("branch_id").order("facility_type_id"),
    db.from("facility_types").select("facility_type_id, name"),
  ]);

  const branchOptions = branches.map((b) => ({ value: b.branch_id, label: b.name }));
  const facOptions = (facilities ?? []).map((f) => ({ value: f.facility_type_id, label: f.name }));

  const COLUMNS: Column[] = [
    { key: "branch_id", label: "Cabang", type: "select", options: branchOptions },
    { key: "facility_type_id", label: "Fasilitas", type: "select", options: facOptions },
    { key: "pricing_type", label: "Jenis", type: "select", options: [{ value: "HOURLY", label: "Per Jam" }, { value: "PACKAGE", label: "Paket" }] },
    { key: "duration_minutes", label: "Durasi (mnt)", type: "number" },
    { key: "price", label: "Harga", type: "number" },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Harga</h1>
      <StatCards
        cards={[
          { label: "Aturan aktif", value: rules?.length ?? 0 },
          { label: "Cabang tercakup", value: new Set((rules ?? []).map((r) => r.branch_id)).size },
          {
            label: "Fasilitas tercakup",
            value: `${new Set((rules ?? []).map((r) => r.facility_type_id)).size} dari ${facilities?.length ?? 0}`,
            // Gaps here are why a booking form can be missing an option.
            tone:
              new Set((rules ?? []).map((r) => r.facility_type_id)).size < (facilities?.length ?? 0)
                ? "warning"
                : "primary",
          },
          { label: "Jenis paket", value: (rules ?? []).filter((r) => r.pricing_type === "PACKAGE").length },
        ]}
      />
      <p className="mt-1 text-sm text-muted-foreground">HOURLY = per jam; PACKAGE = harga flat untuk durasi tertentu. (ADMIN/OWNER)</p>
      <div className="mt-4">
        <TableEditor endpoint="/api/admin/pricing" idKey="pricing_id" columns={COLUMNS} rows={rules ?? []} />
      </div>
    </div>
  );
}