import { createAdminClient } from "@/lib/supabase/admin";
import { getFacilityTypes } from "@/lib/catalog";
import { sortItems, type PromoItem, type PromoStatus } from "@/lib/promo-rules";

/**
 * Promotion reads for the admin panel.
 *
 * Deliberately not `getPromotions()` from catalog.ts: that one filters to ACTIVE
 * because it feeds the public page, and an admin editing a promo needs to see the
 * DRAFT and ENDED ones too — a panel that hides them looks like the promo does not
 * exist.
 *
 * Uses the service client: inventory_movements already needed it on /admin/snacks
 * for the same reason, the ledger is staff-only data behind RLS.
 */
export type PromoItemRow = PromoItem & { facility_types: { name: string } | null };

export type PromoRow = {
  promotion_id: string;
  branch_id: string;
  name: string;
  description: string | null;
  status: PromoStatus;
  source_date: string | null;
  created_at: string;
  updated_at: string;
  promotion_items: PromoItemRow[];
};

export async function getPromosForAdmin(): Promise<PromoRow[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("promotions")
    .select(
      `promotion_id, branch_id, name, description, status, source_date, created_at, updated_at,
       promotion_items(facility_type_id, duration_minutes, price, bonus_snack_id, bonus_quantity, facility_types(name))`,
    )
    .order("name");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as PromoRow[];
  for (const row of rows) {
    row.promotion_items = sortItems(
      ((row.promotion_items ?? []) as PromoItemRow[]).filter((i) => i.facility_type_id),
    );
  }
  return rows;
}

/** Facility types for the item editor's dropdown. getFacilityTypes() already does
 *  exactly this read over RLS public access, so there is no reason for a second one. */
export async function getFacilityTypeOptions(): Promise<{ id: string; label: string }[]> {
  return (await getFacilityTypes()).map((f) => ({ id: f.facility_type_id, label: f.name }));
}