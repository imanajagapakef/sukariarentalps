import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertBranchScope, getStaffUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { tournamentMatchResultSchema } from "@/lib/validations/tournament";
import { buildBracket, reportMatchResult, resetBracket } from "@/services/tournament.service";

/**
 * Bracket control.
 *
 * Two moves: build it once the seats are paid, then type a score into a match. Both are
 * database functions, because seeding, byes and advancing a winner are exactly the kind
 * of thing that has to be consistent — and a draw has to stay a draw.
 */
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("build") }),
  z.object({ action: z.literal("reset") }),
  tournamentMatchResultSchema.extend({ action: z.literal("result") }),
]);

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { id } = await params;
    const db = createAdminClient();

    // Branch scope first: a cross-branch id answers 403, not a match list.
    const { data: tournament } = await db
      .from("tournaments")
      .select("branch_id")
      .eq("tournament_id", id)
      .maybeSingle();
    if (!tournament) return jsonError("Turnamen tidak ditemukan", 404);
    assertBranchScope(profile, tournament.branch_id);

    const { data, error } = await db
      .from("tournament_matches")
      .select("*")
      .eq("tournament_id", id)
      .order("round_no", { ascending: true })
      .order("match_no", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ matches: data ?? [] });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { id: tournamentId } = await params;
    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Aksi tidak valid", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();

    // Branch scope: a STAFF profile can only operate brackets of its own branch.
    const { data: tournament } = await db
      .from("tournaments")
      .select("branch_id")
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (!tournament) return jsonError("Turnamen tidak ditemukan", 404);
    assertBranchScope(profile, tournament.branch_id);

    if (parsed.data.action === "build") {
      const matches = await buildBracket(db, tournamentId);
      // A bracket exists to be played, so its arrival is the moment players need to know.
      await queueBracketNotice(db, tournamentId);
      await audit(db, {
        actorId: profile.user_id,
        actorRole: profile.role,
        action: "tournament_bracket_build",
        entityType: "tournaments",
        entityId: tournamentId,
        reason: `${matches} match`,
      });
      return NextResponse.json({ ok: true, matches });
    }

    if (parsed.data.action === "reset") {
      const cleared = await resetBracket(db, tournamentId);
      await audit(db, {
        actorId: profile.user_id,
        actorRole: profile.role,
        action: "tournament_bracket_reset",
        entityType: "tournaments",
        entityId: tournamentId,
        reason: `${cleared} match dihapus`,
      });
      return NextResponse.json({ ok: true, cleared });
    }

    // The match must belong to this tournament, so a stale page cannot report a score
    // into somebody else's bracket.
    const { data: match } = await db
      .from("tournament_matches")
      .select("match_id, tournament_id, round_no, match_no")
      .eq("match_id", parsed.data.match_id)
      .maybeSingle();
    if (!match) return jsonError("Match tidak ditemukan", 404);
    if (match.tournament_id !== tournamentId) {
      return jsonError("Match ini bukan dari turnamen tersebut", 400);
    }

    const status = await reportMatchResult(db, {
      match_id: parsed.data.match_id,
      score_a: parsed.data.score_a,
      score_b: parsed.data.score_b,
    });

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "tournament_match_result",
      entityType: "tournament_matches",
      entityId: parsed.data.match_id,
      reason: `R${match.round_no}M${match.match_no} ${parsed.data.score_a}-${parsed.data.score_b} -> ${status}`,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * Tell every seeded player their seed number.
 *
 * One read for phones and seeds together, then one insert per player into the same
 * queue the RPCs use — bounded by the quota, so it cannot become a write storm, and it
 * never blocks the score entry that triggered it.
 */
async function queueBracketNotice(db: ReturnType<typeof createAdminClient>, tournamentId: string) {
  const { data: regs } = await db
    .from("tournament_registrations")
    .select("phone, seed_number")
    .eq("tournament_id", tournamentId)
    .in("status", ["PAID", "CHECKED_IN"])
    .not("seed_number", "is", null);

  if (!regs || regs.length === 0) return;

  const { error } = await db.from("notifications").insert(
    regs.map((r) => ({
      recipient_type: "CUSTOMER" as const,
      recipient_ref: r.phone,
      channel: "WHATSAPP",
      template: "TOURNAMENT_BRACKET_READY",
      payload: { seed: r.seed_number ?? "" },
    })),
  );
  if (error) throw new Error(error.message);
}