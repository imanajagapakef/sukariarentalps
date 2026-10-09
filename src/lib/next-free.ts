import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Next-free timestamp per non-available unit via the batch RPC.
 * Replaces the old one-RPC-per-unit loop (N+1 network round-trips).
 */
export async function getNextFreeMap(
  db: SupabaseClient<Database>,
  units: { unit_id: string; status: string }[],
  now = new Date(),
): Promise<Map<string, string | null>> {
  const occupied = units.filter((u) => u.status !== "AVAILABLE").map((u) => u.unit_id);
  const map = new Map<string, string | null>();
  if (occupied.length === 0) return map;
  const { data, error } = await db.rpc("next_available_batch", {
    p_unit_ids: occupied,
    p_from: now.toISOString(),
  });
  if (error) throw new Error(error.message);
  for (const row of data ?? []) map.set(row.unit_id, row.next_free);
  return map;
}
