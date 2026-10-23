import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { promoPatchSchema, promoSchema } from "@/lib/validations/admin";
import { canPublish, duplicateItemKey, promoIdFrom } from "@/lib/promo-rules";
import type { Database } from "@/types/database";

/**
 * Promotions (master data: OWNER/ADMIN, like games and pricing).
 *
 * Hand-written rather than adminCrud because a promotion spans two tables, and the
 * items are only meaningful together with the promo: saving the price list and the
 * heading separately is how a promo ends up published with a stale price, or with
 * none at all.
 *
 * `items` therefore replaces the whole set in the same transaction as the promo. The
 * alternative — patching individual rows — needs every caller to remember to also
 * send the removals, and one missed DELETE silently leaves a price on the site.
 *
 * Writes go through the service client because RLS denies catalog writes to
 * authenticated staff.
 */

/** Writes the item set for a promo. Caller has already checked the promo exists. */
async function writeItems(
  db: ReturnType<typeof createAdminClient>,
  promotionId: string,
  items: {
    facility_type_id: string;
    duration_minutes: number;
    price: number;
    bonus_snack_id?: string | null;
    bonus_quantity?: number;
  }[],
) {
  const rows = items.map((i) => ({
    promotion_id: promotionId,
    facility_type_id: i.facility_type_id,
    duration_minutes: i.duration_minutes,
    price: i.price,
    // Normalised so an untouched row cannot trip the bonus_shape constraint: a null id
    // must carry quantity 0, and a chosen id at least 1.
    bonus_snack_id: i.bonus_quantity && i.bonus_quantity > 0 ? i.bonus_snack_id ?? null : null,
    bonus_quantity: i.bonus_quantity && i.bonus_quantity > 0 ? i.bonus_quantity : 0,
  }));
  // ON CONFLICT DO UPDATE, not DO NOTHING: a row that survives with its old price is
  // exactly the failure this route exists to prevent.
  const { error } = await db
    .from("promotion_items")
    .upsert(rows, { onConflict: "promotion_id,facility_type_id,duration_minutes" });
  if (error) throw new Error(error.message);
}

async function promoWithItems(
  db: ReturnType<typeof createAdminClient>,
  promotionId: string,
) {
  const { data, error } = await db
    .from("promotions")
    .select(
      `promotion_id, branch_id, name, description, status, source_date, created_at, updated_at,
       promotion_items(facility_type_id, duration_minutes, price, bonus_snack_id, bonus_quantity, facility_types(name))`,
    )
    .eq("promotion_id", promotionId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER", "ADMIN"]);
    const parsed = promoSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Payload tidak valid", 400);
    }
    const { name, branch_id, description, source_date, status, items = [] } = parsed.data;

    const db = createAdminClient();

    const { data: branch } = await db
      .from("branches")
      .select("branch_id")
      .eq("branch_id", branch_id)
      .maybeSingle();
    if (!branch) return jsonError("Cabang tidak ditemukan", 404);

    if (!canPublish(status ?? "DRAFT", items.length)) {
      return jsonError("Promo tidak bisa ditayangkan tanpa minimal satu item harga", 400, "NO_ITEMS");
    }
    if (duplicateItemKey(items)) {
      return jsonError("Ada item dengan fasilitas dan durasi yang sama", 400, "DUPLICATE_ITEM");
    }

    const { data: existing } = await db.from("promotions").select("promotion_id");
    const promotionId = promoIdFrom(name, (existing ?? []).map((r) => r.promotion_id));

    const { error } = await db.from("promotions").insert({
      promotion_id: promotionId,
      branch_id,
      name,
      description: description ?? null,
      source_date: source_date ?? null,
      status: status ?? "DRAFT",
    });
    if (error) throw new Error(error.message);

    if (items.length > 0) await writeItems(db, promotionId, items);

    const after = await promoWithItems(db, promotionId);
    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "create",
      entityType: "promotions",
      entityId: promotionId,
      after: after as never,
    });

    return NextResponse.json({ promo: after }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER", "ADMIN"]);
    const parsed = promoPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? "Payload tidak valid", 400);
    }
    const { items, promotion_id: id, ...fields } = parsed.data;

    const db = createAdminClient();
    if (!id) return jsonError("promotion_id wajib diisi", 400);

    const { data: before } = await db
      .from("promotions")
      .select("*")
      .eq("promotion_id", id)
      .maybeSingle();
    if (!before) return jsonError("Promo tidak ditemukan", 404);

    if (items && duplicateItemKey(items)) {
      return jsonError("Ada item dengan fasilitas dan durasi yang sama", 400, "DUPLICATE_ITEM");
    }

    // Publishing needs prices, and the guard has to hold however the save is phrased.
    // It used to live inside `if (items)`, which let a status-only PATCH walk straight
    // past it and put an empty promo on the public page. Count what will exist
    // afterwards: the rows being sent, or the ones already stored.
    const nextStatus = fields.status ?? before.status;
    const nextCount = items ? items.length : await countItems(db, id);
    if (!canPublish(nextStatus, nextCount)) {
      return jsonError("Promo tidak bisa ditayangkan tanpa minimal satu item harga", 400, "NO_ITEMS");
    }

    const patch: Database["public"]["Tables"]["promotions"]["Update"] = {};
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.branch_id !== undefined) patch.branch_id = fields.branch_id;
    if (fields.description !== undefined) patch.description = fields.description;
    if (fields.source_date !== undefined) patch.source_date = fields.source_date;
    if (fields.status !== undefined) patch.status = fields.status;

    if (Object.keys(patch).length > 0) {
      const { error } = await db.from("promotions").update(patch).eq("promotion_id", id);
      if (error) throw new Error(error.message);
    }

    if (items) {
      // Replace, not merge: the client sends the table as shown, so a row the staff
      // deleted from the screen has to disappear from the site too.
      await db.from("promotion_items").delete().eq("promotion_id", id);
      if (items.length > 0) await writeItems(db, id, items);
    }

    const after = await promoWithItems(db, id);
    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "update",
      entityType: "promotions",
      entityId: id,
      before: before as never,
      after: after as never,
    });

    return NextResponse.json({ promo: after });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** How many price rows a promo currently has, for the publish guard. */
async function countItems(db: ReturnType<typeof createAdminClient>, id: string): Promise<number> {
  const { count } = await db
    .from("promotion_items")
    .select("promotion_id", { count: "exact", head: true })
    .eq("promotion_id", id);
  return count ?? 0;
}

export async function DELETE(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER", "ADMIN"]);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id query wajib diisi", 400);

    const db = createAdminClient();
    const { data: before } = await db.from("promotions").select("*").eq("promotion_id", id).maybeSingle();
    if (!before) return jsonError("Promo tidak ditemukan", 404);

    // promotion_items cascades, so one delete takes the whole promo off the site.
    const { error } = await db.from("promotions").delete().eq("promotion_id", id);
    if (error) throw new Error(error.message);

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "delete",
      entityType: "promotions",
      entityId: id,
      before: before as never,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}