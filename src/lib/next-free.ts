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

/**
 * Next-free for every busy unit, optionally scoped to one branch.
 *
 * The RPC resolves the unit list itself, so a page can fire it in the same wave as
 * its catalogue reads. With the unit list supplied by the caller — which is what this
 * module's other function forces — the RPC could only run *after* the units came back,
 * and every public page paid a second network round trip to learn four timestamps.
 */
export async function getNextFreeMapByBranch(
  db: SupabaseClient<Database>,
  branchId: string | null,
  now = new Date(),
): Promise<Map<string, string | null>> {
  const { data, error } = await db.rpc("next_available_by_branch", {
    p_branch_id: branchId ?? undefined,
    p_from: now.toISOString(),
  });
  if (error) throw new Error(error.message);

  const map = new Map<string, string | null>();
  for (const row of data ?? []) map.set(row.unit_id, row.next_free);
  return map;
}
