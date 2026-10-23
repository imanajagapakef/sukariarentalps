import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { convertQRIS } from "@/lib/qris-dinamis";
import { dispatchPendingFor } from "@/lib/whatsapp";

type DB = SupabaseClient<Database>;

/**
 * Tournament service.
 *
 * Every rule that matters (quota, deadline, fee, seeding, byes, advancing a winner)
 * lives in the database functions from migration 0031, because they have to hold inside
 * a transaction. This layer is deliberately thin: it shapes arguments, turns the RPC's
 * Indonesian error text into a 400 the form can show, and fires the WhatsApp queue
 * afterwards.
 */
export class TournamentError extends Error {
  readonly isClientError: boolean;
  constructor(message: string, isClientError = true) {
    super(message);
    this.name = "TournamentError";
    this.isClientError = isClientError;
  }
}

/** The RPCs raise 22023 for anything the customer could fix; that is a 400, not a 500. */
function wrap(error: { code?: string; message: string }): TournamentError {
  return new TournamentError(error.message, error.code === "22023");
}

export type TournamentRegistrationResult = {
  registration_id: string;
  registration_code: string;
  status: Database["public"]["Enums"]["tournament_registration_status"];
  fee_amount: number;
  payment_deadline_at: string | null;
  tournament_title: string;
  starts_at: string;
  branch_name: string;
};

/**
 * Register a player.
 *
 * The WhatsApp send happens after the call returns, never inside it: a provider that is
 * down must not roll back a seat the customer just took.
 */
export async function registerForTournament(
  db: DB,
  input: { tournament_id: string; name: string; phone: string; notes?: string },
): Promise<TournamentRegistrationResult> {
  const { data, error } = await db.rpc("register_tournament", {
    p_tournament_id: input.tournament_id,
    p_name: input.name,
    p_phone: input.phone,
    p_notes: input.notes,
  });
  if (error) throw wrap(error);

  const row = (data as TournamentRegistrationResult[] | null)?.[0];
  if (!row) throw new TournamentError("Pendaftaran gagal", false);

  const { data: registration } = await db
    .from("tournament_registrations")
    .select("phone")
    .eq("registration_id", row.registration_id)
    .maybeSingle();

  if (registration?.phone) {
    // Fire-and-report: dispatchPendingFor never throws.
    await dispatchPendingFor(registration.phone);
  }

  // Keep the tournament's FULL/OPEN flag honest without making the customer wait on a
  // second write: the seat is already taken, this only refreshes what the card shows.
  await db.rpc("sync_tournament_quota", { p_tournament_id: input.tournament_id });

  return row;
}

export type RegistrationDetail = Database["public"]["Tables"]["tournament_registrations"]["Row"] & {
  tournaments: {
    title: string;
    slug: string;
    starts_at: string;
    registration_fee: number;
    poster_url: string | null;
    prize: string | null;
    rules: string | null;
    branch_id: string;
  } | null;
  branch: { name: string; short_name: string | null; address: string | null } | null;
};

const REGISTRATION_SELECT = "*, tournaments(title, slug, starts_at, registration_fee, poster_url, prize, rules, branch_id)";

/** Ticket lookup by the printed code. Public, so it goes through the service role. */
export async function getRegistrationByCode(db: DB, code: string): Promise<RegistrationDetail | null> {
  const { data, error } = await db
    .from("tournament_registrations")
    .select(REGISTRATION_SELECT)
    .eq("registration_code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw wrap(error);
  if (!data) return null;

  // The branch is one hop away (registration -> tournament -> branch), which PostgREST
  // cannot embed: there is no FK between the two tables, so asking for `branches(...)`
  // here fails outright rather than returning null.
  const branchId = data.tournaments?.branch_id ?? null;
  if (!branchId) return data as RegistrationDetail;

  const { data: branch } = await db
    .from("branches")
    .select("name, short_name, address")
    .eq("branch_id", branchId)
    .maybeSingle();

  return { ...data, branch: branch ?? null } as RegistrationDetail;
}

/**
 * Dynamic-amount QRIS for the fee, built from the same merchant string the booking
 * flow uses. Returns the payment row so the ticket page can show the QR.
 */
export async function createRegistrationQrisPayment(
  db: DB,
  registrationId: string,
): Promise<{ payment_id: string; qr_string: string; amount: number }> {
  const { data: paymentId, error } = await db.rpc("create_tournament_payment", {
    p_registration_id: registrationId,
  });
  if (error) throw wrap(error);

  const { data: payment } = await db
    .from("payments")
    .select("payment_id, gross_amount, raw_response")
    .eq("payment_id", paymentId as string)
    .maybeSingle();
  if (!payment) throw new TournamentError("Pembayaran tidak dibuat", false);

  const staticQris = process.env.QRIS_STATIC_STRING;
  if (!staticQris) throw new TournamentError("QRIS_STATIC_STRING belum diisi", false);

  const existing = (payment.raw_response as { qr_string?: string } | null)?.qr_string;
  const qr_string =
    existing ?? convertQRIS(staticQris, { amount: payment.gross_amount });

  if (!existing) {
    await db
      .from("payments")
      .update({ raw_response: { qr_string } })
      .eq("payment_id", payment.payment_id);
  }

  return { payment_id: payment.payment_id, qr_string, amount: payment.gross_amount };
}

/** Cash or manual QRIS at the counter: one call records the money and settles the seat. */
export async function settleAtCounter(
  db: DB,
  args: {
    registration_id: string;
    method: "CASH" | "QRIS_MANUAL" | "TRANSFER_MANUAL";
    createdBy?: string;
    notes?: string;
  },
): Promise<number> {
  const { data, error } = await db.rpc("settle_tournament_registration", {
    p_registration_id: args.registration_id,
    p_method: args.method,
    p_created_by: args.createdBy,
    p_notes: args.notes,
  });
  if (error) throw wrap(error);

  const { data: registration } = await db
    .from("tournament_registrations")
    .select("phone")
    .eq("registration_id", args.registration_id)
    .maybeSingle();
  if (registration?.phone) await dispatchPendingFor(registration.phone);

  return data as number;
}

/** Cashier confirms a QRIS scan. */
export async function settleRegistrationPayment(db: DB, paymentId: string): Promise<boolean> {
  const { error } = await db.rpc("settle_tournament_payment", { p_payment_id: paymentId });
  if (error) throw wrap(error);
  return true;
}

export async function checkInRegistration(db: DB, registrationId: string): Promise<boolean> {
  const { error } = await db.rpc("check_in_tournament_registration", {
    p_registration_id: registrationId,
  });
  if (error) throw wrap(error);
  return true;
}

export async function cancelRegistration(
  db: DB,
  registrationId: string,
  reason?: string,
): Promise<boolean> {
  const { error } = await db.rpc("cancel_tournament_registration", {
    p_registration_id: registrationId,
    p_reason: reason,
  });
  if (error) throw wrap(error);
  return true;
}

export async function buildBracket(db: DB, tournamentId: string): Promise<number> {
  const { data, error } = await db.rpc("build_tournament_bracket", {
    p_tournament_id: tournamentId,
  });
  if (error) throw wrap(error);
  return data as number;
}

/**
 * Wipe the bracket so it can be built again.
 *
 * build_tournament_bracket() refuses once any match is FINISHED, and that guard is
 * right — rebuilding over live results would silently erase the tournament's history.
 * But a guard without an escape is a dead end: an admin who drew the bracket with the
 * wrong players has to be able to clear it, which is what this is for. The UI puts a
 * confirmation in front of it and says what it destroys.
 */
export async function resetBracket(db: DB, tournamentId: string): Promise<number> {
  const { error } = await db.rpc("reset_tournament_bracket", {
    p_tournament_id: tournamentId,
  });
  if (error) throw wrap(error);

  const { count } = await db
    .from("tournament_matches")
    .select("match_id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);
  return count ?? 0;
}

export async function reportMatchResult(
  db: DB,
  args: { match_id: string; score_a: number; score_b: number },
): Promise<Database["public"]["Enums"]["tournament_match_status"]> {
  const { data, error } = await db.rpc("report_tournament_match_result", {
    p_match_id: args.match_id,
    p_score_a: args.score_a,
    p_score_b: args.score_b,
  });
  if (error) throw wrap(error);
  return data as Database["public"]["Enums"]["tournament_match_status"];
}

/** Sweep unpaid seats past their deadline. Cheap, and safe to call on every admin load. */
export async function expireStaleRegistrations(db: DB): Promise<number> {
  const { data, error } = await db.rpc("expire_tournament_registrations");
  if (error) throw wrap(error);
  return data as number;
}

export async function sendRegistrationNotifications(
  db: DB,
  registrationId: string,
): Promise<{ sent: number; failed: number }> {
  const { data, error } = await db
    .from("tournament_registrations")
    .select("phone")
    .eq("registration_id", registrationId)
    .maybeSingle();
  if (error) throw wrap(error);
  if (!data?.phone) return { sent: 0, failed: 0 };
  return dispatchPendingFor(data.phone);
}