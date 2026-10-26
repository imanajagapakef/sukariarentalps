/**
 * Tournament rules, as pure functions.
 *
 * Everything the customer and the counter are shown about a tournament is decided
 * here rather than in a component, for the same reason promo-rules.ts exists: the
 * page and the database have to agree. register_tournament() re-checks every rule
 * below inside its transaction, so a mismatch here is a confusing form, not a wrong
 * booking — but a confusing form is still a bug.
 *
 * No imports: this module is used by server components, client components and tests.
 */

export type TournamentStatus =
  | "DRAFT"
  | "OPEN"
  | "FULL"
  | "ONGOING"
  | "DONE"
  | "CANCELLED";

export type RegistrationStatus =
  | "WAITING_PAYMENT"
  | "PAID"
  | "CHECKED_IN"
  | "CANCELLED"
  | "EXPIRED"
  | "DISQUALIFIED";

export type MatchStatus = "WAITING" | "READY" | "FINISHED";

export type Tournament = {
  tournament_id: string;
  slug: string;
  title: string;
  status: TournamentStatus;
  starts_at: string;
  registration_closes_at: string | null;
  registration_fee: number;
  /** Crossed-out price shown next to the GRATIS sticker. */
  list_price: number | null;
  quota: number;
  /** Seats currently held: WAITING_PAYMENT + PAID + CHECKED_IN. */
  held?: number;
};

export type Registration = {
  registration_id: string;
  registration_code: string;
  status: RegistrationStatus;
  fee_amount: number;
  payment_deadline_at: string | null;
  seed_number: number | null;
  tournament_id: string;
};

export type TournamentMatch = {
  match_id: string;
  round_no: number;
  match_no: number;
  player_a_name: string | null;
  player_b_name: string | null;
  player_a_seed: number | null;
  player_b_seed: number | null;
  score_a: number | null;
  score_b: number | null;
  status: MatchStatus;
  winner_registration_id: string | null;
  next_match_id: string | null;
  /** Optional because the bracket is also rendered from tests and partial fixtures. */
  finished_at?: string | null;
};

// ---------------------------------------------------------------------------
// labels
// ---------------------------------------------------------------------------

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: "Draf",
  OPEN: "Pendaftaran dibuka",
  FULL: "Penuh",
  ONGOING: "Berlangsung",
  DONE: "Selesai",
  CANCELLED: "Dibatalkan",
};

export const REGISTRATION_STATUS_LABEL: Record<RegistrationStatus, string> = {
  WAITING_PAYMENT: "Belum lunas",
  PAID: "Lunas",
  CHECKED_IN: "Hadir",
  CANCELLED: "Batal",
  EXPIRED: "Kedaluwarsa",
  DISQUALIFIED: "Diskualifikasi",
};

export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  WAITING: "Menunggu",
  READY: "Siap main",
  FINISHED: "Selesai",
};

/** Only these are visible to customers; DRAFT and CANCELLED are admin's business. */
export function isPublic(status: TournamentStatus): boolean {
  return status === "OPEN" || status === "FULL" || status === "ONGOING" || status === "DONE";
}

// ---------------------------------------------------------------------------
// seats
// ---------------------------------------------------------------------------

/** Seats that actually block someone else. Matches the RPC's count exactly. */
export function heldSeats(t: Pick<Tournament, "held">): number {
  return t.held ?? 0;
}

export function seatsLeft(t: Pick<Tournament, "quota" | "held">): number {
  return Math.max(0, t.quota - heldSeats(t));
}

export function fillPercent(t: Pick<Tournament, "quota" | "held">): number {
  if (t.quota <= 0) return 0;
  return Math.min(100, Math.round((heldSeats(t) / t.quota) * 100));
}

export function isFree(t: Pick<Tournament, "registration_fee">): boolean {
  return t.registration_fee <= 0;
}

/**
 * What the fee line should say.
 *
 * A free tournament with a list price shows the price struck through with a GRATIS
 * sticker on top; a free tournament without one shows nothing but the sticker; a paid
 * one shows the amount. The union is the point: "is there a number to cross out" is a
 * different question from "is it free", and collapsing them is how a card ends up
 * claiming a Rp 100.000 saving on a tournament whose fee was never set.
 */
export type FeeDisplay =
  | { kind: "free"; strikePrice: number | null }
  | { kind: "paid"; amount: number };

export function feeDisplay(t: Pick<Tournament, "registration_fee" | "list_price">): FeeDisplay {
  if (t.registration_fee > 0) return { kind: "paid", amount: t.registration_fee };
  return { kind: "free", strikePrice: t.list_price && t.list_price > 0 ? t.list_price : null };
}

// ---------------------------------------------------------------------------
// registration gate
// ---------------------------------------------------------------------------

export type RegisterCheck = { ok: true } | { ok: false; reason: string };

/**
 * Whether the form should even be shown, mirroring register_tournament()'s order of
 * checks so the page refuses for the same reason the database would.
 */
export function canRegister(t: Tournament, now: Date): RegisterCheck {
  if (t.status === "DRAFT") return { ok: false, reason: "Pendaftaran belum dibuka." };
  if (t.status === "CANCELLED") return { ok: false, reason: "Turnamen ini dibatalkan." };
  // Turnamen yang sudah dimulai tidak boleh daftar lagi, terlepas dari statusnya
  // (status belum di-update ke ONGOING atau registration_closes_at masih di depan).
  if (new Date(t.starts_at) <= now) return { ok: false, reason: "Pendaftaran sudah ditutup." };
  if (t.status === "FULL" && seatsLeft(t) === 0) {
    return { ok: false, reason: "Kuota sudah penuh." };
  }
  if (t.status === "DONE" || t.status === "ONGOING") {
    return { ok: false, reason: "Pendaftaran sudah ditutup." };
  }
  if (t.registration_closes_at && now >= new Date(t.registration_closes_at)) {
    return { ok: false, reason: "Pendaftaran sudah ditutup." };
  }
  if (seatsLeft(t) === 0) return { ok: false, reason: "Kuota sudah penuh." };
  return { ok: true };
}

/** The customer's own ticket still has to be payable after the deadline check. */
export function isPayable(r: Registration, now: Date): boolean {
  if (r.status !== "WAITING_PAYMENT") return false;
  if (!r.payment_deadline_at) return false;
  return new Date(r.payment_deadline_at) > now;
}

export function minutesLeft(r: Registration, now: Date): number {
  if (!r.payment_deadline_at) return 0;
  return Math.max(0, Math.round((new Date(r.payment_deadline_at).getTime() - now.getTime()) / 60000));
}

export function isCheckedIn(status: RegistrationStatus): boolean {
  return status === "CHECKED_IN";
}

/** T11 mirrored for the counter button. */
export function canCheckIn(status: RegistrationStatus): boolean {
  return status === "PAID" || status === "CHECKED_IN";
}

// ---------------------------------------------------------------------------
// bracket
// ---------------------------------------------------------------------------

export type Round = {
  round_no: number;
  label: string;
  matches: TournamentMatch[];
};

/**
 * Round names, counting back from the last round.
 *
 * The last round is always the final; the one before it the semifinal. The naming is
 * derived from the size rather than hard-coded per round number, because an 8-player
 * bracket's round 2 is the quarter-final while a 4-player bracket's round 2 is the
 * final.
 */
export function roundLabel(roundNo: number, totalRounds: number): string {
  const fromEnd = totalRounds - roundNo + 1;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinal";
  if (fromEnd === 3) return "Perempat Final";
  return `Babak ${roundNo}`;
}

export function bracketRounds(matches: readonly TournamentMatch[]): Round[] {
  const total = new Set(matches.map((m) => m.round_no)).size;
  const byRound = new Map<number, TournamentMatch[]>();
  for (const m of matches) {
    const list = byRound.get(m.round_no);
    if (list) list.push(m);
    else byRound.set(m.round_no, [m]);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round_no, list]) => ({
      round_no,
      label: roundLabel(round_no, total),
      matches: [...list].sort((a, b) => a.match_no - b.match_no),
    }));
}

/** The name a match shows for a slot: the player, or "TBD"/"—" when it is empty. */
export function slotLabel(
  m: Pick<TournamentMatch, "player_a_name" | "player_b_name">,
  side: "a" | "b",
  tbd = "TBD",
): string {
  const name = side === "a" ? m.player_a_name : m.player_b_name;
  return name ?? tbd;
}

/**
 * Which side won, read from the score.
 *
 * The match row stores a winner *registration id* but only denormalises the two
 * player *names* (T10, so the public bracket never touches registrations). Deriving the
 * winner from the score keeps the public page honest without exposing ids, and it
 * cannot disagree with the winner column: a draw never becomes FINISHED.
 */
export function winnerFromScore(m: TournamentMatch): "a" | "b" | null {
  if (m.score_a === null || m.score_b === null) return null;
  if (m.score_a > m.score_b) return "a";
  if (m.score_b > m.score_a) return "b";
  return null;
}

/** Matches the counter can type a score into right now. */
export function isScorable(m: TournamentMatch): boolean {
  return m.status === "READY" && m.player_a_name !== null && m.player_b_name !== null;
}

export function isChampion(m: TournamentMatch): boolean {
  return m.status === "FINISHED" && m.next_match_id === null;
}

/**
 * What to shout about on the homepage.
 *
 * The homepage sells a tournament with one question — "who is fighting whom next, and who
 * just won" — so these two lists are what it reads. Both are sorted so the freshest
 * thing is first: a match that is READY now matters more than a READY match two rounds
 * out, and a result from ten minutes ago matters more than one from an hour ago.
 */
export function liveMatches(matches: readonly TournamentMatch[]): TournamentMatch[] {
  return matches
    .filter(isScorable)
    .sort((a, b) => a.round_no - b.round_no || a.match_no - b.match_no);
}

export function latestResults(
  matches: readonly TournamentMatch[],
  limit = 3,
): TournamentMatch[] {
  return matches
    .filter((m) => m.status === "FINISHED")
    .sort((a, b) => {
      // finished_at is the real ordering; falls back to round so a bracket restored from
      // a fixture still reads last-round-first rather than arbitrarily.
      const at = a.finished_at ?? "";
      const bt = b.finished_at ?? "";
      if (at && bt) return bt.localeCompare(at);
      return b.round_no - a.round_no || a.match_no - b.match_no;
    })
    .slice(0, limit);
}

/** The winning side's name for a finished match, for result headlines. */
export function resultHeadline(m: TournamentMatch): { winner: string; loser: string; score: string } | null {
  const side = winnerFromScore(m);
  if (side === null) return null;
  const winner = side === "a" ? m.player_a_name : m.player_b_name;
  const loser = side === "a" ? m.player_b_name : m.player_a_name;
  if (!winner) return null;
  return {
    winner,
    loser: loser ?? "TBD",
    score: `${m.score_a}-${m.score_b}`,
  };
}

/** True once any match has a result — the signal that a bracket is worth watching. */
export function hasStarted(matches: readonly TournamentMatch[]): boolean {
  return matches.some((m) => m.status === "FINISHED");
}

/** How many rounds a bracket of n entrants has, mirroring build_tournament_bracket(). */
export function roundsFor(entrants: number): number {
  if (entrants < 2) return 0;
  let size = 2;
  while (size < entrants) size *= 2;
  let rounds = 0;
  let per = size;
  while (per > 1) {
    rounds += 1;
    per = Math.floor(per / 2);
  }
  return rounds;
}