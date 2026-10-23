import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertBranchScope, getStaffUser } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { tournamentActionSchema } from "@/lib/validations/tournament";
import {
  cancelRegistration,
  checkInRegistration,
  sendRegistrationNotifications,
  settleAtCounter,
} from "@/services/tournament.service";

/**
 * Registrations of one tournament, and the counter's actions on them.
 *
 * The four actions are the whole cashier workflow: take the fee (settle), mark the
 * player present (check_in), release a seat (cancel), and resend a message that failed.
 * Each one is a database function so the seat, the money row and the notification
 * cannot drift apart — and each one queues a WhatsApp message for the player.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { id } = await params;
    const db = createAdminClient();

    // Branch scope first: a cross-branch id answers 403, not a registration list.
    const { data: tournament } = await db
      .from("tournaments")
      .select("branch_id")
      .eq("tournament_id", id)
      .maybeSingle();
    if (!tournament) return jsonError("Turnamen tidak ditemukan", 404);
    assertBranchScope(profile, tournament.branch_id);

    const { data, error } = await db
      .from("tournament_registrations")
      .select(
        `registration_id, registration_code, name, phone, fee_amount, status, seed_number, payment_deadline_at, paid_at, checked_in_at, cancel_reason, notes, created_at`,
      )
      .eq("tournament_id", id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: payments } = await db
      .from("payments")
      .select(
        `payment_id, tournament_registration_id, method, status, gross_amount, paid_at`,
      )
      .in(
        "tournament_registration_id",
        (data ?? []).map((r) => r.registration_id),
      );

    return NextResponse.json({ registrations: data ?? [], payments: payments ?? [] });
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
    const parsed = tournamentActionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: { message: "Aksi tidak valid", issues: parsed.error.flatten() } },
        { status: 400 },
      );
    }

    const db = createAdminClient();

    // Branch scope: a STAFF profile can only run the cashier workflow of its
    // own branch's tournament, whatever the registration id points at.
    const { data: tournament } = await db
      .from("tournaments")
      .select("branch_id")
      .eq("tournament_id", tournamentId)
      .maybeSingle();
    if (!tournament) return jsonError("Turnamen tidak ditemukan", 404);
    assertBranchScope(profile, tournament.branch_id);

    const action = parsed.data;

    // The registration must belong to the tournament in the URL: otherwise a
    // mis-copied id could settle a seat on a different bracket.
    const { data: registration } = await db
      .from("tournament_registrations")
      .select("registration_id, tournament_id, name, registration_code, status")
      .eq("registration_id", action.registration_id)
      .maybeSingle();
    if (!registration) return jsonError("Pendaftaran tidak ditemukan", 404);
    if (registration.tournament_id !== tournamentId) {
      return jsonError("Pendaftaran ini bukan dari turnamen tersebut", 400);
    }

    let detail = "";
    switch (action.action) {
      case "settle": {
        const amount = await settleAtCounter(db, {
          registration_id: action.registration_id,
          method: action.method,
          createdBy: profile.user_id,
          notes: action.notes,
        });
        detail = `${action.method} ${amount}`;
        break;
      }
      case "check_in":
        await checkInRegistration(db, action.registration_id);
        detail = "check-in";
        break;
      case "cancel":
        await cancelRegistration(db, action.registration_id, action.reason);
        // A released seat can be sold again, so the card's counter has to catch up.
        await db.rpc("sync_tournament_quota", { p_tournament_id: tournamentId });
        detail = action.reason ?? "batal";
        break;
      case "resend_notification": {
        const result = await sendRegistrationNotifications(db, action.registration_id);
        detail = `kirim ulang: ${result.sent} terkirim, ${result.failed} gagal`;
        break;
      }
    }

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: `tournament_${action.action}`,
      entityType: "tournament_registrations",
      entityId: action.registration_id,
      reason: `${registration.registration_code} ${detail}`,
    });

    return NextResponse.json({ ok: true, detail });
  } catch (error) {
    return handleRouteError(error);
  }
}