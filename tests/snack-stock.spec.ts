import { describe, expect, it } from "vitest";
import { stockStatus } from "@/lib/snack-stock";

/**
 * The regression these guard against is narrow and specific: `stock === 0` also satisfies
 * `stock <= min_stock`, so any implementation that renders a label per condition will
 * paint two labels on a sold-out item. These cases pin that boundary from both sides.
 */
describe("stockStatus", () => {
  it("reports a sold-out item as out", () => {
    expect(stockStatus({ stock: 0, min_stock: 5 })).toBe("out");
    expect(stockStatus({ stock: 0, min_stock: 0 })).toBe("out");
    expect(stockStatus({ stock: 0, min_stock: 50 })).toBe("out");
  });

  it("never reports a sold-out item as low, however low the threshold sits", () => {
    // min_stock = 0 is the case that broke: 0 <= 0 is true, so a naive two-condition
    // render put both labels on the same card.
    expect(stockStatus({ stock: 0, min_stock: 0 })).not.toBe("low");
    expect(stockStatus({ stock: 0, min_stock: 3 })).not.toBe("low");
  });

  it("reports stock at or under the threshold as low", () => {
    expect(stockStatus({ stock: 3, min_stock: 5 })).toBe("low");
    expect(stockStatus({ stock: 5, min_stock: 5 })).toBe("low");
  });

  it("reports stock above the threshold as ok", () => {
    expect(stockStatus({ stock: 6, min_stock: 5 })).toBe("ok");
    expect(stockStatus({ stock: 1, min_stock: 0 })).toBe("ok");
    expect(stockStatus({ stock: 40, min_stock: 10 })).toBe("ok");
  });

  it("handles a negative threshold, where only the zero check can fire", () => {
    // A negative min_stock means nothing is ever "low", so an out-of-stock item must
    // still come back as out rather than slipping through to ok.
    expect(stockStatus({ stock: 0, min_stock: -1 })).toBe("out");
    expect(stockStatus({ stock: 4, min_stock: -1 })).toBe("ok");
  });
});
