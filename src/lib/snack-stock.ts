/**
 * Snack availability.
 *
 * The menu used to test `stock === 0` and `stock <= min_stock` as two independent
 * questions and render a label for each. They are not independent: zero satisfies both,
 * so a sold-out item showed "stok tipis" and "habis" at the same time.
 *
 * Collapsing the two into one value fixes the double label and makes a second class of
 * bug unrepresentable: the dimmed card and its badge now read from the same source, so
 * they cannot disagree about what state an item is in.
 *
 * Pure and dependency-free, so the three states can be tested without a database.
 */

export type Stock = "out" | "low" | "ok";

export function stockStatus({
  stock,
  min_stock,
}: {
  stock: number;
  min_stock: number;
}): Stock {
  // Zero is checked first and returns early, so it can never also reach the low branch.
  if (stock === 0) return "out";
  if (stock <= min_stock) return "low";
  return "ok";
}
