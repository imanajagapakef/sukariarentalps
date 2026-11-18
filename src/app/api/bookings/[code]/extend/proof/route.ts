import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentProofSchema } from "@/lib/validations/booking";
import { getBookingByCode } from "@/services/booking.service";
import { createPaymentProof, ProofError } from "@/lib/payment-proofs";
import { handleRouteError, jsonError, jsonRateLimited } from "@/lib/api/response";
import { hasBookingAccess } from "@/lib/booking-access";
import { notifyAdminChanged } from "@/lib/realtime-notify";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Bukti bayar untuk SATU perpanjangan (bukan total booking).
 *
 * Dipakai pelanggan yang memilih QRIS saat menambah jam: mereka membayar
 * nominal tambahan, mengunggah bukti, dan kasir memverifikasinya. Bukti tetap
 * dihitung sebagai klaim, bukan pelunasan — status pembayaran hanya berubah
 * lewat aksi kasir (atau otomatis saat check-out).
 *
 * Batasnya sama dengan tiket: cookie akses + rate limit, dan extension harus
 * milik booking ini serta masih CONFIRMED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;

    const limit = rateLimit("proofUpload", request, code);
    if (!limit.allowed) return jsonRateLimited(limit.retryAfterSeconds);

    if (!(await hasBookingAccess(code))) {
      return jsonError("Verifikasi tiket dulu sebelum mengunggah bukti pembayaran", 401);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return jsonError("Gunakan multipart/form-data", 400);
    }

    const extensionId = String(form.get("extension_id") ?? "").trim();
    if (!extensionId) return jsonError("Perpanjangan tidak ditemukan", 400);

    const parsed = paymentProofSchema.safeParse({
      nominal: form.get("nominal"),
      note: form.get("note") ?? undefined,
    });
    if (!parsed.success) return jsonError("Nominal tidak valid", 400);

    const file = form.get("proof");
    if (!(file instanceof File) || file.size === 0) {
      return jsonError("File bukti tidak ditemukan", 400);
    }

    const db = createAdminClient();
    const booking = await getBookingByCode(db, code);
    if (!booking) return jsonError("Booking tidak ditemukan", 404);

    const { data: extension } = await db
      .from("booking_extensions")
      .select("extension_id, booking_id, status, amount")
      .eq("extension_id", extensionId)
      .maybeSingle();

    if (!extension || extension.booking_id !== booking.booking_id) {
      return jsonError("Perpanjangan tidak ditemukan untuk booking ini", 404);
    }
    if (extension.status !== "CONFIRMED") {
      return jsonError("Perpanjangan ini sudah tidak aktif", 409);
    }

    // Nominal harus tepat sebesar nilai perpanjangan, supaya kasir tidak
    // mencocokkan angka yang tidak pernah diminta sistem.
    if (parsed.data.nominal !== extension.amount) {
      return jsonError(`Nominal harus tepat ${extension.amount} (biaya perpanjangan)`, 400);
    }

    const proof = await createPaymentProof(
      db,
      booking.booking_id,
      parsed.data.nominal,
      file,
      parsed.data.note,
      extension.extension_id,
    );

    notifyAdminChanged();

    return NextResponse.json(
      { proof_id: proof.proof_id, nominal: proof.nominal, created_at: proof.created_at },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ProofError) return jsonError(error.message, error.isClientError ? 400 : 500);
    return handleRouteError(error);
  }
}