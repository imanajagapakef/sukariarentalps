import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertBranchScope, getStaffUser } from "@/lib/authz";
import { getBookingByCode } from "@/services/booking.service";
import { audit } from "@/lib/audit";
import { handleRouteError, jsonError } from "@/lib/api/response";
import { notifyAdminChanged } from "@/lib/realtime-notify";

const paidSchema = z
  .object({ extension_id: z.string().trim().min(1).max(40) })
  .strict();

/**
 * Kasir menandai pembayaran perpanjangan lunas.
 *
 * Dipakai untuk pelanggan yang membayar QRIS/transfer lebih dulu: tanpa tombol
 * ini uangnya baru tercatat saat check-out, padahal kasir sudah mencocokkan
 * bukti dan mutasi. Idempoten — klik kedua tidak mengubah apa pun.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const profile = await getStaffUser();
    const { code } = await params;
    const parsed = paidSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError("Payload tidak valid", 400);

    const db = createAdminClient();
    const booking = await getBookingByCode(db, code);
    if (!booking) return jsonError("Booking tidak ditemukan", 404);
    assertBranchScope(profile, booking.branch_id);

    const { data: extension } = await db
      .from("booking_extensions")
      .select("extension_id, booking_id")
      .eq("extension_id", parsed.data.extension_id)
      .maybeSingle();

    if (!extension || extension.booking_id !== booking.booking_id) {
      return jsonError("Perpanjangan tidak ditemukan untuk booking ini", 404);
    }

    const { data: updated, error } = await db
      .from("payments")
      .update({ status: "PAID", paid_at: new Date().toISOString() })
      .eq("extension_id", parsed.data.extension_id)
      .eq("status", "PENDING")
      .select("payment_id");

    if (error) throw new Error(error.message);

    await audit(db, {
      actorId: profile.user_id,
      actorRole: profile.role,
      action: "booking_extension_paid",
      entityType: "booking_extensions",
      entityId: parsed.data.extension_id,
    });

    notifyAdminChanged();
    return NextResponse.json({ ok: true, updated: updated?.length ?? 0 });
  } catch (error) {
    return handleRouteError(error);
  }
}