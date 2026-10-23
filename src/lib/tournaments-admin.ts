import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { expireStaleRegistrations } from "@/services/tournament.service";
import type { Database } from "@/types/database";

/**
 * Admin reads for tournaments.
 *
 * Server-only and uncached, unlike the public reads in lib/tournaments.ts: this is the
 * counter's view of who paid, who turned up and what the bracket looks like, and a
 * cached "belum lunas" on a player standing at the till is the wrong kind of fast.
 *
 * The sweep runs here rather than in a cron because both places that show seats (the
 * list and the detail page) need it, and a sweep is one indexed update.
 */
export type AdminTournament = Database["public"]["Tables"]["tournaments"]["Row"] & {
  stats: { held: number; paid: number; revenue: number };
};

export async function getAdminTournaments(options?: {
  /** STAFF placement: pass it to read one branch; OWNER/ADMIN (and unbound) read every outlet. */
  branchId?: string;
}): Promise<{
  tournaments: AdminTournament[];
  swept: number;
}> {
  const db = createAdminClient();
  const swept = await expireStaleRegistrations(db);

  let listQuery = db
    .from("tournaments")
    .select(
      `tournament_id, slug, title, game_id, branch_id, poster_url, description, rules, prize, starts_at, registration_closes_at, registration_fee, list_price, quota, payment_window_minutes, status, created_at, updated_at`,
    );
  if (options?.branchId) listQuery = listQuery.eq("branch_id", options.branchId);
  const { data, error } = await listQuery.order("starts_at", {
    ascending: false,
  });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as AdminTournament[];
  const ids = rows.map((t) => t.tournament_id);

  const registrationRows: { tournament_id: string; status: string; fee_amount: number }[] = ids.length
    ? (((
        await db
          .from("tournament_registrations")
          .select("tournament_id, status, fee_amount")
          .in("tournament_id", ids)
      ).data ?? []) as { tournament_id: string; status: string; fee_amount: number }[])
    : [];

  const byTournament = new Map<string, { held: number; paid: number; revenue: number }>();
  for (const r of registrationRows) {
    const bucket = byTournament.get(r.tournament_id) ?? { held: 0, paid: 0, revenue: 0 };
    if (["WAITING_PAYMENT", "PAID", "CHECKED_IN"].includes(r.status)) bucket.held += 1;
    if (r.status === "PAID" || r.status === "CHECKED_IN") {
      bucket.paid += 1;
      bucket.revenue += r.fee_amount;
    }
    byTournament.set(r.tournament_id, bucket);
  }

  return {
    tournaments: rows.map((t) => ({
      ...t,
      stats: byTournament.get(t.tournament_id) ?? { held: 0, paid: 0, revenue: 0 },
    })),
    swept,
  };
}

export type AdminRegistration = Database["public"]["Tables"]["tournament_registrations"]["Row"];
export type AdminMatch = Database["public"]["Tables"]["tournament_matches"]["Row"];

export async function getTournamentAdminDetail(
  tournamentId: string,
  options?: {
    /** STAFF placement: pass it so a cross-branch id resolves to null (page 404s it). */
    branchId?: string;
  },
): Promise<{
  tournament: Database["public"]["Tables"]["tournaments"]["Row"] | null;
  registrations: AdminRegistration[];
  matches: AdminMatch[];
}> {
  const db = createAdminClient();
  await expireStaleRegistrations(db);

  let tournamentQuery = db
    .from("tournaments")
    .select("*")
    .eq("tournament_id", tournamentId);
  if (options?.branchId) tournamentQuery = tournamentQuery.eq("branch_id", options.branchId);
  const { data: tournament } = await tournamentQuery.maybeSingle();

  const [{ data: registrations }, { data: matches }] = await Promise.all([
    db
      .from("tournament_registrations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("seed_number", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true }),
    db
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", tournamentId)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true }),
  ]);

  return {
    tournament: tournament ?? null,
    registrations: (registrations ?? []) as AdminRegistration[],
    matches: (matches ?? []) as AdminMatch[],
  };
}