import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";
import { AuthError, getStaffUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import {
  toIso,
  tournamentPatchSchema,
  tournamentSchema,
  tournamentSlug,
  type TournamentInput,
} from "@/lib/validations/tournament";
import { expireStaleRegistrations } from "@/services/tournament.service";

/**
 * Tournament admin.
 *
 * Reads every status, not just the public ones: a panel that hid a draft would make it
 * look as though the tournament did not exist, which is the confusion this page exists
 * to remove — same reasoning as /admin/promos.
 *
 * Loading also sweeps expired unpaid seats, so an admin who opens the list after lunch
 * sees the real seat count instead of yesterday's.
 */

export async function GET() {
  try {
    const profile = await getStaffUser();
    const db = createAdminClient();

    const swept = await expireStaleRegistrations(db);

    // STAFF browse and operate tournaments of their own branch only; the unbound
    // (OWNER/ADMIN) read every outlet. The detail queries (matches/registrations)
    // hold the other half of the fence: they 403 a cross-branch id instead of
    // resolving rows, so a stale page cannot ride the URL in.
    let listQuery = db
      .from("tournaments")
      .select(
        `tournament_id, slug, title, game_id, branch_id, poster_url, description, rules, prize, starts_at, registration_closes_at, registration_fee, list_price, quota, payment_window_minutes, status, created_at, updated_at`,
      );
    if (profile.role === "STAFF") {
      // fail-closed: STAFF scoping rides on branch_id — a null branch would
      // list every outlet's tournaments. Migration 0034 makes the state
      // impossible for new rows; the 403 is the tripwire for a corrupt or
      // historical row, not a default to the unscoped branch of the old code.
      if (!profile.branch_id) {
        throw new AuthError("Akun staff belum terikat cabang", 403);
      }
      listQuery = listQuery.eq("branch_id", profile.branch_id);
    }
    const { data: tournaments, error } = await listQuery.order("starts_at", {
      ascending: false,
    });
    if (error) throw new Error(error.message);

    const rows = tournaments ?? [];
    const ids = rows.map((t) => t.tournament_id);
    const registrationRows: { tournament_id: string; status: string; fee_amount: number }[] =
      ids.length
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

    return NextResponse.json({
      swept,
      tournaments: rows.map((t) => ({
        ...t,
        stats: byTournament.get(t.tournament_id) ?? { held: 0, paid: 0, revenue: 0 },
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

function toRow(input: TournamentInput, slug: string) {
  // starts_at is required by the schema, so toIso cannot return null here; asserting it
  // keeps the Insert type honest instead of loosening the column to nullable.
  const starts = toIso(input.starts_at) as string;
  return {
    title: input.title,
    slug,
    game_id: input.game_id || null,
    branch_id: input.branch_id,
    poster_url: input.poster_url || null,
    description: input.description || null,
    rules: input.rules || null,
    prize: input.prize || null,
    starts_at: starts,
    registration_closes_at: toIso(input.registration_closes_at || null),
    registration_fee: input.registration_fee,
    list_price: input.list_price ?? null,
    quota: input.quota,
    payment_window_minutes: input.payment_window_minutes,
    status: input.status,
  };
}

/** Slug from the title, uniquified the same way promoIdFrom() does for promos. */
async function uniqueSlug(db: ReturnType<typeof createAdminClient>, title: string): Promise<string> {
  const base = tournamentSlug(title);
  const { data: taken } = await db.from("tournaments").select("slug");
  const used = new Set(((taken ?? []) as { slug: string }[]).map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER", "ADMIN"]);
    const parsed = tournamentSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Data turnaround tidak valid", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();
    const slug = await uniqueSlug(db, parsed.data.title);
    const row = toRow(parsed.data, slug);

    const { data, error } = await db
      .from("tournaments")
      .insert(row)
      .select(
        `tournament_id, slug, title, game_id, branch_id, poster_url, description, rules, prize, starts_at, registration_closes_at, registration_fee, list_price, quota, payment_window_minutes, status, created_at, updated_at`,
      )
      .single();
    if (error) throw new Error(error.message);

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "tournament_create",
      entityType: "tournaments",
      entityId: data.tournament_id,
      reason: parsed.data.title,
      after: data as never,
    });

    return NextResponse.json({ tournament: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER", "ADMIN"]);
    const parsed = tournamentPatchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Data turnaround tidak valid", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const { tournament_id, ...fields } = parsed.data;
    const db = createAdminClient();

    const { data: before } = await db
      .from("tournaments")
      .select("*")
      .eq("tournament_id", tournament_id)
      .maybeSingle();
    if (!before) return jsonError("Turnamen tidak ditemukan", 404);

    const patch: Database["public"]["Tables"]["tournaments"]["Update"] = {};
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.game_id !== undefined) patch.game_id = fields.game_id || null;
    if (fields.branch_id !== undefined) patch.branch_id = fields.branch_id;
    if (fields.poster_url !== undefined) patch.poster_url = fields.poster_url || null;
    if (fields.description !== undefined) patch.description = fields.description || null;
    if (fields.rules !== undefined) patch.rules = fields.rules || null;
    if (fields.prize !== undefined) patch.prize = fields.prize || null;
    // starts_at is NOT NULL, so an unparseable datetime is skipped rather than written
    // as null: leaving the old value beats failing the whole save over one field.
    if (fields.starts_at !== undefined) {
      const starts = toIso(fields.starts_at);
      if (starts) patch.starts_at = starts;
    }
    if (fields.registration_closes_at !== undefined) {
      patch.registration_closes_at = toIso(fields.registration_closes_at || null);
    }
    if (fields.registration_fee !== undefined) patch.registration_fee = fields.registration_fee;
    if (fields.list_price !== undefined) patch.list_price = fields.list_price ?? null;
    if (fields.quota !== undefined) patch.quota = fields.quota;
    if (fields.payment_window_minutes !== undefined) {
      patch.payment_window_minutes = fields.payment_window_minutes;
    }
    if (fields.status !== undefined) patch.status = fields.status;

    const { data, error } = await db
      .from("tournaments")
      .update(patch)
      .eq("tournament_id", tournament_id)
      .select(
        `tournament_id, slug, title, game_id, branch_id, poster_url, description, rules, prize, starts_at, registration_closes_at, registration_fee, list_price, quota, payment_window_minutes, status, created_at, updated_at`,
      )
      .single();
    if (error) throw new Error(error.message);

    // A fee change must not reach players who already registered: their seat carries the
    // price they were shown (T6). Only the status needs a recount.
    await db.rpc("sync_tournament_quota", { p_tournament_id: tournament_id });

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "tournament_update",
      entityType: "tournaments",
      entityId: tournament_id,
      reason: Object.keys(patch).join(", "),
      before: before as never,
      after: data as never,
    });

    return NextResponse.json({ tournament: data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const profile = await getStaffUser(["OWNER", "ADMIN"]);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return jsonError("id query wajib diisi", 400);

    const db = createAdminClient();
    const { data: before } = await db
      .from("tournaments")
      .select("*")
      .eq("tournament_id", id)
      .maybeSingle();
    if (!before) return jsonError("Turnamen tidak ditemukan", 404);

    const { count: seats } = await db
      .from("tournament_registrations")
      .select("registration_id", { count: "exact", head: true })
      .eq("tournament_id", id)
      .in("status", ["WAITING_PAYMENT", "PAID", "CHECKED_IN"]);

    // Deleting a tournament with players in it would drop paid registrations silently.
    // The cancel action is the deliberate way to stop one, and it notifies everyone.
    if ((seats ?? 0) > 0) {
      return jsonError(
        `Masih ada ${seats} peserta yang belum dibatalkan. Batalkan pesertanya dulu.`,
        409,
        "HAS_REGISTRATIONS",
      );
    }

    const { error } = await db.from("tournaments").delete().eq("tournament_id", id);
    if (error) throw new Error(error.message);

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "tournament_delete",
      entityType: "tournaments",
      entityId: id,
      reason: before.title,
      before: before as never,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}