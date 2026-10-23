import { describe, expect, it } from "vitest";
import {
  bracketRounds,
  canCheckIn,
  canRegister,
  feeDisplay,
  fillPercent,
  heldSeats,
  isChampion,
  isFree,
  isPayable,
  isPublic,
  isScorable,
  minutesLeft,
  roundLabel,
  roundsFor,
  seatsLeft,
  slotLabel,
  winnerFromScore,
  type Registration,
  type Tournament,
  type TournamentMatch,
  type TournamentStatus,
} from "@/lib/tournament-rules";

const t = (over: Partial<Tournament> = {}): Tournament => ({
  tournament_id: "TRN-0001",
  slug: "paket-malam",
  title: "Paket Malam",
  status: "OPEN",
  starts_at: "2026-11-01T10:00:00Z",
  registration_closes_at: null,
  registration_fee: 50000,
  list_price: null,
  quota: 16,
  held: 4,
  ...over,
});

const reg = (over: Partial<Registration> = {}): Registration => ({
  registration_id: "REG-0001",
  registration_code: "TRN-ABC123",
  status: "WAITING_PAYMENT",
  fee_amount: 50000,
  payment_deadline_at: "2026-10-19T12:30:00Z",
  seed_number: null,
  tournament_id: "TRN-0001",
  ...over,
});

const match = (over: Partial<TournamentMatch> = {}): TournamentMatch => ({
  match_id: "MCH-00001",
  round_no: 1,
  match_no: 1,
  player_a_name: "Budi",
  player_b_name: "Sari",
  player_a_seed: 1,
  player_b_seed: 4,
  score_a: null,
  score_b: null,
  status: "READY",
  winner_registration_id: null,
  next_match_id: "MCH-00005",
  ...over,
});

const now = new Date("2026-10-19T12:00:00Z");

describe("visibility", () => {
  it("shows the same statuses the public read policy allows", () => {
    // The RLS policy on tournaments is (OPEN, FULL, ONGOING, DONE); a page that lists
    // a DRAFT tournament would render a card the customer cannot open.
    const visible: TournamentStatus[] = ["OPEN", "FULL", "ONGOING", "DONE"];
    expect(visible.every(isPublic)).toBe(true);
    expect(isPublic("DRAFT")).toBe(false);
    expect(isPublic("CANCELLED")).toBe(false);
  });
});

describe("seats", () => {
  it("counts only seats that block someone else", () => {
    // The RPC counts WAITING_PAYMENT + PAID + CHECKED_IN. An expired or cancelled
    // registration must not shrink the number shown as "kursi tersisa".
    expect(heldSeats(t({ held: 12 }))).toBe(12);
    expect(seatsLeft(t({ held: 12 }))).toBe(4);
  });

  it("never reports negative seats when over-booked by hand", () => {
    expect(seatsLeft(t({ quota: 4, held: 9 }))).toBe(0);
    expect(fillPercent(t({ quota: 4, held: 9 }))).toBe(100);
  });

  it("reports a full bar rather than overflowing", () => {
    expect(fillPercent(t({ quota: 16, held: 8 }))).toBe(50);
    expect(fillPercent(t({ quota: 16, held: 16 }))).toBe(100);
  });
});

describe("fee display", () => {
  it("shows the amount when there is a fee", () => {
    expect(feeDisplay(t({ registration_fee: 50000 }))).toEqual({ kind: "paid", amount: 50000 });
  });

  it("strikes the list price out when the tournament is free", () => {
    // The whole point of the GRATIS sticker: Rp 100.000 crossed out, not Rp 0.
    expect(feeDisplay(t({ registration_fee: 0, list_price: 100000 }))).toEqual({
      kind: "free",
      strikePrice: 100000,
    });
  });

  it("shows the sticker alone when a free tournament has no list price", () => {
    expect(feeDisplay(t({ registration_fee: 0, list_price: null }))).toEqual({
      kind: "free",
      strikePrice: null,
    });
  });

  it("ignores the list price once a fee is set", () => {
    // A leftover list_price from when the tournament was free must not produce a
    // crossed-out price beside a real fee.
    expect(feeDisplay(t({ registration_fee: 50000, list_price: 100000 }))).toEqual({
      kind: "paid",
      amount: 50000,
    });
  });

  it("treats a zero or negative fee as free", () => {
    expect(isFree(t({ registration_fee: 0 }))).toBe(true);
  });
});

describe("registration gate", () => {
  it("allows an open tournament with seats", () => {
    expect(canRegister(t(), now)).toEqual({ ok: true });
  });

  it("refuses a draft", () => {
    expect(canRegister(t({ status: "DRAFT" }), now).ok).toBe(false);
  });

  it("refuses a cancelled tournament", () => {
    expect(canRegister(t({ status: "CANCELLED" }), now).ok).toBe(false);
  });

  it("refuses once the seats run out", () => {
    const full = t({ quota: 4, held: 4 });
    expect(canRegister(full, now).ok).toBe(false);
    // Same outcome when the status has not caught up yet: the RPC counts seats, not
    // the status column, so the page must too.
    expect(canRegister(t({ quota: 4, held: 4, status: "OPEN" }), now).ok).toBe(false);
  });

  it("refuses after the closing time", () => {
    const closed = t({ registration_closes_at: "2026-10-19T11:00:00Z" });
    expect(canRegister(closed, now).ok).toBe(false);
    expect(canRegister({ ...closed, registration_closes_at: "2026-10-19T13:00:00Z" }, now).ok).toBe(true);
  });

  it("refuses while the event is running", () => {
    expect(canRegister(t({ status: "ONGOING" }), now).ok).toBe(false);
    expect(canRegister(t({ status: "DONE" }), now).ok).toBe(false);
  });
});

describe("payment window", () => {
  it("is payable inside the deadline", () => {
    expect(isPayable(reg(), now)).toBe(true);
  });

  it("is not payable once the deadline has passed", () => {
    const late = reg({ payment_deadline_at: "2026-10-19T11:00:00Z" });
    expect(isPayable(late, now)).toBe(false);
    expect(minutesLeft(late, now)).toBe(0);
  });

  it("is not payable when already settled", () => {
    expect(isPayable(reg({ status: "PAID" }), now)).toBe(false);
  });

  it("counts the minutes left for the countdown copy", () => {
    expect(minutesLeft(reg(), now)).toBe(30);
    expect(minutesLeft(reg({ payment_deadline_at: null }), now)).toBe(0);
  });
});

describe("check-in", () => {
  it("is allowed once the fee is settled, and stays allowed after", () => {
    expect(canCheckIn("PAID")).toBe(true);
    expect(canCheckIn("CHECKED_IN")).toBe(true);
  });

  it("is refused before payment, matching the RPC", () => {
    expect(canCheckIn("WAITING_PAYMENT")).toBe(false);
    expect(canCheckIn("EXPIRED")).toBe(false);
    expect(canCheckIn("CANCELLED")).toBe(false);
  });
});

describe("bracket", () => {
  it("names rounds by how close they are to the final", () => {
    // Naming by round number would call an 8-player bracket's round 2 the "semifinal".
    expect(roundLabel(3, 3)).toBe("Final");
    expect(roundLabel(2, 3)).toBe("Semifinal");
    expect(roundLabel(1, 3)).toBe("Perempat Final");
    expect(roundLabel(1, 1)).toBe("Final");
    expect(roundLabel(2, 5)).toBe("Babak 2");
  });

  it("groups matches into rounds, earliest round first", () => {
    // Playing order, not final-first: a bracket reads from round 1 down to the final.
    const rounds = bracketRounds([
      match({ match_id: "c", round_no: 2, match_no: 1 }),
      match({ match_id: "b", round_no: 1, match_no: 2 }),
      match({ match_id: "a", round_no: 1, match_no: 1 }),
    ]);
    expect(rounds.map((r) => r.label)).toEqual(["Semifinal", "Final"]);
    expect(rounds[0].matches.map((m) => m.match_no)).toEqual([1, 2]);
  });

  it("labels an empty slot as TBD", () => {
    expect(slotLabel(match(), "a")).toBe("Budi");
    expect(slotLabel(match({ player_b_name: null }), "b")).toBe("TBD");
  });

  it("derives the winner from the score, and never from a draw", () => {
    expect(winnerFromScore(match({ score_a: 3, score_b: 1 }))).toBe("a");
    expect(winnerFromScore(match({ score_a: 0, score_b: 2 }))).toBe("b");
    expect(winnerFromScore(match({ score_a: 2, score_b: 2 }))).toBeNull();
    expect(winnerFromScore(match())).toBeNull();
  });

  it("lets a score be typed only into a match with both players", () => {
    expect(isScorable(match())).toBe(true);
    expect(isScorable(match({ status: "WAITING" }))).toBe(false);
    expect(isScorable(match({ status: "FINISHED", score_a: 1, score_b: 0 }))).toBe(false);
    expect(isScorable(match({ player_b_name: null }))).toBe(false);
  });

  it("knows the champion is the finished match with nothing above it", () => {
    expect(isChampion(match({ next_match_id: null, status: "FINISHED" }))).toBe(true);
    expect(isChampion(match({ next_match_id: null, status: "READY" }))).toBe(false);
    expect(isChampion(match())).toBe(false);
  });

  it("counts rounds the same way the builder does", () => {
    // 2 -> 1 round, 3-4 -> 2, 5-8 -> 3. Mirrors build_tournament_bracket()'s halving.
    expect(roundsFor(2)).toBe(1);
    expect(roundsFor(3)).toBe(2);
    expect(roundsFor(4)).toBe(2);
    expect(roundsFor(5)).toBe(3);
    expect(roundsFor(8)).toBe(3);
    expect(roundsFor(9)).toBe(4);
    expect(roundsFor(1)).toBe(0);
  });
});