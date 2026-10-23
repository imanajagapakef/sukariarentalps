import { describe, expect, it } from "vitest";
import {
  branchCover,
  canAddPhoto,
  sortBranchPhotos,
  BRANCH_PHOTO_LIMIT,
} from "@/lib/branch-photo-gallery";

/** Only the fields the ordering actually reads. */
const photo = (photo_id: number, position: number) => ({
  photo_id,
  position,
  branch_id: "BR-B5",
  image_url: `https://x.test/${photo_id}.webp`,
  caption: null,
  created_at: "2026-10-17T00:00:00Z",
});

describe("branch photo order", () => {
  it("puts the lowest position first", () => {
    const sorted = sortBranchPhotos([photo(3, 30), photo(1, 10), photo(2, 20)]);
    expect(sorted.map((p) => p.photo_id)).toEqual([1, 2, 3]);
  });

  it("breaks a tie on photo_id", () => {
    // "Jadikan utama" moves a photo below the current minimum instead of
    // renumbering the gallery, so equal positions are routine, not a bug.
    const sorted = sortBranchPhotos([photo(7, 5), photo(4, 5), photo(9, 5)]);
    expect(sorted.map((p) => p.photo_id)).toEqual([4, 7, 9]);
  });

  it("handles negative positions from a promotion", () => {
    const sorted = sortBranchPhotos([photo(1, 0), photo(2, -1)]);
    expect(sorted.map((p) => p.photo_id)).toEqual([2, 1]);
  });

  it("does not mutate its input", () => {
    const input = [photo(2, 20), photo(1, 10)];
    sortBranchPhotos(input);
    expect(input.map((p) => p.photo_id)).toEqual([2, 1]);
  });
});

describe("branch cover", () => {
  it("is the first photo in display order", () => {
    expect(branchCover([photo(5, 50), photo(2, 1)])?.photo_id).toBe(2);
  });

  it("is null for an empty gallery, not undefined", () => {
    // The pages use ?? against a fallback chain, so undefined would slip through
    // and render a blank hero.
    expect(branchCover([])).toBeNull();
  });
});

describe("branch photo limit", () => {
  it("mirrors the database cap", () => {
    expect(BRANCH_PHOTO_LIMIT).toBe(8);
  });

  it("stops offering an upload once the gallery is full", () => {
    expect(canAddPhoto(7)).toBe(true);
    expect(canAddPhoto(BRANCH_PHOTO_LIMIT)).toBe(false);
    expect(canAddPhoto(BRANCH_PHOTO_LIMIT + 1)).toBe(false);
  });
});