import { z } from "zod";

export const snackSchema = z.object({
  snack_id: z.string().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(50),
  price: z.number().int().min(0),
  stock: z.number().int().min(0),
  min_stock: z.number().int().min(0),
  active: z.boolean().optional(),
  // Not a column — the admin PATCH turns it into an ADJUSTMENT movement on
  // inventory_movements, which is what actually moves `stock`. Declared here
  // because zod strips unknown keys, so without it the reason is silently dropped.
  stock_reason: z.string().trim().max(200).optional(),
  // Nullable so the uploader can clear an image; zod strips unknown keys, so
  // this must be declared or the PATCH would silently drop the column.
  image_url: z.string().trim().max(600).nullable().optional(),
});

export const gameSchema = z.object({
  game_id: z.string().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(150),
  short_description: z.string().trim().max(300).optional().nullable(),
  developer: z.string().trim().max(100).optional().nullable(),
  publisher: z.string().trim().max(100).optional().nullable(),
  // The column is a real date, so accept only a full ISO day or null — an empty
  // string or a partial "2024" would be rejected by Postgres anyway, and a loud
  // 400 beats a 500 from a bad cast.
  release_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "tanggal harus format YYYY-MM-DD")
    .nullable()
    .optional(),
  age_rating: z.string().trim().max(10).optional().nullable(),
  active: z.boolean().optional(),
  image_url: z.string().trim().max(600).nullable().optional(),
});

/**
 * Branch photos (migration 0026) live in their own table, so they get their own
 * verbs rather than going through adminCrud: attaching one has to append to the end
 * of the gallery, and "jadikan utama" has to move a photo to the front without
 * renumbering the rest.
 *
 * `image_url` is required on create and absent from the patch — a gallery row is
 * deleted, never blanked, so there is no empty-string state to normalise here.
 */
export const branchPhotoSchema = z.object({
  branch_id: z.string().trim().min(1).max(20),
  image_url: z.string().trim().min(1).max(600),
  caption: z.string().trim().max(140).nullable().optional(),
});

export const branchPhotoPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  caption: z.string().trim().max(140).nullable().optional(),
  /** Moves the photo to the front of its branch, which makes it the hero. */
  make_primary: z.boolean().optional(),
});

/**
 * Promotions, master data alongside games and pricing.
 *
 * `promotion_id` is a text primary key and staff should not be asked to invent one:
 * the route slugifies the name. These schemas cover only what a human types.
 *
 * `items` is optional, and when present it replaces the promo's whole item set in one
 * transaction. Replacing rather than merging is deliberate — a diff would have to
 * decide what an omitted row means, and "save the table exactly as shown" is the only
 * reading a staff member can hold in their head.
 */
export const promoItemSchema = z
  .object({
    facility_type_id: z.string().trim().min(1).max(40),
    duration_minutes: z.coerce.number().int().positive().max(1440),
    price: z.coerce.number().int().min(0),
    /**
     * R7: an optional free snack. The database enforces the same shape
     * (promotion_items_bonus_shape), but catching it here names the offending item
     * instead of failing the whole save on a constraint.
     */
    bonus_snack_id: z.string().trim().min(1).max(40).nullish(),
    bonus_quantity: z.coerce.number().int().min(0).max(20).default(0),
  })
  .refine((i) => (i.bonus_quantity > 0) === Boolean(i.bonus_snack_id), {
    message: "bonus_quantity hanya boleh > 0 kalau bonus_snack_id dipilih",
    path: ["bonus_snack_id"],
  });

export const promoSchema = z.object({
  name: z.string().trim().min(1).max(100),
  branch_id: z.string().trim().min(1).max(20),
  description: z.string().trim().max(500).nullable().optional(),
  source_date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "tanggal harus format YYYY-MM-DD")
    .nullable()
    .optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ENDED"]).optional(),
  items: z.array(promoItemSchema).max(60).optional(),
});

/** promotion_id is required here — the patch targets an existing row, it does not
 *  create one, and the id has to survive validation or there is nothing to update. */
export const promoPatchSchema = promoSchema.partial().extend({
  promotion_id: z.string().trim().min(1).max(40),
});

/**
 * Units are never created or deleted from the admin UI — the catalogue is
 * seeded, and staff only change status (via /api/admin/units/status) and
 * presentation. So only the PATCH verb is exported for this table.
 */
export const unitSchema = z.object({
  unit_id: z.string().min(1).max(20).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  image_url: z.string().trim().max(600).nullable().optional(),
});

export const pricingSchema = z.object({
  pricing_id: z.string().min(1).max(20).optional(),
  branch_id: z.string().min(1),
  facility_type_id: z.string().min(1),
  pricing_type: z.enum(["HOURLY", "PACKAGE"]),
  duration_minutes: z.number().int().positive(),
  price: z.number().int().min(0),
  active: z.boolean().optional(),
});

export const bookingConfigSchema = z.object({
  minimum_duration_minutes: z.number().int().min(60).max(180),
  maximum_duration_minutes: z.number().int().min(60).max(1440),
  booking_interval_minutes: z.number().int().min(60).max(120),
  cleaning_duration_minutes: z.number().int().min(0).max(60),
  payment_deadline_minutes: z.number().int().min(5).max(120),
  advance_booking_days: z.number().int().min(1).max(365),
  late_tolerance_minutes: z.number().int().min(0).max(120),
});

export const unitStatusSchema = z.object({
  unit_id: z.string().min(1),
  status: z.enum(["MAINTENANCE", "OFFLINE", "AVAILABLE"]),
  reason: z.string().trim().max(200).optional(),
});

const walkInBase = z.object({
  branch_id: z.string().min(1),
  unit_id: z.string().min(1),
  customer_name: z.string().trim().min(2).max(80),
  customer_phone: z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, "Nomor WhatsApp tidak valid"),
  start_at: z.string().datetime({ offset: true }).optional(),
  duration_minutes: z.number().int().min(15).max(1440),
  /**
   * Promo to charge at the counter (migration 0029). Optional, and validated by
   * create_booking() rather than here: the same rules apply at the counter as online,
   * so a duplicate copy of them in this schema could only drift out of step.
   */
  promotion_id: z.string().trim().min(1).max(40).optional(),
  pay_method: z.enum(["CASH", "QRIS_MANUAL", "TRANSFER_MANUAL"]),
  game_id: z.string().min(1).optional(),
  snacks: z.array(z.object({ snack_id: z.string().min(1), quantity: z.number().int().positive().max(20) })).max(20).default([]),
  notes: z.string().max(500).optional(),
});

export const walkInSchema = walkInBase;

export const refundSchema = z.object({
  booking_code: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(200),
});

export const staffCreateSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(12).max(100),
    full_name: z.string().trim().min(2).max(80),
    // Defaults to STAFF so the refinement fires even if the field is omitted —
    // every new account without an explicit role is a branch-bound one.
    role: z.enum(["STAFF", "ADMIN"]).default("STAFF"),
    branch_id: z.string().trim().min(1).max(20).optional(),
  })
  .refine((d) => d.role !== "STAFF" || Boolean(d.branch_id), {
    message: "Pilih cabang untuk akun STAFF",
    path: ["branch_id"],
  });

export const staffPatchSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["STAFF", "ADMIN"]).optional(),
  active: z.boolean().optional(),
  // Branch moves are OWNER-only (the route 403s any ADMIN attempt). Deliberately
  // not `.nullable()`: an unbound STAFF cannot pass branch checks, so unbinding
  // would silently lock the account out of every operation.
  branch_id: z.string().trim().min(1).max(20).optional(),
});

export const bookingActionSchema = z.object({
  action: z.enum(["confirm", "check_in", "complete", "cancel", "no_show", "mark_ready"]),
  reason: z.string().trim().max(200).optional(),
});

/**
 * Game requests (migration 0002, `request_status`).
 *
 * Staff triage the public wishlist from /admin/games: mark one under review while
 * it is being sourced, or APPROVED/ADDED once it is in — those leave the public
 * top-list automatically. REJECTED keeps the row so the same title cannot be
 * re-requested into a duplicate (`game_requests_name_uniq`).
 */
export const gameRequestStatusSchema = z.enum([
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "ADDED",
]);

export const gameRequestPatchSchema = z.object({
  request_id: z.string().trim().min(1).max(40),
  status: gameRequestStatusSchema.optional(),
});
