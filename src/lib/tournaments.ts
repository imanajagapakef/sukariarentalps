import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { Database } from "@/types/database";

/**
 * Public tournament reads.
 *
 * Everything here goes through public_tournament_overview() and the two tables RLS
 * already opens (tournaments, tournament_matches). Registrations are deliberately not
 * read: they hold phone numbers, and a customer looking at a bracket needs names and
 * scores, not contact details — which is why the match rows carry a denormalised copy
 * of each player's name.
 *
 * Cached like the rest of the catalog: a tournament card changing between renders is
 * not a problem worth a database round trip on every page view.
 */

export type TournamentOverview = Database["public"]["Functions"]["public_tournament_overview"]["Returns"][number];

export const getTournamentOverviews = cache(async (): Promise<TournamentOverview[]> => {
  // 30s, not the catalog's 300: the overview carries the seat count, and "3 kursi tersisa"
  // that is three registrations out of date is the kind of number that loses a sale.
  const db = createPublicClient({ revalidate: 30 });
  const { data, error } = await db.rpc("public_tournament_overview");
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentOverview[];
});

export const getTournamentBySlug = cache(async (slug: string): Promise<TournamentOverview | null> => {
  const db = createPublicClient({ revalidate: 30 });
  const { data, error } = await db.rpc("public_tournament_overview", { p_slug: slug });
  if (error) throw new Error(error.message);
  return ((data ?? []) as TournamentOverview[])[0] ?? null;
});

export type PublicMatch = Database["public"]["Tables"]["tournament_matches"]["Row"];

/**
 * The bracket, oldest round first — the order the page renders it in.
 *
 * Short cache on purpose: a score entered at the counter has to show up on the homepage
 * while the people who paid are still standing there. Five minutes of staleness on this
 * one read would make the whole "live tournament" section feel broken.
 */
export async function getTournamentMatches(tournamentId: string): Promise<PublicMatch[]> {
  const db = createPublicClient({ revalidate: 20 });
  const { data, error } = await db
    .from("tournament_matches")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true })
    .order("match_no", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicMatch[];
}