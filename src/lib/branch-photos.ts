import { cache } from "react";
import { createPublicClient as createClient } from "@/lib/supabase/public";
import { sortBranchPhotos, type BranchPhoto } from "@/lib/branch-photo-gallery";

/**
 * Branch photo gallery reads (migration 0026).
 *
 * One branch has many photos; the first in `position` order is its cover, and the
 * customer-facing branch page takes its hero from there. The ordering itself lives
 * in the pure module so the admin grid and these reads cannot disagree.
 *
 * Cached like the other catalog reads, because /cabang and every branch page render
 * from it. Admin writes go through the API route, which revalidates the server
 * components it affects.
 */

/** Every branch's photos, keyed by branch_id, each already in display order. */
export const getBranchPhotos = cache(async (): Promise<Map<string, BranchPhoto[]>> => {
  const db = createClient();
  const { data, error } = await db
    .from("branch_photos")
    .select("photo_id, branch_id, image_url, caption, position, created_at");
  if (error) throw new Error(error.message);

  const byBranch = new Map<string, BranchPhoto[]>();
  for (const row of (data ?? []) as BranchPhoto[]) {
    const list = byBranch.get(row.branch_id);
    if (list) list.push(row);
    else byBranch.set(row.branch_id, [row]);
  }
  // Sorted here rather than in the query so the tiebreak rule lives in one place.
  for (const [id, list] of byBranch) byBranch.set(id, sortBranchPhotos(list));
  return byBranch;
});

/** One branch's photos, already in display order. Empty array, never undefined. */
export const getBranchPhotosFor = cache(async (branchId: string): Promise<BranchPhoto[]> => {
  return (await getBranchPhotos()).get(branchId) ?? [];
});