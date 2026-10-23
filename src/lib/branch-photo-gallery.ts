/**
 * Pure helpers for the branch photo gallery (migration 0026).
 *
 * No imports on purpose, for the reason branch-availability.ts gives: these are
 * needed by the admin client component, the server pages and a node test, and
 * pulling the Supabase client in at module scope would make the test impossible.
 */

/** Mirrors the cap enforced by the enforce_branch_photo_limit trigger. Exported so
 *  the admin UI can stop offering an upload that the database would reject. */
export const BRANCH_PHOTO_LIMIT = 8;

export type BranchPhoto = {
  photo_id: number;
  branch_id: string;
  image_url: string;
  caption: string | null;
  position: number;
  created_at: string;
};

/**
 * Display order: lowest `position` first, `photo_id` breaking ties.
 *
 * The tiebreak matters because "jadikan utama" deliberately reuses a position
 * below the current minimum rather than renumbering the gallery, so ties are
 * normal rather than exceptional. Both the server reader and the admin grid sort
 * through this one function so the cover can never disagree between them.
 */
export function sortBranchPhotos<T extends Pick<BranchPhoto, "position" | "photo_id">>(photos: readonly T[]): T[] {
  return [...photos].sort((a, b) => a.position - b.position || a.photo_id - b.photo_id);
}

/** The branch's cover: the first photo in display order, or null when empty. */
export function branchCover<T extends Pick<BranchPhoto, "position" | "photo_id">>(photos: readonly T[]): T | null {
  return sortBranchPhotos(photos)[0] ?? null;
}

/** Whether the gallery will take another photo. Mirrors the database trigger, so
 *  the button disappears before staff waste an upload on a full gallery. */
export function canAddPhoto(count: number): boolean {
  return count < BRANCH_PHOTO_LIMIT;
}