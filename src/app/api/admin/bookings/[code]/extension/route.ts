import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertBranchScope, getStaffUser } from "@/lib/authz";
import {
  cancelExtension,
  extensionWindow,
  getExtensionInfo,
  listExtensions,
  requestExtension,
} from "@/services/extension.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { notifyAdminChanged } from "@/lib/realtime-notify";

const extendSchema = z
  .object({ minutes: z.coerce.number().int().min(60).max(360) })
  .strict();

const cancelSchema = z
  .object({ extension_id: z.string().trim().min(1).max(40), reason: z.string().trim().max(200).optional() })
  .strict();

/**
 * Perpanjangan dari sisi kasir.
 *
 * GET  — pilihan yang muat + riwayat extension, untuk dialog "Perpanjang".
 * POST — tambah jam (uang diterima di kasir: method CASH).
 * DELETE — batalkan extension terakhir (mis. pelanggan tidak jadi bayar).
 *
 * Semua validasi slot ada di RPC; route ini hanya menjaga otorisasi cabang,
 * audit, dan notifikasi realtime.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { code } = await params;
    const db = createAdminClient();

    const info = await getExtensionInfo(db, code);
    if (!info) return jsonError("Booking tidak ditemukan", 404);
    assertBranchScope(profile, info.branch_id);

    const window = extensionWindow(info);
    const extensions = await listExtensions(db, info.booking_id);

    return NextResponse.json({
      status: info.status,
      scheduled_end_at: info.scheduled_end_at,
      duration_minutes: info.duration_minutes,
      boundary: info.latest_extendable_at,
      minimum_minutes: info.config?.minimum_extension_minutes ?? 60,
      options: window.options,
      extensions,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { code } = await params;
    const parsed = extendSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Durasi perpanjangan tidak valid", 400);

    const db = createAdminClient();
    const info = await getExtensionInfo(db, code);
    if (!info) return jsonError("Booking tidak ditemukan", 404);
    assertBranchScope(profile, info.branch_id);

    const result = await requestExtension(db, info.booking_id, parsed.data.minutes, {
      method: "CASH",
      requestedBy: profile.user_id,
    });

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "booking_extend",
      entityType: "bookings",
      entityId: code,
      reason: `+${parsed.data.minutes} menit`,
    });

    notifyAdminChanged();
    return NextResponse.json({
      extension_id: result.extension_id,
      new_end_at: result.new_end_at,
      amount: result.amount,
      status: info.status,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { code } = await params;
    const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload tidak valid", 400);

    const db = createAdminClient();
    const info = await getExtensionInfo(db, code);
    if (!info) return jsonError("Booking tidak ditemukan", 404);
    assertBranchScope(profile, info.branch_id);

    await cancelExtension(db, parsed.data.extension_id, parsed.data.reason);

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "booking_extension_cancel",
      entityType: "booking_extensions",
      entityId: parsed.data.extension_id,
      reason: parsed.data.reason,
    });

    notifyAdminChanged();
    return NextResponse.json({ ok: true, status: info.status });
  } catch (error) {
    return handleRouteError(error);
  }
}