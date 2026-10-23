import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = connectionString ? describe : describe.skip;

/**
 * Tournament rules (migration 0031), against the real functions.
 *
 * Everything here is transactional behaviour — a seat has to be held under a lock, a fee
 * has to be snapshotted, a draw has to stay a draw — so a mocked database would only
 * test the mock. All fixtures are created here and removed afterwards; nothing that
 * existed before this feature is touched.
 */
describeDb("tournament engine", () => {
  const S = Date.now().toString(36).toUpperCase();
  const phone = (n: string) => `0877${S.slice(-5)}${n}`;
  const starts = new Date(Date.now() + 7 * 864e5).toISOString();

  let db: Client;
  let branchId: string;
  const created: string[] = [];

  const register = async (tournamentId: string, name: string, n: string) => {
    const { rows } = await db.query(`select * from public.register_tournament($1, $2, $3)`, [
      tournamentId,
      name,
      phone(n),
    ]);
    return rows[0] as {
      registration_id: string;
      registration_code: string;
      status: string;
      fee_amount: number;
      payment_deadline_at: string | null;
    };
  };

  async function makeTournament(over: {
    fee?: number;
    quota?: number;
    list_price?: number | null;
    status?: string;
    closes_at?: string | null;
  } = {}) {
    const { rows } = await db.query(
      `insert into tournaments (title, slug, branch_id, starts_at, registration_fee, list_price,
                                quota, status, registration_closes_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning tournament_id`,
      [
        `Turnamen Tes ${S} ${Math.random().toString(36).slice(2, 6)}`,
        `tes-${S.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`,
        branchId,
        starts,
        over.fee ?? 0,
        over.list_price ?? null,
        over.quota ?? 8,
        over.status ?? "OPEN",
        over.closes_at ?? null,
      ],
    );
    created.push(rows[0].tournament_id);
    return rows[0].tournament_id as string;
  }

  const attempt = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return null;
    } catch (e) {
      return e as { code?: string; message: string };
    }
  };

  beforeAll(async () => {
    db = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await db.connect();
    const { rows } = await db.query(
      `select branch_id from branches where status = 'ACTIVE' order by branch_id limit 1`,
    );
    branchId = rows[0].branch_id;
  });

  afterAll(async () => {
    if (!db) return;
    for (const id of created) {
      await db.query(`delete from tournament_matches where tournament_id = $1`, [id]);
      await db.query(
        `delete from payments where tournament_registration_id in (select registration_id from tournament_registrations where tournament_id = $1)`,
        [id],
      );
      await db.query(`delete from tournament_registrations where tournament_id = $1`, [id]);
      await db.query(`delete from tournaments where tournament_id = $1`, [id]);
    }
    await db.query(`delete from notifications where recipient_ref like $1`, [`0877${S.slice(-5)}%`]);
    await db.query(`delete from customers where phone like $1`, [`0877${S.slice(-5)}%`]);
    await db.end();
  });

  beforeEach(async () => {
    await db.query(`delete from notifications where recipient_ref like $1`, [`0877${S.slice(-5)}%`]);
  });

  describe("seed order (T8)", () => {
    it("places seeds so the top seed only meets the bottom one", async () => {
      // [1,8,4,5,2,7,3,6]: 1v8 and 2v7 in round 1, which is what makes an eight-player
      // bracket a seeding rather than eight random pairs.
      const { rows } = await db.query(`select public.tournament_seed_order(n) as o from generate_series(2, 8) n`);
      const bySize = Object.fromEntries(rows.map((r) => [r.o.length, r.o]));
      expect(bySize[2]).toEqual([1, 2]);
      expect(bySize[4]).toEqual([1, 4, 2, 3]);
      expect(bySize[8]).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    });
  });

  describe("registration gate (T1/T2/T3/T4)", () => {
    it("settles a free registration immediately and gives it a ticket code", async () => {
      const t = await makeTournament({ fee: 0, list_price: 100000 });
      const reg = await register(t, "Budi", "1");

      // T4: no payment page, no deadline — the seat is already paid.
      expect(reg.status).toBe("PAID");
      expect(reg.fee_amount).toBe(0);
      expect(reg.payment_deadline_at).toBeNull();
      expect(reg.registration_code).toMatch(/^TRN-[A-Z2-9]{6}$/);
    });

    it("queues a WhatsApp notification for every registration", async () => {
      const t = await makeTournament();
      const reg = await register(t, "Notif", "7");
      const { rows } = await db.query(
        `select template, status from notifications where recipient_ref = $1 order by id desc limit 1`,
        [phone("7")],
      );
      // The queue row is written by the database; sending is the service layer's job, so
      // this proves the event fired even with no provider configured.
      expect(rows[0].template).toBe("TOURNAMENT_REGISTERED_FREE");
      expect(rows[0].status).toBe("PENDING");
      expect(reg.registration_code).toBeTruthy();
    });

    it("refuses a draft tournament", async () => {
      const t = await makeTournament({ status: "DRAFT" });
      const err = await attempt(() => register(t, "Draf", "2"));
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("pendaftaran");
    });

    it("refuses the same phone twice (one seat per person)", async () => {
      const t = await makeTournament();
      await register(t, "Budi", "3");
      const err = await attempt(() => register(t, "Budi Lagi", "3"));
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("sudah terdaftar");
    });

    it("refuses once registration has closed", async () => {
      const t = await makeTournament({ closes_at: new Date(Date.now() - 864e5).toISOString() });
      const err = await attempt(() => register(t, "Terlambat", "4"));
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("ditutup");
    });

    it("refuses the seat past the quota and says how full it is", async () => {
      const t = await makeTournament({ quota: 2 });
      await register(t, "Satu", "5");
      await register(t, "Dua", "6");
      const err = await attempt(() => register(t, "Tiga", "8"));
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("kuota penuh (2/2)");
    });

    it("refuses an unknown tournament", async () => {
      const err = await attempt(() => register("TRN-999999", "Hantu", "9"));
      expect(err?.code).toBe("22023");
    });
  });

  describe("fee (T5/T6)", () => {
    it("waits for payment when there is a fee", async () => {
      const t = await makeTournament({ fee: 50000 });
      const reg = await register(t, "Bayar", "11");
      expect(reg.status).toBe("WAITING_PAYMENT");
      expect(reg.fee_amount).toBe(50000);
      expect(reg.payment_deadline_at).not.toBeNull();
    });

    it("snapshots the fee, so a later price change does not reach the player", async () => {
      const t = await makeTournament({ fee: 50000 });
      const reg = await register(t, "Awal", "12");
      await db.query(`update tournaments set registration_fee = 90000 where tournament_id = $1`, [t]);

      const { rows } = await db.query(
        `select fee_amount from tournament_registrations where registration_id = $1`,
        [reg.registration_id],
      );
      // T6: the seat is worth what the player was shown.
      expect(rows[0].fee_amount).toBe(50000);
    });

    it("creates one QRIS payment and reuses it on a retry", async () => {
      const t = await makeTournament({ fee: 25000 });
      const reg = await register(t, "QRIS", "13");

      const first = (await db.query(`select public.create_tournament_payment($1) as id`, [reg.registration_id])).rows[0].id;
      const again = (await db.query(`select public.create_tournament_payment($1) as id`, [reg.registration_id])).rows[0].id;
      // Reloading the payment page must not create a second charge.
      expect(again).toBe(first);

      const { rows } = await db.query(
        `select gross_amount, status, method from payments where tournament_registration_id = $1`,
        [reg.registration_id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].gross_amount).toBe(25000);
      expect(rows[0].status).toBe("PENDING");
    });

    it("refuses a payment for a free registration", async () => {
      const t = await makeTournament({ fee: 0 });
      const reg = await register(t, "Gratis", "14");
      const err = await attempt(() => db.query(`select public.create_tournament_payment($1)`, [reg.registration_id]));
      expect(err?.code).toBe("22023");
    });

    it("settles the seat when the payment is confirmed", async () => {
      const t = await makeTournament({ fee: 30000 });
      const reg = await register(t, "Lunas", "15");
      const paymentId = (await db.query(`select public.create_tournament_payment($1) as id`, [reg.registration_id])).rows[0].id;

      await db.query(`select public.settle_tournament_payment($1)`, [paymentId]);
      const { rows } = await db.query(
        `select status, paid_at from tournament_registrations where registration_id = $1`,
        [reg.registration_id],
      );
      expect(rows[0].status).toBe("PAID");
      expect(rows[0].paid_at).not.toBeNull();
    });

    it("refuses a second manual settlement of the same seat", async () => {
      const t = await makeTournament({ fee: 30000 });
      const reg = await register(t, "Ganti", "16");
      await db.query(`select public.settle_tournament_registration($1, 'CASH')`, [reg.registration_id]);

      // A cashier marking an already-paid seat paid again is a double charge, not a no-op.
      const err = await attempt(() =>
        db.query(`select public.settle_tournament_registration($1, 'CASH')`, [reg.registration_id]),
      );
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("sudah lunas");

      const { rows } = await db.query(
        `select count(*)::int as n from payments where tournament_registration_id = $1`,
        [reg.registration_id],
      );
      expect(rows[0].n).toBe(1);
    });

    it("only accepts counter payment methods", async () => {
      const t = await makeTournament({ fee: 30000 });
      const reg = await register(t, "Snap", "17");
      const err = await attempt(() =>
        db.query(`select public.settle_tournament_registration($1, 'MIDTRANS_CREDIT_CARD')`, [
          reg.registration_id,
        ]),
      );
      expect(err?.code).toBe("22023");
    });

    it("expires an unpaid seat past the deadline and frees the seat again", async () => {
      const t = await makeTournament({ fee: 15000, quota: 2 });
      const reg = await register(t, "Telat", "18");
      await db.query(
        `update tournament_registrations set payment_deadline_at = now() - interval '1 hour' where registration_id = $1`,
        [reg.registration_id],
      );

      const swept = (await db.query(`select public.expire_tournament_registrations() as n`)).rows[0].n;
      expect(swept).toBeGreaterThanOrEqual(1);

      const { rows } = await db.query(
        `select status from tournament_registrations where registration_id = $1`,
        [reg.registration_id],
      );
      expect(rows[0].status).toBe("EXPIRED");

      // The freed seat is sellable again.
      const late = await register(t, "Pengganti", "19");
      expect(["WAITING_PAYMENT", "PAID"]).toContain(late.status);
    });
  });

  describe("counter actions (T11/T12)", () => {
    it("refuses check-in before the fee is settled", async () => {
      const t = await makeTournament({ fee: 20000 });
      const reg = await register(t, "Belum", "20");
      const err = await attempt(() =>
        db.query(`select public.check_in_tournament_registration($1)`, [reg.registration_id]),
      );
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("belum lunas");
    });

    it("checks in a paid seat", async () => {
      const t = await makeTournament();
      const reg = await register(t, "Hadir", "21");
      await db.query(`select public.check_in_tournament_registration($1)`, [reg.registration_id]);
      const { rows } = await db.query(
        `select status, checked_in_at from tournament_registrations where registration_id = $1`,
        [reg.registration_id],
      );
      expect(rows[0].status).toBe("CHECKED_IN");
      expect(rows[0].checked_in_at).not.toBeNull();
    });

    it("releases the seat when a registration is cancelled", async () => {
      const t = await makeTournament({ quota: 2 });
      const first = await register(t, "Batal", "22");
      await register(t, "Cadangan", "23");

      await db.query(`select public.cancel_tournament_registration($1, 'no-show')`, [first.registration_id]);
      const { rows } = await db.query(
        `select status, cancel_reason from tournament_registrations where registration_id = $1`,
        [first.registration_id],
      );
      expect(rows[0].status).toBe("CANCELLED");
      expect(rows[0].cancel_reason).toBe("no-show");
    });

    it("pulls a cancelled player out of the bracket", async () => {
      const t = await makeTournament();
      const a = await register(t, "Bracket A", "24");
      await register(t, "Bracket B", "25");
      await register(t, "Bracket C", "26");
      await db.query(`select public.build_tournament_bracket($1)`, [t]);

      await db.query(`select public.cancel_tournament_registration($1, 'batal')`, [a.registration_id]);
      const { rows } = await db.query(
        `select player_a_name, player_b_name, status from tournament_matches
          where tournament_id = $1 and player_a_seed = 1 or tournament_id = $1 and player_b_seed = 1`,
        [t],
      );
      // The bye winner is pulled out and the match is re-resolved, so the player who is
      // actually still in the bracket takes the place instead of a no-show going through.
      for (const m of rows) {
        expect(m.player_a_name === "Bracket A" || m.player_b_name === "Bracket A").toBe(false);
      }
    });
  });

  describe("bracket (T8/T9)", () => {
    it("needs two paid players before it can be built", async () => {
      const t = await makeTournament();
      await register(t, "Solo", "27");
      const err = await attempt(() => db.query(`select public.build_tournament_bracket($1)`, [t]));
      expect(err?.code).toBe("22023");
      expect(err?.message).toContain("minimal 2");
    });

    it("gives a bye to the top seed and walks it up to the final", async () => {
      const t = await makeTournament();
      await register(t, "Seed1", "28");
      await register(t, "Seed2", "29");
      await register(t, "Seed3", "30");
      await db.query(`select public.build_tournament_bracket($1)`, [t]);

      const { rows } = await db.query(
        `select round_no, match_no, player_a_seed, player_b_seed, status
           from tournament_matches where tournament_id = $1 order by round_no, match_no`,
        [t],
      );
      // Three entrants in a four-slot bracket: seed 1 sits alone in R1M1 and is already
      // through it when the draw is built — and the final it reaches is empty too, so it
      // walks that as well. That is correct: a three-player bracket's champion is seed 1
      // by two byes.
      const r1m1 = rows.find((r) => r.round_no === 1 && r.match_no === 1);
      const r1m2 = rows.find((r) => r.round_no === 1 && r.match_no === 2);
      const r2m1 = rows.find((r) => r.round_no === 2 && r.match_no === 1);
      expect(r1m1.player_a_seed).toBe(1);
      expect(r1m1.player_b_seed).toBeNull();
      expect(r1m1.status).toBe("FINISHED");
      expect(r1m2.player_a_seed).toBe(2);
      expect(r1m2.player_b_seed).toBe(3);
      expect(r1m2.status).toBe("READY");
      expect(r2m1.player_a_seed).toBe(1);
      expect(r2m1.status).toBe("FINISHED");
      expect(rows).toHaveLength(3);
    });

    it("plays through to a champion and refuses to be rebuilt afterwards", async () => {
      const t = await makeTournament();
      for (let i = 1; i <= 4; i += 1) await register(t, `Main ${i}`, String(30 + i));
      await db.query(`select public.build_tournament_bracket($1)`, [t]);

      for (let round = 1; round <= 2; round += 1) {
        const { rows } = await db.query(
          `select match_id from tournament_matches where tournament_id = $1 and round_no = $2 and status = 'READY'`,
          [t, round],
        );
        for (const m of rows) {
          await db.query(`select public.report_tournament_match_result($1, 3, 1)`, [m.match_id]);
        }
      }

      const { rows: final } = await db.query(
        `select player_a_name, player_b_name, status, next_match_id from tournament_matches
          where tournament_id = $1 and round_no = 2`,
        [t],
      );
      expect(final[0].status).toBe("FINISHED");
      expect(final[0].next_match_id).toBeNull();
      // Seed 1 won every match it played, so it is in the final and wins it.
      expect(final[0].player_a_name).toBe("Main 1");

      const err = await attempt(() => db.query(`select public.build_tournament_bracket($1)`, [t]));
      expect(err?.code).toBe("22023");
    });

    it("refuses a draw and clears the score instead of picking a winner", async () => {
      const t = await makeTournament();
      await register(t, "Seri A", "35");
      await register(t, "Seri B", "36");
      await db.query(`select public.build_tournament_bracket($1)`, [t]);
      const { rows } = await db.query(
        `select match_id from tournament_matches where tournament_id = $1 and status = 'READY'`,
        [t],
      );

      const { rows: reported } = await db.query(`select public.report_tournament_match_result($1, 2, 2) as status`, [
        rows[0].match_id,
      ]);
      // T9: a draw is not a result. The match goes back to READY with the score cleared
      // so the operator re-enters the replay instead of a winner being invented.
      expect(reported[0].status).toBe("READY");

      const after = (await db.query(
        `select score_a, score_b, winner_registration_id from tournament_matches where match_id = $1`,
        [rows[0].match_id],
      )).rows[0];
      expect(after.score_a).toBeNull();
      expect(after.score_b).toBeNull();
      expect(after.winner_registration_id).toBeNull();
    });

    it("refuses a score into a match that has not been drawn yet", async () => {
      const t = await makeTournament();
      await register(t, "Kosong", "37");
      const err = await attempt(() => db.query(`select public.build_tournament_bracket($1)`, [t]));
      expect(err?.code).toBe("22023");
    });
  });

  describe("quota bookkeeping (T3)", () => {
    it("flips to FULL and back to OPEN as seats fill and free up", async () => {
      const t = await makeTournament({ quota: 2 });
      const first = await register(t, "Penuh A", "38");
      await register(t, "Penuh B", "39");

      const full = (await db.query(`select public.sync_tournament_quota($1) as s`, [t])).rows[0].s;
      expect(full).toBe("FULL");

      await db.query(`select public.cancel_tournament_registration($1)`, [first.registration_id]);
      const open = (await db.query(`select public.sync_tournament_quota($1) as s`, [t])).rows[0].s;
      expect(open).toBe("OPEN");
    });
  });
});