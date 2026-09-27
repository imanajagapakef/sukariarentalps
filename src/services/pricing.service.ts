import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type DB = SupabaseClient<Database>;

export async function calculatePrice(
  db: DB,
  branchId: string,
  facilityTypeId: string,
  durationMinutes: number,
): Promise<number> {
  const { data, error } = await db.rpc("calculate_price", {
    p_branch_id: branchId,
    p_facility_type_id: facilityTypeId,
    p_duration_minutes: durationMinutes,
  });

  if (error) throw new Error(error.message);
  return data as number;
}