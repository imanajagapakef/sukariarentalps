import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import type { UnitRow } from "@/lib/catalog";

/**
 * Filtered + sorted unit list for /admin/units.
 *
 * Lives here rather than in catalog.ts because that module reads through the
 * cookie-scoped client (RLS, no service role) on purpose — it serves the public
 * catalogue. An admin query is a different job, and `createAdminClient` is what
 * makes this testable: `cookies()` throws outside a request scope, which is why
 * the admin builder is a plain export that a node test can call directly.
 */
const UNIT_SCALARS =
  "unit_id, image_url, name, status, condition, branch_id, facility_type_id, branches(name, short_name), facility_types(name, platform, category)";

export const UNIT_STATUSES = [
  "AVAILABLE",
  "BOOKED",
  "IN_USE",
  "IN_ORDER",
  "MAINTENANCE",
  "OFFLINE",
] as const;

export const UNIT_SORTS = ["unit_id", "name", "status", "condition"] as const;

export type UnitFilters = {
  q?: string;
  branch?: string;
  status?: string;
  sort?: string;
  dir?: string;
};

export async function listUnits(filters: UnitFilters): Promise<UnitRow[]> {
  const { q, branch, status, sort, dir } = filters;
  const db = createAdminClient();

  let query = db.from("units").select(UNIT_SCALARS);

  if (branch) query = query.eq("branch_id", branch);
  if (status && (UNIT_STATUSES as readonly string[]).includes(status)) {
    query = query.eq("status", status as Database["public"]["Enums"]["unit_status"]);
  }
  if (q) {
    // PostgREST metacharacters would break out of the .or() expression, and % / _
    // are ILIKE wildcards, so the search box is escaped before it is interpolated.
    const term = q.replace(/[%_,().:\\"]/g, "");
    if (term) query = query.or(`unit_id.ilike.%${term}%,name.ilike.%${term}%`);
  }

  // `sort` is interpolated into .order(), so anything unrecognised falls back
  // instead of reaching PostgREST.
  const column = (UNIT_SORTS as readonly string[]).includes(sort ?? "") ? sort! : "unit_id";
  // The second order keeps same-name rows (there are two `Capsule 01`, one per
  // branch) in a stable order across pages.
  query = query.order(column, { ascending: dir !== "desc" }).order("unit_id");

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as UnitRow[];
}

/** Branch list for the /admin/units filter. Two rows; no pagination needed. */
export async function getBranchOptions() {
  const db = createAdminClient();
  const { data, error } = await db
    .from("branches")
    .select("branch_id, name, short_name")
    .eq("status", "ACTIVE")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
