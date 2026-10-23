import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Promo application rules (migration 0029), against the real create_booking().
 *
 * These are the guarantees a customer depends on when a discount actually appears on
 * their ticket. All of them live inside the transaction on purpose: a promo has to be
 * re-checked at the moment of booking, not merely at the moment the page rendered, or a
 * client could send any promotion_id it liked and buy a PS5 session for less than the
 * shelf price.
 *
 * Every fixture is created by this suite (own facility type, unit, snack, promos) so the
 * real seeded promo is never touched, and prices are derived from calculate_price()
 * rather than hard-coded — the normal price for a duration is the one the booking will
 * charge, and a test that guessed it would pass for the wrong reason.
 */
describeDb("promo application", () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const branchId = "BR-GANET";
  const unitId = `P-UNIT-${suffix}`;
  const facilityId = `P-FAC-${suffix}`;
  const snackId = `P-SNK-${suffix}`;
  const promoId = `PROMO-TEST-${suffix}`;
  const draftPromoId = `PROMO-DRAFT-${suffix}`;
  const otherBranchPromoId = `PROMO-OTHERBRANCH-${suffix}`;
  const shortPromoId = `PROMO-SHORT-${suffix}`;
  const dearPromoId = `PROMO-DEAR-${suffix}`;
  const bonusPromoId = `PROMO-BONUS-${suffix}`;
  const phone = `0877${suffix}`;
  const startStock = 10;

  const duration = 120;
  let db: Client;
  let normalPrice: number;
  let promoPrice: number;

  const day = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const at = (time: string) => `${day} ${time}+07`;

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();

    await db.query(
      `insert into facility_types (facility_type_id, code, name, platform, category)
       values ($1, $2, 'Promo Test Facility', 'PS5', 'RENTAL')`,
      [facilityId, `PF-${suffix}`],
    );
    await db.query(
      `insert into units (unit_id, branch_id, facility_type_id, name)
       values ($1, $2, $3, 'Promo Test Unit')`,
      [unitId, branchId, facilityId],
    );
    await db.query(
      `insert into pricing_rules (pricing_id, branch_id, facility_type_id, pricing_type, duration_minutes, price)
       values ($1, $2, $3, 'PACKAGE', 120, 40000)`,
      [`PP-1-${suffix}`, branchId, facilityId],
    );
    await db.query(
      `insert into snacks (snack_id, name, category, price, stock, min_stock)
       values ($1, 'Promo Bonus Snack', 'SNACK', 12000, $2, 1)`,
      [snackId, startStock],
    );

    // What the engine will charge without a promo. Everything else is derived from it,
    // so "cheaper than normal" is tested against the real number and not a guess.
    const price = await db.query(`select public.calculate_price($1, $2, $3) as p`, [
      branchId,
      facilityId,
      duration,
    ]);
    normalPrice = Number(price.rows[0].p);
    promoPrice = normalPrice - 15000;

    const seedPromo = (id: string, status: string, branch: string, minutes: number, amount: number) =>
      db.query(
        `insert into promotions (promotion_id, branch_id, name, description, status)
         values ($1, $2, $3, 'Promo test fixture', $4)`,
        [id, branch, `Promo ${id}`, status],
      ).then(() =>
        db.query(
          `insert into promotion_items (promotion_id, facility_type_id, duration_minutes, price)
           values ($1, $2, $3, $4)`,
          [id, facilityId, minutes, amount],
        ),
      );

    await seedPromo(promoId, "ACTIVE", branchId, duration, promoPrice);
    await seedPromo(draftPromoId, "DRAFT", branchId, duration, promoPrice);
    await seedPromo(otherBranchPromoId, "ACTIVE", "BR-B5", duration, promoPrice);
    await seedPromo(shortPromoId, "ACTIVE", branchId, 60, promoPrice);
    // Same money as the normal price: create_booking must refuse rather than "discount"
    // by zero, which would record a promo that saves nothing.
    await seedPromo(dearPromoId, "ACTIVE", branchId, duration, normalPrice + 5000);

    await db.query(
      `insert into promotions (promotion_id, branch_id, name, description, status)
       values ($1, $2, 'Promo bonus', 'Promo test fixture', 'ACTIVE')`,
      [bonusPromoId, branchId],
    );
    await db.query(
      `insert into promotion_items (promotion_id, facility_type_id, duration_minutes, price, bonus_snack_id, bonus_quantity)
       values ($1, $2, $3, $4, $5, 2)`,
      [bonusPromoId, facilityId, duration, promoPrice, snackId],
    );
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`delete from inventory_movements where snack_id = $1`, [snackId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`,
      [unitId],
    );
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`delete from customers where phone = $1`, [phone]);
    await db.query(
      `delete from promotions where promotion_id = any($1::text[])`,
      [[promoId, draftPromoId, otherBranchPromoId, shortPromoId, dearPromoId, bonusPromoId]],
    );
    await db.query(`delete from pricing_rules where branch_id = $1 and facility_type_id = $2`, [
      branchId,
      facilityId,
    ]);
    await db.query(`delete from units where unit_id = $1`, [unitId]);
    await db.query(`delete from facility_types where facility_type_id = $1`, [facilityId]);
    await db.query(`delete from snacks where snack_id = $1`, [snackId]);
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`delete from inventory_movements where snack_id = $1`, [snackId]);
    await db.query(`delete from unit_reservations where unit_id = $1`, [unitId]);
    await db.query(
      `delete from booking_items where booking_id in (select booking_id from bookings where unit_id = $1)`,
      [unitId],
    );
    await db.query(`delete from bookings where unit_id = $1`, [unitId]);
    await db.query(`delete from unit_status_history where unit_id = $1`, [unitId]);
    await db.query(`update units set status = 'AVAILABLE', condition = 'GOOD' where unit_id = $1`, [unitId]);
    await db.query(`update snacks set stock = $2, active = true where snack_id = $1`, [snackId, startStock]);
  });

  /** create_booking with the promo argument in its 13th position. */
  async function book(promotion: string | null, start = "10:00", qty = 0) {
    const snacks = qty > 0 ? [{ snack_id: snackId, quantity: qty }] : [];
    const { rows } = await db.query(
      `select * from public.create_booking(
         $1, $2, 'Promo Tester', $3, $4::timestamptz, $5, null, null, $6::jsonb,
         'ONLINE', null, null, $7)`,
      [branchId, unitId, phone, at(start), duration, JSON.stringify(snacks), promotion],
    );
    return rows[0] as { booking_id: string; booking_code: string; total_amount: number };
  }

  const bookingRow = async (id: string) =>
    (
      await db.query(
        `select rental_amount, discount_amount, snack_amount, total_amount, promotion_id, notes
           from bookings where booking_id = $1`,
        [id],
      )
    ).rows[0] as {
      rental_amount: number;
      discount_amount: number;
      snack_amount: number;
      total_amount: number;
      promotion_id: string | null;
      notes: string | null;
    };

  const itemsOf = async (id: string) =>
    (
      await db.query(
        `select item_type, snack_id, description, quantity, unit_price, subtotal
           from booking_items where booking_id = $1 order by description`,
        [id],
      )
    ).rows as {
      item_type: string;
      snack_id: string | null;
      description: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
    }[];

  /** The rejection codes all read 22023, so the message is what distinguishes them. */
  async function expectRefusal(promotion: string) {
    const attempt = await book(promotion).catch((e: { code?: string; message: string }) => e);
    expect((attempt as { code?: string }).code).toBe("22023");
    return (attempt as { message: string }).message;
  }

  it("charges the promo price and records which promo paid", async () => {
    const created = await book(promoId);
    const row = await bookingRow(created.booking_id);

    // rental stays the normal price and the saving lands in discount_amount: revenue
    // reports keep describing what the session was worth, with the promo as the reason
    // it cost less.
    expect(row.rental_amount).toBe(normalPrice);
    expect(row.discount_amount).toBe(normalPrice - promoPrice);
    expect(row.total_amount).toBe(promoPrice);
    expect(row.promotion_id).toBe(promoId);
    expect(created.total_amount).toBe(promoPrice);
  });

  it("discounts the rental only, never the snacks", async () => {
    const created = await book(promoId, "10:00", 1);
    const row = await bookingRow(created.booking_id);

    expect(row.snack_amount).toBe(12000);
    expect(row.discount_amount).toBe(normalPrice - promoPrice);
    expect(row.total_amount).toBe(promoPrice + 12000);
  });

  it("leaves a booking without a promo exactly as it was", async () => {
    const created = await book(null);
    const row = await bookingRow(created.booking_id);

    expect(row.discount_amount).toBe(0);
    expect(row.promotion_id).toBeNull();
    expect(row.total_amount).toBe(normalPrice);
  });

  it("refuses a promo that is still a draft", async () => {
    const message = await expectRefusal(draftPromoId);
    expect(message).toContain("tidak aktif");
  });

  it("refuses a promo from another branch", async () => {
    // A promo is a package at one branch. BR-B5's promo must not price a BR-GANET unit,
    // or a customer could carry one branch's deal to a more expensive one.
    const message = await expectRefusal(otherBranchPromoId);
    expect(message).toContain("tidak aktif di cabang");
  });

  it("refuses a promo that does not cover this duration", async () => {
    // The item is for 60 minutes; this booking is 120. Snapping to a different length
    // has to happen in the form, not by pricing whatever the customer happens to pick.
    const message = await expectRefusal(shortPromoId);
    expect(message).toContain("tidak berlaku untuk tipe unit ini atau durasi");
  });

  it("refuses a promo that is not actually cheaper", async () => {
    // A price above the normal one is a pricing mistake. Accepting it would record a
    // promo on the ticket that saves nothing and may even charge more.
    const message = await expectRefusal(dearPromoId);
    expect(message).toContain("tidak lebih murah");
  });

  it("refuses an unknown promotion id", async () => {
    await expectRefusal("PROMO-DOES-NOT-EXIST");
  });

  it("gives the bonus snack free and takes it out of stock", async () => {
    const created = await book(bonusPromoId);
    const row = await bookingRow(created.booking_id);
    const items = await itemsOf(created.booking_id);

    const bonus = items.find((i) => i.description.includes("bonus promo"));
    expect(bonus).toBeDefined();
    expect(bonus!.item_type).toBe("SNACK");
    expect(bonus!.quantity).toBe(2);
    // Free, and free of the snack total too — the package price already covers it.
    expect(bonus!.unit_price).toBe(0);
    expect(bonus!.subtotal).toBe(0);
    expect(row.snack_amount).toBe(0);
    expect(row.total_amount).toBe(promoPrice);

    const stock = await db.query(`select stock from snacks where snack_id = $1`, [snackId]);
    expect(stock.rows[0].stock).toBe(startStock - 2);

    // The movement is what a cancellation reverses, so it has to be a real SALE.
    const movements = await db.query(
      `select movement_type, qty_delta from inventory_movements where snack_id = $1`,
      [snackId],
    );
    expect(movements.rows).toEqual([{ movement_type: "SALE", qty_delta: -2 }]);
  });

  it("keeps the discount when the bonus snack is out of stock", async () => {
    // A gift we cannot give must not cost the customer the discount. The bonus is
    // dropped, and the shortfall is written on the booking so staff see it on the ticket
    // instead of the customer discovering it at the counter.
    await db.query(`update snacks set stock = min_stock where snack_id = $1`, [snackId]);

    const created = await book(bonusPromoId);
    const row = await bookingRow(created.booking_id);
    const items = await itemsOf(created.booking_id);

    expect(row.discount_amount).toBe(normalPrice - promoPrice);
    expect(row.total_amount).toBe(promoPrice);
    expect(items.some((i) => i.description.includes("bonus promo"))).toBe(false);
    expect(row.notes).toContain("promo: bonus");
    expect(row.notes).toContain("Promo Bonus Snack");

    const stock = await db.query(`select stock from snacks where snack_id = $1`, [snackId]);
    expect(stock.rows[0].stock).toBe(1);
  });

  it("drops the bonus for an inactive snack the same way", async () => {
    await db.query(`update snacks set active = false where snack_id = $1`, [snackId]);

    const created = await book(bonusPromoId);
    const row = await bookingRow(created.booking_id);

    expect(row.discount_amount).toBe(normalPrice - promoPrice);
    expect(row.notes).toContain("promo: bonus");
  });

  it("offers only ACTIVE promos, with the price the booking will charge", async () => {
    const { rows } = await db.query(`select * from public.promo_offerings()`);
    const mine = rows.filter(
      (r) =>
        r.promotion_id === promoId ||
        r.promotion_id === draftPromoId ||
        r.promotion_id === otherBranchPromoId ||
        r.promotion_id === bonusPromoId,
    );

    // The draft is invisible, so the admin cannot advertise a deal that create_booking
    // would refuse.
    expect(mine.map((r) => r.promotion_id).sort()).toEqual(
      [bonusPromoId, otherBranchPromoId, promoId].sort(),
    );

    // normal_price comes from calculate_price, so it can legitimately be 0: the
    // other-branch promo names a facility type that has no price rule at its branch.
    // The two offers at this branch must quote the price the booking will charge.
    for (const r of mine.filter((x) => x.promotion_id !== otherBranchPromoId)) {
      expect(Number(r.normal_price)).toBe(normalPrice);
      expect(Number(r.promo_price)).toBeLessThan(normalPrice);
    }

    const withBonus = mine.find((r) => r.promotion_id === bonusPromoId);
    expect(withBonus.bonus_snack_name).toBe("Promo Bonus Snack");
    expect(Number(withBonus.bonus_quantity)).toBe(2);
  });
});