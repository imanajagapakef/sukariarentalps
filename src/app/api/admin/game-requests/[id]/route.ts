import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { gameRequestPatchSchema } from "@/lib/validations/admin";

/**
 * Triage or remove a public game request.
 *
 * ADMIN/OWNER only. `/admin/games` is hidden from STAFF in the shell, but the route
 * enforces the same bar server-side rather than trusting the UI.
 *
 * Both verbs go through the service client because `game_requests` is deliberately
 * insert-only for the public (migration 0002 grants `anon` SELECT + INSERT, no UPDATE
 * or DELETE) — the customer form must not be able to rewrite or erase the wishlist.
 * `game_votes.request_id` is `on delete cascade`, so deleting a request takes its
 * votes with it and cannot leave a dangling `vote_count`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getStaffUser(["ADMIN", "OWNER"]);
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = gameRequestPatchSchema.safeParse({ ...(body ?? {}), request_id: id });
    if (!parsed.success || !parsed.data.status) return jsonError("Payload tidak valid", 400);

    const db = createAdminClient();
    const { data: before } = await db
      .from("game_requests")
      .select("status")
      .eq("request_id", id)
      .maybeSingle();
    if (!before) return jsonError("Request tidak ditemukan", 404);
    if (before.status === parsed.data.status) return NextResponse.json({ ok: true });

    const { error } = await db
      .from("game_requests")
      .update({ status: parsed.data.status })
      .eq("request_id", id);
    if (error) throw new Error(error.message);

    await audit(db, {
      actorId: actor.user_id,
      actorRole: actor.role,
      action: "game_request_update",
      entityType: "game_requests",
      entityId: id,
      before: { status: before.status } as never,
      after: { status: parsed.data.status } as never,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getStaffUser(["ADMIN", "OWNER"]);
    const { id } = await params;

    const db = createAdminClient();
    const { data: before } = await db
      .from("game_requests")
      .select("game_name, status, vote_count")
      .eq("request_id", id)
      .maybeSingle();
    if (!before) return jsonError("Request tidak ditemukan", 404);

    // Audit before the row disappears, so the trail keeps the name and the vote count.
    await audit(db, {
      actorId: actor.user_id,
      actorRole: actor.role,
      action: "game_request_delete",
      entityType: "game_requests",
      entityId: id,
      before: {
        game_name: before.game_name,
        status: before.status,
        vote_count: before.vote_count,
      } as never,
    });

    const { error } = await db.from("game_requests").delete().eq("request_id", id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
