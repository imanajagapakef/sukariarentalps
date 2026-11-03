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

/** Rows per page in the admin unit table. */
export const UNIT_PAGE_SIZE = 10;

/**
 * The one filter + order chain the unpaginated list, the paged list and the status
 * breakdown all share, so they can never disagree about which units are in scope.
 *
 * Synchronous on purpose: a `PostgrestFilterBuilder` is thenable, so awaiting here
 * would run the whole set before the caller gets to add a range or a limit.
 */
function filteredQuery(filters: UnitFilters, select: string = UNIT_SCALARS) {
  const { q, branch, status, sort, dir } = filters;
  const db = createAdminClient();

  let query = db.from("units").select(select, { count: "exact" });

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
  return query.order(column, { ascending: dir !== "desc" }).order("unit_id");
}

/**
 * Every unit matching the filters, unbounded.
 *
 * The admin table pages via `listUnitsPage`; this stays for callers that genuinely
 * want the whole filtered set (and the query tests). Do not point a table at it.
 */
export async function listUnits(filters: UnitFilters): Promise<UnitRow[]> {
  const { data, error } = await filteredQuery(filters);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as UnitRow[];
}

/**
 * One ranged window, plus the exact total PostgREST returns alongside it. `pastEnd` marks
 * the 416 ("range not satisfiable") a stale `?page=` produces, so the caller can clamp.
 */
async function rangedUnitsPage(
  filters: UnitFilters,
  page: number,
): Promise<{ rows: UnitRow[]; total: number; pastEnd: boolean }> {
  const { data, error, count } = await filteredQuery(filters).range(
    (page - 1) * UNIT_PAGE_SIZE,
    page * UNIT_PAGE_SIZE - 1,
  );
  if (error) {
    if ((error as { code?: string }).code === "PGRST103") return { rows: [], total: 0, pastEnd: true };
    throw new Error(error.message);
  }
  return { rows: (data ?? []) as unknown as UnitRow[], total: count ?? 0, pastEnd: false };
}

export type UnitPage = {
  rows: UnitRow[];
  /** Exact size of the filtered set, not `rows.length`. */
  total: number;
  /** 1-based page actually shown — clamped, so a stale ?page= never renders empty. */
  page: number;
  pageCount: number;
  pageSize: number;
  /** 1-based inclusive range `rows` covers, for "Menampilkan 1–10 dari 42 unit". */
  from: number;
  to: number;
};

/**
 * One page of the admin unit table, with the exact size of the filtered set behind it.
 *
 * The window query carries `count: "exact"`, so the total comes back with the rows in one
 * request. A stale `?page=` past the end (PostgREST 416 / PGRST103) costs one extra read
 * and then lands on the last page instead of throwing.
 */
export async function listUnitsPage(filters: UnitFilters, page: number): Promise<UnitPage> {
  const pageSize = UNIT_PAGE_SIZE;
  const requested = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  let res = await rangedUnitsPage(filters, requested);
  let effective = requested;
  if (res.pastEnd) {
    const head = await rangedUnitsPage(filters, 1);
    const pageCount = Math.max(1, Math.ceil(head.total / pageSize));
    effective = Math.min(requested, pageCount);
    res = effective === 1 ? head : await rangedUnitsPage(filters, effective);
  }

  const total = res.total;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rows = res.rows;

  return {
    rows,
    total,
    page: effective,
    pageCount,
    pageSize,
    from: rows.length ? (effective - 1) * pageSize + 1 : 0,
    to: (effective - 1) * pageSize + rows.length,
  };
}

/**
 * Counts per status over the filtered set, for the stat strip.
 *
 * Reads only the `status` column, so the payload is a list of short strings rather than
 * full unit rows — a page of the table would otherwise make the counts describe one page
 * instead of the fleet.
 */
export async function unitStatusBreakdown(filters: UnitFilters): Promise<Record<string, number>> {
  const { data, error } = await filteredQuery(filters, "status");
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as unknown as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
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
