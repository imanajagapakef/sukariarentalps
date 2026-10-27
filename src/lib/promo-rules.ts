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

/** Human wording for each status, so the admin UI never shows a bare enum. */
export const STATUS_META: Record<PromoStatus, { label: string; hint: string }> = {
  DRAFT: { label: "Draf", hint: "Tersimpan di sini, belum terlihat pelanggan." },
  ACTIVE: { label: "Tayang", hint: "Tampil di /promo dan bisa dipakai saat booking." },
  ENDED: { label: "Berakhir", hint: "Diarsipkan. Tidak tampil, tapi harganya tetap tersimpan." },
};

/** Quick-pick durations for the editor chips (minutes). */
export const DURATION_PRESETS = [60, 120, 180, 240, 300] as const;

/** Upper bound for the free snack quantity on one package. */
export const MAX_BONUS_QUANTITY = 20;

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
// Admin editor rules: per-row validation, dirty tracking, formatting, preview.
// ---------------------------------------------------------------------------

export type ItemIssue = {
  index: number;
  field: "facility" | "duration" | "price" | "bonus" | "duplicate";
  severity: "error" | "warning";
  message: string;
};

/**
 * Row-level validation, so the editor can point at the exact row that is wrong
 * instead of one generic error at the top. Errors block the save; warnings do not
 * (a Rp 0 package is legal, just usually a typo).
 */
export function validateItems(items: readonly PromoItem[]): ItemIssue[] {
  const issues: ItemIssue[] = [];
  const firstSeen = new Map<string, number>();

  items.forEach((item, index) => {
    if (!item.facility_type_id) {
      issues.push({ index, field: "facility", severity: "error", message: "Pilih fasilitas dulu." });
    }
    if (!Number.isInteger(item.duration_minutes) || item.duration_minutes <= 0) {
      issues.push({ index, field: "duration", severity: "error", message: "Durasi harus bilangan bulat > 0 menit." });
    }
    if (!Number.isFinite(item.price) || item.price < 0) {
      issues.push({ index, field: "price", severity: "error", message: "Harga tidak boleh negatif." });
    } else if (item.price === 0) {
      issues.push({ index, field: "price", severity: "warning", message: "Harga Rp 0 — sengaja gratis?" });
    }
    if (item.bonus_snack_id) {
      const q = item.bonus_quantity ?? 0;
      if (!Number.isInteger(q) || q < 1 || q > MAX_BONUS_QUANTITY) {
        issues.push({
          index,
          field: "bonus",
          severity: "error",
          message: `Jumlah bonus 1–${MAX_BONUS_QUANTITY} pcs.`,
        });
      }
    }

    if (item.facility_type_id && item.duration_minutes > 0) {
      const key = `${item.facility_type_id}:${item.duration_minutes}`;
      const first = firstSeen.get(key);
      if (first === undefined) {
        firstSeen.set(key, index);
      } else {
        issues.push({
          index,
          field: "duplicate",
          severity: "error",
          message: `Sama dengan baris ${first + 1} (fasilitas + durasi kembar).`,
        });
      }
    }
  });

  return issues;
}

/**
 * The single answer to "may this form be submitted?", with the reason when not,
 * so the button and the message can never disagree.
 */
export function submitBlocker(args: {
  name: string;
  branchId: string;
  status: string;
  items: readonly PromoItem[];
}): string | null {
  if (!args.name.trim()) return "Isi nama promo dulu.";
  if (!args.branchId) return "Pilih cabang tempat promo berlaku.";
  if (!canPublish(args.status, args.items.length)) {
    return "Promo tidak bisa ditayangkan tanpa minimal satu item harga.";
  }
  const firstError = validateItems(args.items).find((i) => i.severity === "error");
  if (firstError) return `Baris ${firstError.index + 1}: ${firstError.message}`;
  return null;
}

/** Cleans rows into what the API should receive: bonus fields consistent, order stable. */
export function normalizeItems(items: readonly PromoItem[]): PromoItem[] {
  return sortItems(
    items.map((item) => {
      const hasBonus = Boolean(item.bonus_snack_id);
      return {
        facility_type_id: item.facility_type_id,
        duration_minutes: item.duration_minutes,
        price: item.price,
        bonus_snack_id: hasBonus ? item.bonus_snack_id! : null,
        bonus_quantity: hasBonus ? Math.max(1, item.bonus_quantity ?? 1) : 0,
      };
    }),
  );
}

/** Stable fingerprint of the editable fields; two equal strings mean "nothing changed". */
export function promoSignature(fields: {
  name: string;
  branchId: string;
  description: string;
  sourceDate: string;
  status: string;
  items: readonly PromoItem[];
}): string {
  return JSON.stringify({
    n: fields.name.trim(),
    b: fields.branchId,
    d: fields.description.trim(),
    s: fields.sourceDate,
    t: fields.status,
    i: normalizeItems(fields.items),
  });
}

/**
 * First duration (stepping by an hour from `from`) not yet used for this facility,
 * so "add row" and "duplicate row" never create the key clash by themselves.
 */
export function nextFreeDuration(
  items: readonly PromoItem[],
  facilityTypeId: string,
  from: number = 60,
): number {
  const taken = new Set(items.filter((i) => i.facility_type_id === facilityTypeId).map((i) => i.duration_minutes));
  let d = Math.max(60, from);
  for (let guard = 0; guard < 200 && taken.has(d); guard++) d += 60;
  return d;
}

/** "Rp 50.000" — id-ID grouping, no decimals. */
export function formatRupiah(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `Rp ${new Intl.NumberFormat("id-ID").format(safe)}`;
}

/** 45 → "45 mnt", 60 → "1 jam", 90 → "1 jam 30 mnt". */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} mnt`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} jam` : `${h} jam ${m} mnt`;
}

/** Cheapest and priciest valid row, or null when there is nothing quotable. */
export function priceRange(items: readonly PromoItem[]): { min: number; max: number } | null {
  const prices = items.filter((i) => i.facility_type_id && i.price >= 0).map((i) => i.price);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** The "Mulai dari Rp X" line a promo card leads with, or null with no rows. */
export function headlinePrice(items: readonly PromoItem[]): string | null {
  const range = priceRange(items);
  if (!range) return null;
  return range.min === range.max ? formatRupiah(range.min) : `Mulai ${formatRupiah(range.min)}`;
}

/** Number of rows that carry a free snack. */
export function bonusCount(items: readonly PromoItem[]): number {
  return items.filter((i) => i.bonus_snack_id).length;
}

/**
 * Where a promo stands, for the dashboard cards and the card badge:
 *  live  → customers can see it
 *  ready → draft with prices, one decision away from going live
 *  empty → draft with no prices yet
 *  ended → archived
 */
export type PromoReadiness = "live" | "ready" | "empty" | "ended";
export function promoReadiness(status: string, itemCount: number): PromoReadiness {
  if (status === "ACTIVE") return "live";
  if (status === "ENDED") return "ended";
  return itemCount > 0 ? "ready" : "empty";
}

/** Admin list order: live first, then drafts, then archived; A–Z inside each group. */
export function sortPromos<T extends { status: string; name: string }>(promos: readonly T[]): T[] {
  const rank = (s: string) => (s === "ACTIVE" ? 0 : s === "DRAFT" ? 1 : 2);
  return [...promos].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name));
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

/** Whole-number "hemat 25%" figure; 0 when there is no saving or no normal price. */
export function discountPercent(offering: PromoOffering): number {
  if (offering.normal_price <= 0) return 0;
  return Math.round((savingOf(offering) / offering.normal_price) * 100);
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