/**
 * Dirty-tracking for the admin table editor.
 *
 * Pure and import-free so a node test can exercise it without loading the client
 * component — the same reason branchAvailability() is its own module.
 */

export type Row = Record<string, unknown>;

/**
 * null, undefined and "" all mean the same absence of a value. Comparing them
 * with `!==` made a row look unsaved long after it was saved — the stored value
 * was null while the pending edit held "".
 */
const isBlank = (v: unknown) => v === null || v === undefined || v === "";
const sameValue = (a: unknown, b: unknown) => (isBlank(a) && isBlank(b)) || a === b;

/**
 * The uploader signals a cleared image with "". Storing that verbatim writes an
 * empty string into image_url, which renders as `<img src="">`; null is what the
 * column and the zod schema actually mean.
 */
export function normalizeCell(type: string | undefined, value: unknown) {
  return type === "image" && value === "" ? null : value;
}

/**
 * What the row is believed to hold: the last value we persisted for it, otherwise
 * the row we were handed. `key in forRow` rather than `??` so a deliberately
 * saved null still counts as a baseline.
 */
function baseline(
  rowId: string,
  key: string,
  saved: Record<string, Row>,
  row: Row,
): unknown {
  const forRow = saved[rowId];
  return forRow && key in forRow ? forRow[key] : row[key];
}

/**
 * True when a pending edit differs from what was last persisted for that row.
 *
 * `saved` is the snapshot taken after each successful save, which is what makes a
 * row go clean the instant its save lands. Comparing against the incoming `row`
 * instead left rows dirty forever whenever the server normalised the value on the
 * way in — every string goes through zod's `.trim()`.
 */
export function isRowDirty(
  columns: readonly { key: string }[],
  edits: Record<string, Row>,
  saved: Record<string, Row>,
  rowId: string,
  row: Row,
): boolean {
  const pending = edits[rowId];
  if (!pending) return false;
  return columns.some(
    (c) => c.key in pending && !sameValue(pending[c.key], baseline(rowId, c.key, saved, row)),
  );
}

/** Folds a row's pending edits into its saved snapshot. */
export function withSaved(
  saved: Record<string, Row>,
  rowId: string,
  edits: Record<string, Row>,
): Record<string, Row> {
  return { ...saved, [rowId]: { ...saved[rowId], ...edits[rowId] } };
}

/**
 * Client-side paging for the admin tables.
 *
 * These tables are a few dozen to a couple of hundred rows and the whole set is
 * already in memory — the editor needs it all anyway to render the stat cards and
 * to decide whether a row is dirty. So paging here rather than in a query: no
 * second round trip, no count query, and one implementation covers games,
 * pricing and snacks. It also survives `router.refresh()`, which every save
 * triggers; paging by URL searchParam would have put the staff back on page 1
 * after each edit.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number) {
  // A zero or NaN page size would otherwise slice([]) and render an empty table
  // while rows are plainly there.
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  // Clamped rather than trusted: rows disappear when staff disable a row, which can
  // leave the stored page pointing past the end.
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;

  return {
    page: current,
    pageCount,
    total,
    /** 1-based inclusive bounds of the visible window, for "1-25 dari 58". */
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : Math.min(start + size, total),
    slice: items.slice(start, start + size),
  };
}

/**
 * The page buttons to render: every page while there are few, otherwise a window
 * around the current one, with the first and last page always reachable. "gap"
 * marks where pages were elided.
 */
export function pageWindow(
  current: number,
  pageCount: number,
  span = 2,
): (number | "gap")[] {
  if (pageCount <= span * 2 + 3) return Array.from({ length: pageCount }, (_, i) => i + 1);

  const wanted = new Set<number>([1, pageCount, current]);
  for (let d = 1; d <= span; d++) {
    if (current - d > 1) wanted.add(current - d);
    if (current + d < pageCount) wanted.add(current + d);
  }

  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    if (previous && p - previous > 1) out.push("gap");
    out.push(p);
    previous = p;
  }
  return out;
}