import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AuthError } from "@/lib/authz";

type DB = SupabaseClient<Database>;

export type MovementInput = {
  snack_id: string;
  movement_type: Database["public"]["Enums"]["inventory_movement_type"];
  qty_delta: number;
  reason?: string;
  booking_id?: string | null;
  actor_id?: string | null;
};

/**
 * Record a stock movement. `snacks.stock` is never written directly — the
 * `inventory_movements_apply` BEFORE INSERT trigger applies the delta, fills
 * `stock_after` and rejects an oversell, so the ledger is the only record of who moved
 * what.
 *
 * `stock_after` is NOT NULL in the schema but is filled by that trigger, which the
 * generated `Insert` type cannot know about — hence the cast. The same omission is what
 * the SQL in migration 0010 relies on.
 */
export async function insertMovement(db: DB, input: MovementInput) {
  const { error } = await db
    .from("inventory_movements")
    .insert(input as Database["public"]["Tables"]["inventory_movements"]["Insert"]);
  if (error) throw new AuthError(error.message, 500);
}
