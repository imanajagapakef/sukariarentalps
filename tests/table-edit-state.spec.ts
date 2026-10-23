import { describe, expect, it } from "vitest";
import { isRowDirty, normalizeCell, pageWindow, paginate, withSaved } from "@/lib/table-edit-state";

const COLUMNS = [{ key: "image_url" }, { key: "name" }, { key: "price" }];

describe("admin table dirty state", () => {
  it("is clean for a row nobody has edited", () => {
    expect(isRowDirty(COLUMNS, {}, {}, "GM-002", { image_url: null, name: "A" })).toBe(false);
  });

  it("is dirty once a cell differs from the stored value", () => {
    const edits = { "GM-002": { image_url: "https://x/cover-abc.svg" } };
    expect(isRowDirty(COLUMNS, edits, {}, "GM-002", { image_url: null })).toBe(true);
  });

  it("treats null, undefined and the empty string as the same absence", () => {
    // Without this a row stayed dirty forever: the uploader signals a cleared
    // image with "", the column stores null, and `!==` never settled.
    const row = { image_url: null };
    expect(isRowDirty(COLUMNS, { G: { image_url: "" } }, {}, "G", row)).toBe(false);
    expect(isRowDirty(COLUMNS, { G: { image_url: null } }, {}, "G", row)).toBe(false);
    expect(isRowDirty(COLUMNS, { G: { image_url: undefined } }, {}, "G", row)).toBe(false);
  });

  it("goes clean the moment a save is recorded, before the rows prop catches up", () => {
    // The regression: clearing the pending edit after saving dropped the cell back
    // to the pre-save `rows` prop, so an uploaded photo vanished on save and only
    // reappeared after a reload. The overlay survives; `saved` is what it compares
    // against, so the button greys out immediately.
    const edits = { GM: { image_url: "https://x/new.svg" } };
    const stillOld = { image_url: null }; // server has not refreshed yet
    const saved = withSaved({}, "GM", edits);

    expect(isRowDirty(COLUMNS, edits, {}, "GM", stillOld)).toBe(true);
    expect(isRowDirty(COLUMNS, edits, saved, "GM", stillOld)).toBe(false);
  });

  it("stays clean when the server normalises the value on the way in", () => {
    // Every string crosses zod's .trim(), so what comes back is rarely the exact
    // string that was sent. Comparing against the row instead of the saved
    // snapshot pinned the row as unsaved for good.
    const edits = { GM: { name: "  Tekken 8  " } };
    const saved = withSaved({}, "GM", edits);
    expect(isRowDirty(COLUMNS, edits, saved, "GM", { name: "Tekken 8" })).toBe(false);
  });

  it("only tracks the columns the editor is given", () => {
    const edits = { GM: { condition: "DAMAGED" } };
    expect(isRowDirty(COLUMNS, edits, {}, "GM", { condition: "GOOD" })).toBe(false);
  });

  it("keeps each row's saved snapshot independent", () => {
    let saved = withSaved({}, "A", { A: { name: "one" } });
    saved = withSaved(saved, "B", { B: { name: "two" } });
    expect(saved.A).toEqual({ name: "one" });
    expect(saved.B).toEqual({ name: "two" });

    // Saving A again must not disturb B.
    saved = withSaved(saved, "A", { A: { name: "uno" } });
    expect(saved.B).toEqual({ name: "two" });
  });

  it("normalises a cleared image to null instead of an empty string", () => {
    // "" would land in image_url and render as <img src="">.
    expect(normalizeCell("image", "")).toBeNull();
    expect(normalizeCell("image", "https://x/a.png")).toBe("https://x/a.png");
    // Only image columns are special: clearing a text field is still "".
    expect(normalizeCell("text", "")).toBe("");
    expect(normalizeCell(undefined, "")).toBe("");
  });
});

describe("admin table paging", () => {
  const fifty8 = Array.from({ length: 58 }, (_, i) => i);

  it("cuts the table into pages and reports the visible bounds", () => {
    const first = paginate(fifty8, 1, 25);
    expect(first.page).toBe(1);
    expect(first.pageCount).toBe(3);
    expect(first.slice).toHaveLength(25);
    expect(first.from).toBe(1);
    expect(first.to).toBe(25);
    expect(first.total).toBe(58);

    const last = paginate(fifty8, 3, 25);
    // The tail page is short, and `to` must not overshoot the row count.
    expect(last.slice).toHaveLength(8);
    expect(last.from).toBe(51);
    expect(last.to).toBe(58);
  });

  it("clamps a page that points past the end", () => {
    // Disabling rows shrinks the table under a stored page index; without clamping
    // the table renders empty with the pager still claiming page 3.
    const shrunk = Array.from({ length: 10 }, (_, i) => i);
    const view = paginate(shrunk, 3, 25);
    expect(view.page).toBe(1);
    expect(view.pageCount).toBe(1);
    expect(view.slice).toHaveLength(10);
  });

  it("clamps a page below one", () => {
    expect(paginate(fifty8, 0, 25).page).toBe(1);
    expect(paginate(fifty8, -4, 25).page).toBe(1);
  });

  it("survives an empty table", () => {
    const view = paginate([], 1, 25);
    expect(view).toMatchObject({ page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
    expect(view.slice).toEqual([]);
  });

  it("falls back to a usable page size instead of rendering nothing", () => {
    // pageSize 0 would slice([]) and blank the table while every row is present.
    for (const size of [0, -3, Number.NaN]) {
      const view = paginate(fifty8, 1, size);
      expect(view.slice.length).toBeGreaterThan(0);
      expect(view.page).toBe(1);

      // And the fallback must not lose rows: walking every page still yields all
      // 58, each exactly once.
      const seen = new Set<number>();
      for (let p = 1; p <= view.pageCount; p++) {
        for (const row of paginate(fifty8, p, size).slice) seen.add(row);
      }
      expect(seen.size).toBe(58);
    }
  });

  it("shows one page and no pager when everything fits", () => {
    expect(paginate(fifty8, 1, 100).pageCount).toBe(1);
  });
});

describe("admin table page window", () => {
  it("lists every page while there are few", () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("keeps the first and last page reachable and elides the middle", () => {
    const buttons = pageWindow(5, 20);
    expect(buttons[0]).toBe(1);
    expect(buttons.at(-1)).toBe(20);
    expect(buttons).toContain(5);
    expect(buttons).toContain("gap");
    expect(buttons).toContain(3);
    expect(buttons).toContain(7);
    expect(buttons).not.toContain(15);
  });

  it("does not put a gap next to the edge pages", () => {
    // At the first page, 2 and 3 are real pages — a leading gap there would be a
    // button for a page that plainly exists.
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, "gap", 20]);
    expect(pageWindow(20, 20)).toEqual([1, "gap", 18, 19, 20]);
  });

  it("handles a single page without a stray gap", () => {
    expect(pageWindow(1, 1)).toEqual([1]);
  });
});