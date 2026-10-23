import { NoPermission } from "@/components/admin/no-permission";
import { getBranches, getSnacks } from "@/lib/catalog";
import { getStaffUser } from "@/lib/authz";
import { getFacilityTypeOptions, getPromosForAdmin } from "@/lib/promos";
import { isPublic } from "@/lib/promo-rules";
import { StatCards } from "@/components/admin/stat-cards";
import { PromoEditor } from "@/components/admin/promo-editor";

export const dynamic = "force-dynamic";

/**
 * Promotion management.
 *
 * This page did not exist, and the effect was a promo nobody could reach: the seeded
 * PROMO-MANTAI-GANET sat at status DRAFT, getPromotions() only reads ACTIVE, so
 * /promo rendered "Belum ada promo aktif" and there was no admin surface anywhere to
 * move it to ACTIVE. Six price rows were already in the database, invisible.
 *
 * Reads every status, not just ACTIVE — a panel that hid the draft would make it look
 * as though the promo did not exist, which is the confusion this page removes.
 */
export default async function AdminPromosPage() {
  // Promo membentang lintas cabang — bukan cakupan STAFF yang hanya
  // bertugas di satu cabang, jadi halaman ini milik OWNER/ADMIN.
  const me = await getStaffUser(["OWNER", "ADMIN"]).catch(() => null);
  if (!me) return <NoPermission />;

  const [promos, branches, facilities, snacks] = await Promise.all([
    getPromosForAdmin(),
    getBranches(),
    getFacilityTypeOptions(),
    // Only active snacks — offering a discontinued one as a perk would produce a promo
    // whose bonus can never be given (create_booking skips it and notes the shortfall).
    getSnacks(),
  ]);

  const branchOptions = branches.map((b) => ({ id: b.branch_id, label: b.short_name ?? b.name }));
  const facilityOptions = facilities;
  const snackOptions = snacks.map((s) => ({ id: s.snack_id, label: s.name }));
  const live = promos.filter((p) => isPublic(p.status)).length;
  const priceRows = promos.reduce((sum, p) => sum + p.promotion_items.length, 0);

  return (
    <div>
      <h1 className="font-display text-2xl uppercase">Promo</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Pelanggan hanya melihat promo berstatus <strong>ACTIVE</strong>. Status lain tetap
        tersimpan di sini sebagai draf.
      </p>

      <StatCards
        cards={[
          { label: "Total promo", value: promos.length },
          {
            label: "Tayang di situs",
            value: live,
            tone: live > 0 ? "primary" : "warning",
          },
          { label: "Draf", value: promos.filter((p) => p.status === "DRAFT").length, tone: "muted" },
          { label: "Baris harga", value: priceRows },
        ]}
      />

      <div className="mt-4 flex flex-col gap-4">
        {promos.map((p) => (
          <PromoEditor
            key={p.promotion_id}
            promoId={p.promotion_id}
            initial={{
              name: p.name,
              branch_id: p.branch_id,
              description: p.description,
              source_date: p.source_date ? p.source_date.slice(0, 10) : null,
              status: p.status,
              items: p.promotion_items.map((i) => ({
                facility_type_id: i.facility_type_id,
                duration_minutes: i.duration_minutes,
                price: i.price,
                bonus_snack_id: i.bonus_snack_id ?? null,
                bonus_quantity: i.bonus_quantity ?? 0,
              })),
            }}
            branchOptions={branchOptions}
            facilityOptions={facilityOptions}
            snackOptions={snackOptions}
          />
        ))}

        <PromoEditor
          promoId=""
          initial={{
            name: "",
            branch_id: branchOptions[0]?.id ?? "",
            description: null,
            source_date: null,
            status: "DRAFT",
            items: [],
          }}
          branchOptions={branchOptions}
          facilityOptions={facilityOptions}
          snackOptions={snackOptions}
          canDelete={false}
        />
      </div>
    </div>
  );
}