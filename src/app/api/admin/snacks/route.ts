import { adminCrud } from "@/lib/api/admin-crud";
import { snackSchema } from "@/lib/validations/admin";
import type { StaffProfile } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertMovement } from "@/lib/inventory";

/**
 * `snacks.stock` is owned by the `inventory_movements` BEFORE INSERT trigger: the
 * movement row is what actually moves stock, fills `stock_after`, and rejects an
 * oversell. So a hand correction from the admin table is recorded as an ADJUSTMENT
 * movement and the column is left out of the UPDATE entirely.
 *
 * Without this, staff could set stock to any number and the ledger — the only
 * record of who moved what — would stay silent.
 */
async function stockThroughLedger({
  db,
  profile,
  before,
  body,
}: {
  db: ReturnType<typeof createAdminClient>;
  profile: StaffProfile;
  id: string;
  before: Record<string, unknown>;
  body: Record<string, unknown>;
}) {
  const { stock, stock_reason, ...rest } = body as {
    stock?: number;
    stock_reason?: string;
  };

  const current = Number(before.stock ?? 0);
  if (stock === undefined || stock === current) return rest;

  await insertMovement(db, {
    snack_id: before.snack_id as string,
    movement_type: "ADJUSTMENT",
    qty_delta: stock - current,
    reason: stock_reason?.trim() || "koreksi stok manual",
    actor_id: profile.user_id,
  });

  return rest;
}

const crud = adminCrud("snacks", snackSchema, undefined, stockThroughLedger);
export const { POST, PATCH, DELETE } = crud;
