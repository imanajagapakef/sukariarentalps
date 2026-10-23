/**
 * Pure helpers for promotions (admin surface for the public /promo page).
 *
 * Import-free so a node test can exercise the rules below without loading the
 * Supabase client that catalog.ts pulls in at module scope — same reason
 * branch-availability.ts exists.
 */

/** Mirrors the promotion_status enum from migration 0001. */
export const PROMO_STATUSES = ["DRAFT", "ACTIVE", "ENDED"] as const;
export type PromoStatus = (typeof PROMO_STATUSES)[number];

export type PromoItem = {
  facility_type_id: string;
  duration_minutes: number;
  price: number;
  /** R7: an optional free snack that rides along with the package. */
  bonus_snack_id?: string | null;
  bonus_quantity?: number;
};

/**
 * The only status the public page shows.
 *
 * getPromotions() filters on exactly this value, so it is duplicated here purely so
 * the admin UI can say "this one is not on the site yet" instead of leaving staff to
 * wonder why a promo they can see is invisible to customers.
 */
export function isPublic(status: string): boolean {
  return status === "ACTIVE";
}

/**
 * Whether a promo may go live.
 *
 * A promo with no items renders on /promo as a card with a heading and an empty
 * price list — worse than not showing it, because it advertises a deal it cannot
 * quote. Refusing the transition is clearer than shipping that.
 *
 * Takes a count rather than the rows, because the caller often only knows the number:
 * a save that changes nothing but the status has to ask the database, and fabricating
 * placeholder rows to satisfy an array parameter is how the check ends up lying.
 */
export function canPublish(status: string, itemCount: number): boolean {
  return status !== "ACTIVE" || itemCount > 0;
}

/**
 * Slug for a new promotion_id, uniquified against the ids already taken.
 *
 * promotion_id is a text primary key, and asking staff to type one is how you get
 * PROMO1, PROMO2, PROMO3 forever. A name-derived slug keeps the table readable.
 */
export function promoIdFrom(name: string, taken: Iterable<string> = []): string {
  const used = taken instanceof Set ? taken : new Set(taken);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  // An all-punctuation or non-latin name still has to produce a usable id.
  const base = slug ? `PROMO-${slug.toUpperCase()}` : "PROMO";
  if (!used.has(base)) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // Unreachable in practice; better a loud wrong id than an infinite loop.
  return `${base}-${used.size}`;
}

/**
 * Deduplicates items against promotion_items' composite primary key
 * (promotion_id, facility_type_id, duration_minutes). Two identical rows would make
 * the INSERT fail on the constraint and lose the whole save, so the collision is
 * resolved here with a clear message instead.
 */
export function duplicateItemKey(items: readonly PromoItem[]): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    const key = `${item.facility_type_id}:${item.duration_minutes}`;
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/** Sorts items by duration then facility, so the saved order is stable. */
export function sortItems<T extends PromoItem>(items: readonly T[]): T[] {
  return [...items].sort(
    (a, b) => a.duration_minutes - b.duration_minutes || a.facility_type_id.localeCompare(b.facility_type_id),
  );
}

// ---------------------------------------------------------------------------
// The booking-side rules (migration 0029, R1-R8).
//
// Everything the customer sees about a promo — is it eligible, what does it save,
// where does the button take me — is decided here, in pure functions over what
// promo_offerings() returned. The form never invents a discount and the booking
// re-checks all of it server-side; this layer exists so both agree on what they say.
// ---------------------------------------------------------------------------

/** One bookable package: a promo item plus the normal price it is measured against. */
export type PromoOffering = {
  promotion_id: string;
  name: string;
  description: string | null;
  branch_id: string;
  /** Display name of the branch the promo runs at; null when the row is gone. */
  branch_name: string | null;
  facility_type_id: string;
  facility_name: string;
  duration_minutes: number;
  promo_price: number;
  normal_price: number;
  bonus_snack_id: string | null;
  bonus_snack_name: string | null;
  bonus_quantity: number;
};

/** What the customer has chosen so far. `facilityTypeId` is null before a unit is picked. */
export type PromoContext = {
  branchId: string;
  facilityTypeId: string | null;
  durationMinutes: number;
};

/** R3: what the promo actually saves. Never negative — a worse "deal" saves nothing. */
export function savingOf(offering: PromoOffering): number {
  return Math.max(0, offering.normal_price - offering.promo_price);
}

/** R3: a promo that is not cheaper is a pricing mistake, and create_booking rejects it. */
export function isWorthwhile(offering: PromoOffering): boolean {
  return offering.promo_price < offering.normal_price;
}

/**
 * R2: promos that apply to this exact context.
 *
 * Branch, facility type and duration all have to match, and the promo has to be
 * cheaper than the normal price — otherwise the customer is shown something the
 * booking will refuse. A null facility type (no unit picked yet) matches nothing:
 * a promo is a package for a specific room type, not a site-wide voucher.
 */
export function eligibleOfferings(
  offerings: readonly PromoOffering[],
  context: PromoContext,
): PromoOffering[] {
  if (!context.facilityTypeId) return [];
  return offerings
    .filter(
      (o) =>
        o.branch_id === context.branchId &&
        o.facility_type_id === context.facilityTypeId &&
        o.duration_minutes === context.durationMinutes &&
        isWorthwhile(o),
    )
    .sort((a, b) => savingOf(b) - savingOf(a) || a.name.localeCompare(b.name));
}

/** The biggest saving available for this context, or null. */
export function bestOffering(
  offerings: readonly PromoOffering[],
  context: PromoContext,
): PromoOffering | null {
  return eligibleOfferings(offerings, context)[0] ?? null;
}

/**
 * R5: the deep link. Clicking a promo on /promo has to land on a booking that is
 * already eligible for it — same branch, same facility type, duration snapped to the
 * package — or the customer arrives to a form that silently ignores what they picked.
 */
export function bookingHref(offering: PromoOffering): string {
  const params = new URLSearchParams({
    promo: offering.promotion_id,
    branch: offering.branch_id,
    type: offering.facility_type_id,
    duration: String(offering.duration_minutes),
  });
  return `/booking?${params.toString()}`;
}

/**
 * R4: the duration a promo pins, for when the customer arrives from /promo.
 *
 * Only returns it when the promo really does cover the branch and facility type in
 * the URL — a stale link (promo ended, wrong branch) resolves to null and the form
 * simply starts without one, instead of pretending the promo is available.
 */
export function durationForPromo(
  offerings: readonly PromoOffering[],
  promotionId: string | null | undefined,
  branchId: string,
  facilityTypeId: string | null,
): number | null {
  if (!promotionId || !facilityTypeId) return null;
  const match = offerings.find(
    (o) =>
      o.promotion_id === promotionId &&
      o.branch_id === branchId &&
      o.facility_type_id === facilityTypeId,
  );
  return match?.duration_minutes ?? null;
}

/**
 * R4: does a chosen promo survive a change to the context?
 *
 * The form calls this whenever the customer touches branch, unit or duration: a promo
 * for two hours of Capsule must drop itself when they switch to one hour or to a PS5,
 * instead of carrying a discount that no longer exists.
 */
export function keepsEligibility(offering: PromoOffering, context: PromoContext): boolean {
  return (
    offering.branch_id === context.branchId &&
    offering.facility_type_id === context.facilityTypeId &&
    offering.duration_minutes === context.durationMinutes &&
    isWorthwhile(offering)
  );
}

/** "Capsule · 2 jam" — the label a promo option needs in a dropdown. */
export function offeringLabel(offering: PromoOffering, formatHours: (minutes: number) => string): string {
  return `${offering.name} — ${offering.facility_name} ${formatHours(offering.duration_minutes)}`;
}