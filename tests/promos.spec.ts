import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createPromo, PATCH as patchPromo, DELETE as deletePromo } from "@/app/api/admin/promos/route";
import { callRoute, canAuthenticate, signInAsOwner } from "./admin-harness";
import { createAdminClient } from "@/lib/supabase/admin";

const describeLive = canAuthenticate ? describe : describe.skip;

/**
 * Promotions route.
 *
 * Real handler, real session, real database. The guarantees worth testing are the ones
 * a customer can see: that a price row deleted in the admin actually leaves the site,
 * that a promo cannot go live advertising nothing, and that two identical price rows
 * fail loudly instead of silently half-saving.
 *
 * The seeded PROMO-MANTAI-GANET is never touched — it is the one real promo, and its
 * DRAFT status is a business decision, not something a test should flip.
 */
describeLive("promos route", () => {
  let db: ReturnType<typeof createAdminClient>;
  const created: string[] = [];

  beforeAll(async () => {
    await signInAsOwner();
    db = createAdminClient();
  });

  afterAll(async () => {
    if (!db || created.length === 0) return;
    await db.from("promotions").delete().in("promotion_id", created);
    // Audit rows outlive the promo they describe, and an id filter would miss the ones
    // for a promo this suite already deleted — that id was spliced out of `created`.
    // So the criterion is "no longer a promo at all", which covers every case.
    await db
      .from("audit_logs")
      .delete()
      .eq("entity_type", "promotions")
      .not("entity_id", "in", "(select promotion_id from promotions)");
  });

  async function create(body: Record<string, unknown>) {
    const result = await callRoute(createPromo, undefined as never, { method: "POST", body });
    const id = (result.body as { promo?: { promotion_id: string } })?.promo?.promotion_id;
    if (id) created.push(id);
    return { result, id };
  }

  const validItems = [
    { facility_type_id: "FAC-VIP", duration_minutes: 120, price: 55000 },
    { facility_type_id: "FAC-VIP", duration_minutes: 240, price: 100000 },
  ];

  it("creates a promo with a generated id and its price rows", async () => {
    const { result, id } = await create({
      name: "Promo Uji Coba",
      branch_id: "BR-GANET",
      status: "DRAFT",
      items: validItems,
    });

    expect(result.status).toBe(201);
    expect(id).toBe("PROMO-PROMO-UJI-COBA");

    const promo = (result.body as { promo: { promotion_items: unknown[] } }).promo;
    expect(promo.promotion_items).toHaveLength(2);
  });

  it("replaces the whole price list on save, so a deleted row leaves the site", async () => {
    const { id } = await create({
      name: "Promo Ganti Harga",
      branch_id: "BR-GANET",
      items: validItems,
    });
    expect(id).toBeTruthy();
    if (!id) return;

    const result = await callRoute(patchPromo, undefined as never, {
      method: "PATCH",
      // Only the 120-minute row survives; the 240 one was struck off in the admin UI.
      body: { promotion_id: id, items: [validItems[0]] },
    });
    expect(result.status).toBe(200);

    const { data } = await db
      .from("promotion_items")
      .select("duration_minutes, price")
      .eq("promotion_id", id);
    expect(data).toHaveLength(1);
    expect(data![0].duration_minutes).toBe(120);
  });

  it("updates a price in place instead of duplicating the row", async () => {
    const { id } = await create({ name: "Promo Ubah Harga", branch_id: "BR-GANET", items: validItems });
    expect(id).toBeTruthy();
    if (!id) return;

    const result = await callRoute(patchPromo, undefined as never, {
      method: "PATCH",
      body: {
        promotion_id: id,
        items: [{ ...validItems[0], price: 49000 }, validItems[1]],
      },
    });
    expect(result.status).toBe(200);

    const { data } = await db
      .from("promotion_items")
      .select("price")
      .eq("promotion_id", id)
      .eq("duration_minutes", 120)
      .single();
    expect(data!.price).toBe(49000);
  });

  it("refuses to publish a promo with no prices", async () => {
    const { id } = await create({ name: "Promo Kosong", branch_id: "BR-GANET", items: [] });
    expect(id).toBeTruthy();
    if (!id) return;

    const result = await callRoute(patchPromo, undefined as never, {
      method: "PATCH",
      body: { promotion_id: id, status: "ACTIVE" },
    });
    // An empty promo renders on /promo as a heading with no prices, which advertises
    // a deal nobody can buy.
    expect(result.status).toBe(400);
  });

  it("allows publishing once there is at least one price", async () => {
    const { id } = await create({ name: "Promo Siap Tayang", branch_id: "BR-GANET", items: [validItems[0]] });
    expect(id).toBeTruthy();
    if (!id) return;

    const result = await callRoute(patchPromo, undefined as never, {
      method: "PATCH",
      body: { promotion_id: id, status: "ACTIVE" },
    });
    expect(result.status).toBe(200);
    expect((result.body as { promo: { status: string } }).promo.status).toBe("ACTIVE");
  });

  it("rejects two price rows with the same facility and duration", async () => {
    // (promotion_id, facility_type_id, duration_minutes) is the primary key, so this
    // would otherwise fail the insert and lose the whole save.
    const { result } = await create({
      name: "Promo Kembar",
      branch_id: "BR-GANET",
      items: [validItems[0], validItems[0]],
    });
    expect(result.status).toBe(400);
  });

  it("saves the bonus snack and gives it back on read", async () => {
    // R7: the perk has to survive the round trip, or the picker in the editor would
    // silently drop a gift every time a price was retyped.
    const { data: snack } = await db
      .from("snacks")
      .select("snack_id, name")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!snack) return; // no active snack in this database

    const { result, id } = await create({
      name: "Promo Bonus Uji",
      branch_id: "BR-GANET",
      items: [{ ...validItems[0], bonus_snack_id: snack.snack_id, bonus_quantity: 2 }],
    });
    expect(result.status).toBe(201);
    if (!id) return;

    const saved = (result.body as { promo: { promotion_items: { bonus_snack_id: string; bonus_quantity: number }[] } })
      .promo.promotion_items;
    expect(saved[0].bonus_snack_id).toBe(snack.snack_id);
    expect(saved[0].bonus_quantity).toBe(2);

    const { data: stored } = await db
      .from("promotion_items")
      .select("bonus_snack_id, bonus_quantity")
      .eq("promotion_id", id)
      .single();
    expect(stored!.bonus_snack_id).toBe(snack.snack_id);
    expect(stored!.bonus_quantity).toBe(2);
  });

  it("drops the bonus when the item is saved again without one", async () => {
    // The editor replaces the whole item set, so an unticked bonus box must actually
    // clear the column — otherwise removing the gift needs a database edit.
    const { data: snack } = await db
      .from("snacks")
      .select("snack_id")
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (!snack) return;

    const { id } = await create({
      name: "Promo Bonus Ditolak",
      branch_id: "BR-GANET",
      items: [{ ...validItems[0], bonus_snack_id: snack.snack_id, bonus_quantity: 1 }],
    });
    if (!id) return;

    const result = await callRoute(patchPromo, undefined as never, {
      method: "PATCH",
      body: { promotion_id: id, items: [validItems[0]] },
    });
    expect(result.status).toBe(200);

    const { data: stored } = await db
      .from("promotion_items")
      .select("bonus_snack_id, bonus_quantity")
      .eq("promotion_id", id)
      .single();
    expect(stored!.bonus_snack_id).toBeNull();
    expect(stored!.bonus_quantity).toBe(0);
  });

  it("rejects a bonus quantity with no snack chosen", async () => {
    // promotion_items_bonus_shape enforces the same thing in the database; catching it
    // here names the item instead of failing the whole save on a constraint.
    const { result } = await create({
      name: "Promo Bonus Hantu",
      branch_id: "BR-GANET",
      items: [{ ...validItems[0], bonus_quantity: 3 }],
    });
    expect(result.status).toBe(400);
  });

  it("rejects an unknown branch", async () => {
    const { result } = await create({ name: "Promo Cabang Hantu", branch_id: "BR-NOPE", items: validItems });
    expect(result.status).toBe(404);
  });

  it("deletes the promo and its prices together", async () => {
    const { id } = await create({ name: "Promo Buang", branch_id: "BR-GANET", items: validItems });
    expect(id).toBeTruthy();
    if (!id) return;

    const result = await callRoute(deletePromo, undefined as never, {
      method: "DELETE",
      url: `http://localhost/api?id=${encodeURIComponent(id)}`,
    });
    expect(result.status).toBe(200);

    const { count: promoCount } = await db
      .from("promotions")
      .select("promotion_id", { count: "exact", head: true })
      .eq("promotion_id", id);
    const { count: itemCount } = await db
      .from("promotion_items")
      .select("promotion_id", { count: "exact", head: true })
      .eq("promotion_id", id);
    expect(promoCount).toBe(0);
    expect(itemCount).toBe(0);
    created.splice(created.indexOf(id), 1);
  });

  it("leaves the real promo exactly as it found it", async () => {
    const { data } = await db
      .from("promotions")
      .select("status")
      .eq("promotion_id", "PROMO-MANTAI-GANET")
      .single();
    // Publishing it is the owner's call; the suite must not make it.
    expect(data?.status).toBe("DRAFT");
  });
});