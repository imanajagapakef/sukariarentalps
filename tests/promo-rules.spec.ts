import { describe, expect, it } from "vitest";
import {
  bestOffering,
  bookingHref,
  canPublish,
  durationForPromo,
  duplicateItemKey,
  eligibleOfferings,
  isPublic,
  isWorthwhile,
  keepsEligibility,
  offeringLabel,
  promoIdFrom,
  savingOf,
  sortItems,
  type PromoContext,
  type PromoItem,
  type PromoOffering,
} from "@/lib/promo-rules";

const item = (facility_type_id: string, duration_minutes: number, price = 10000): PromoItem => ({
  facility_type_id,
  duration_minutes,
  price,
});

describe("promo visibility", () => {
  it("mirrors the public page, which reads only ACTIVE", () => {
    // getPromotions() filters status = 'ACTIVE'. Anything else is invisible to
    // customers, which is why a DRAFT promo looks like it does not exist.
    expect(isPublic("ACTIVE")).toBe(true);
    expect(isPublic("DRAFT")).toBe(false);
    expect(isPublic("ENDED")).toBe(false);
  });
});

describe("publish guard", () => {
  it("refuses to publish a promo with no prices", () => {
    // Otherwise /promo renders a card with a heading and an empty price list.
    expect(canPublish("ACTIVE", 0)).toBe(false);
    expect(canPublish("ACTIVE", 1)).toBe(true);
  });

  it("does not care about prices for a draft or an ended promo", () => {
    expect(canPublish("DRAFT", 0)).toBe(true);
    expect(canPublish("ENDED", 0)).toBe(true);
  });
});

describe("promotion id", () => {
  it("slugifies the name", () => {
    expect(promoIdFrom("Paket Mantai")).toBe("PROMO-PAKET-MANTAI");
  });

  it("strips punctuation and collapses separators", () => {
    expect(promoIdFrom("Promo  Libur!!  Nasional")).toBe("PROMO-PROMO-LIBUR-NASIONAL");
  });

  it("uniquifies against ids already taken", () => {
    const taken = new Set(["PROMO-PAKET-MANTAI", "PROMO-PAKET-MANTAI-2"]);
    expect(promoIdFrom("Paket Mantai", taken)).toBe("PROMO-PAKET-MANTAI-3");
  });

  it("still produces an id from a name with nothing sluggable", () => {
    expect(promoIdFrom("!!!")).toBe("PROMO");
    expect(promoIdFrom("", [])).toBe("PROMO");
  });
});

describe("item keys", () => {
  it("spots a row that would collide on the composite primary key", () => {
    // (promotion_id, facility_type_id, duration_minutes) is the primary key, so two
    // identical rows would fail the insert and lose the whole save.
    const items = [item("FAC-VIP", 120), item("FAC-REGULAR", 120), item("FAC-VIP", 120)];
    expect(duplicateItemKey(items)).toBe("FAC-VIP:120");
  });

  it("allows the same facility at different durations", () => {
    expect(duplicateItemKey([item("FAC-VIP", 120), item("FAC-VIP", 240)])).toBeNull();
  });

  it("allows the same duration on different facilities", () => {
    expect(duplicateItemKey([item("FAC-VIP", 120), item("FAC-VVIP", 120)])).toBeNull();
  });
});

describe("item order", () => {
  it("sorts by duration then facility so the saved list is stable", () => {
    const sorted = sortItems([item("FAC-VVIP", 120), item("FAC-VIP", 240), item("FAC-VIP", 120)]);
    expect(sorted.map((i) => `${i.facility_type_id}:${i.duration_minutes}`)).toEqual([
      "FAC-VIP:120",
      "FAC-VVIP:120",
      "FAC-VIP:240",
    ]);
  });

  it("does not mutate its input", () => {
    const input = [item("FAC-VIP", 240), item("FAC-VIP", 120)];
    sortItems(input);
    expect(input[0].duration_minutes).toBe(240);
  });
});

// -----------------------------------------------------------------------------
// The booking-side rules. These decide what the customer is shown, so a mistake here
// is a promise the server will not keep: create_booking() re-checks every one of them
// and refuses with 22023.
// -----------------------------------------------------------------------------

const offering = (over: Partial<PromoOffering> = {}): PromoOffering => ({
  promotion_id: "PROMO-A",
  name: "Paket Mantai",
  description: null,
  branch_id: "BR-B5",
  branch_name: "B5",
  facility_type_id: "FAC-CAPSULE",
  facility_name: "Capsule",
  duration_minutes: 120,
  promo_price: 10000,
  normal_price: 30000,
  bonus_snack_id: null,
  bonus_snack_name: null,
  bonus_quantity: 0,
  ...over,
});

const context = (over: Partial<PromoContext> = {}): PromoContext => ({
  branchId: "BR-B5",
  facilityTypeId: "FAC-CAPSULE",
  durationMinutes: 120,
  ...over,
});

describe("saving", () => {
  it("is the gap between the normal price and the promo price", () => {
    expect(savingOf(offering())).toBe(20000);
  });

  it("never reads as a negative saving", () => {
    // normal_price is 0 when the branch has no price rule for that facility type, which
    // is one of the reasons isWorthwhile exists.
    expect(savingOf(offering({ normal_price: 0, promo_price: 10000 }))).toBe(0);
  });

  it("calls a promo worthwhile only when it is genuinely cheaper", () => {
    expect(isWorthwhile(offering())).toBe(true);
    expect(isWorthwhile(offering({ promo_price: 30000 }))).toBe(false);
    // Cheaper than a Rp 0 "normal" price would mean the price rule is missing, not that
    // the customer saves Rp 10.000.
    expect(isWorthwhile(offering({ normal_price: 0 }))).toBe(false);
  });
});

describe("eligibility (R2/R3)", () => {
  const offers = [
    offering(),
    offering({ promotion_id: "PROMO-B", name: "Paket B", duration_minutes: 240, promo_price: 40000 }),
    offering({ promotion_id: "PROMO-C", name: "Paket C", facility_type_id: "FAC-VIP", facility_name: "VIP" }),
    offering({ promotion_id: "PROMO-D", name: "Paket D", branch_id: "BR-GANET" }),
  ];

  it("keeps only the exact branch, facility type and duration", () => {
    expect(eligibleOfferings(offers, context()).map((o) => o.promotion_id)).toEqual(["PROMO-A"]);
  });

  it("offers nothing before a room type is known", () => {
    // A promo is priced for one type of room, so with no unit picked there is no
    // context to match — not "all promos".
    expect(eligibleOfferings(offers, context({ facilityTypeId: null }))).toEqual([]);
  });

  it("offers nothing when the duration is not one of the promo's", () => {
    expect(eligibleOfferings(offers, context({ durationMinutes: 180 }))).toEqual([]);
  });

  it("excludes a promo that is not cheaper, rather than quoting it at no saving", () => {
    const dear = [offering({ promotion_id: "PROMO-DEAR", promo_price: 30000 })];
    expect(eligibleOfferings(dear, context())).toEqual([]);
  });

  it("puts the biggest saving first", () => {
    const two = [
      offering({ promotion_id: "SMALL", promo_price: 25000 }),
      offering({ promotion_id: "BIG", promo_price: 5000 }),
    ];
    expect(bestOffering(two, context())?.promotion_id).toBe("BIG");
  });

  it("reports no best offering when nothing matches", () => {
    expect(bestOffering(offers, context({ branchId: "BR-NOPE" }))).toBeNull();
  });
});

describe("deep link (R5)", () => {
  it("carries the promo, branch, type and duration so the form opens eligible", () => {
    // The point of the link: arrive at /booking already pinned to what the promo covers,
    // instead of a form that ignores what was clicked.
    expect(bookingHref(offering())).toBe(
      "/booking?promo=PROMO-A&branch=BR-B5&type=FAC-CAPSULE&duration=120",
    );
  });

  it("resolves the duration a promo pins, but only for the matching branch and type", () => {
    const offers = [offering()];
    expect(durationForPromo(offers, "PROMO-A", "BR-B5", "FAC-CAPSULE")).toBe(120);
    // A stale link — promo ended, or a hand-edited URL — resolves to nothing rather than
    // silently booking without the promo the customer came for.
    expect(durationForPromo(offers, "PROMO-A", "BR-GANET", "FAC-CAPSULE")).toBeNull();
    expect(durationForPromo(offers, "PROMO-A", "BR-B5", "FAC-VIP")).toBeNull();
    expect(durationForPromo(offers, "PROMO-GONE", "BR-B5", "FAC-CAPSULE")).toBeNull();
    expect(durationForPromo(offers, null, "BR-B5", "FAC-CAPSULE")).toBeNull();
  });
});

describe("dropping a promo that stops applying (R4)", () => {
  it("survives an unrelated change", () => {
    expect(keepsEligibility(offering(), context())).toBe(true);
  });

  it("is dropped when the duration moves off the package", () => {
    // A two-hour package cannot discount one hour. Keeping it would carry a discount
    // that does not exist, and the server would refuse the booking.
    expect(keepsEligibility(offering(), context({ durationMinutes: 60 }))).toBe(false);
  });

  it("is dropped when the room type changes", () => {
    expect(keepsEligibility(offering(), context({ facilityTypeId: "FAC-VIP" }))).toBe(false);
  });

  it("is dropped when the branch changes", () => {
    expect(keepsEligibility(offering(), context({ branchId: "BR-GANET" }))).toBe(false);
  });
});

describe("offering label", () => {
  it("names the promo, the room and the length", () => {
    const hours = (m: number) => `${m / 60} jam`;
    expect(offeringLabel(offering(), hours)).toBe("Paket Mantai — Capsule 2 jam");
  });
});